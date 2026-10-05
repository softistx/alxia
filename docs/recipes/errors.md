# Answer errors consistently

**The problem.** Errors come from everywhere: a request the schema refuses, a
body that is too large, a domain rule (out of stock, name taken), a bug. You
want one format a client can read, the 4xx that are the client's to fix told
clearly, and the 5xx that are yours to keep to yourself, a message never
leaking a connection string.

alxia has three tools, from the broadest to the most local:

1. **`alxia({ errors: 'problem' })`**: everything alxia answers on its own
   (a 400, a 404, a 405, a 413, a 500) becomes an
   [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) `application/problem+json`.
2. **`HttpError`**: throw it where you are, with the status, the problem's
   `type`, `detail` and extensions.
3. **A `try`/`catch` middleware**: map your domain's errors, and refusals, to
   whatever format you want, in one place.

```sh
bun add @alxia/core zod
```

## The app

```ts
// file: src/app.ts
import { alxia, defineMiddleware, HttpError, problem, refusalOf, validate } from '@alxia/core';
import { z } from 'zod';

class OutOfStock extends Error {
	constructor(readonly sku: string) {
		super(`No ${sku} left`);
	}
}

// 2. A domain error, mapped to a problem in one place. Behind it, a route
// throws `new OutOfStock(sku)` and knows nothing about HTTP.
const domainErrors = defineMiddleware(async (_ctx, next) => {
	try {
		return await next();
	} catch (error) {
		if (error instanceof OutOfStock) {
			return problem({
				type: 'https://example.com/problems/out-of-stock',
				status: 409,
				title: 'Out of stock',
				detail: error.message,
				sku: error.sku, // an extension member
			});
		}
		throw error; // not ours: the next middleware out, then the route boundary
	}
});

// 3. A refusal, answered in your own words. `refusalOf` reads a validation
// refusal or a body past its limit, and is undefined for any other error.
const refusals = defineMiddleware(async (_ctx, next) => {
	try {
		return await next();
	} catch (error) {
		const refusal = refusalOf(error);
		if (refusal?.kind !== 'validation') throw error; // a 413, or a bug: the default
		return problem({
			type: 'https://example.com/problems/invalid-request',
			status: 422,
			detail: `The ${refusal.part} is invalid`,
			errors: refusal.issues.map((issue) => ({ path: issue.path, message: issue.message })),
		});
	}
});

const stock = new Map([
	['kettle', 1],
	['teapot', 0],
]);

function reserve(sku: string): void {
	if (!stock.get(sku)) throw new OutOfStock(sku); // knows nothing of HTTP
}

export const app = alxia({ errors: 'problem' }) // 1. alxia's own answers are problems
	.use(domainErrors)
	.get('/stock/:sku', ({ params, reply }) => {
		const left = stock.get(params.sku);
		if (left === undefined) {
			// HttpError: the status, the body for errors: 'json', the problem for 'problem'.
			throw new HttpError(404, { error: 'no_such_sku' }, {
				type: 'https://example.com/problems/no-such-sku',
				detail: `No stock is kept for ${params.sku}`,
				extensions: { sku: params.sku },
			});
		}
		return reply(200, { sku: params.sku, left });
	})
	.post('/orders', ({ reply }) => {
		reserve('teapot');
		return reply(201, { ok: true });
	})
	.get('/crash', () => {
		throw new Error('postgres://admin:secret@db/prod is down');
	})
	// The refusals middleware stands before the routes that validate, to see their refusals.
	.use(refusals)
	.post('/users', validate({ body: z.object({ name: z.string().min(1) }) }), ({ body, reply }) => reply(201, body));
```

What each one answers, and what stays private:

| Request | Status | Body |
| --- | --- | --- |
| `GET /stock/none` | 404 | a problem, `type` and `detail` as thrown, `sku` an extension, `instance: "/stock/none"` |
| `POST /orders` | 409 | the domain problem, with `sku` |
| `POST /users` with `{}` | 422 | your format, one `errors` entry per issue |
| `GET /nowhere`, `PUT /users` | 404, 405 | alxia's problems; `Allow` on the 405 |
| `GET /crash` | 500 | `The server failed to answer the request`: the error is logged, never sent |

In development (`NODE_ENV=development`) a 500 also carries its
`stack`, and a 404 a `hint`: that never ships.

```ts
// file: src/app.spec.ts
import { expect, test } from 'bun:test';
import { app } from './app';

const json = (body: unknown): RequestInit => ({
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify(body),
});

test('an HttpError is a problem with its extensions', async () => {
	const response = await app.request('/stock/none');
	expect(response.status).toBe(404);
	expect(response.headers.get('content-type')).toBe('application/problem+json');
	expect(await response.json()).toMatchObject({
		type: 'https://example.com/problems/no-such-sku',
		title: 'Not Found',
		status: 404,
		instance: '/stock/none',
		sku: 'none',
	});
});

test('a domain error is mapped by the middleware', async () => {
	const response = await app.request('/orders', json({}));
	expect(response.status).toBe(409);
	expect(await response.json()).toMatchObject({ title: 'Out of stock', sku: 'teapot' });
});

test('a refusal is answered in the app’s own format', async () => {
	const response = await app.request('/users', json({}));
	expect(response.status).toBe(422);
	expect(await response.json()).toMatchObject({ errors: [{ path: ['name'] }] });
});

test('a bug is a 500 that says nothing of it', async () => {
	const response = await app.request('/crash');
	expect(response.status).toBe(500);
	expect(JSON.stringify(await response.json())).not.toContain('postgres');
});

test('a method the path does not allow is a 405 problem with Allow', async () => {
	const response = await app.request('/users', { method: 'PUT' });
	expect(response.status).toBe(405);
	expect(response.headers.get('allow')).toContain('POST');
});
```

## Declare the problems in the document

If the API is [spec first](spec-first-crud.md), declare the problem bodies in
`openapi.yaml` so the generated client reads them, and set the generator's
`validationErrors: false`, since alxia's 400 becomes a problem too. The
`Problem` and `ValidationProblem` schemas are in
[the errors guide](../../packages/core/docs/guide/errors.md#declaring-problems-in-the-openapi-document),
and as types in `@alxia/core` for a test that reads one:

```ts no-check
import type { ValidationProblem } from '@alxia/core';

const body = (await response.json()) as ValidationProblem;
expect(body.issues[0]?.path).toEqual(['login']);
```

## Other packages' answers

`@alxia/jwt`'s 401, and `@alxia/janus`'s refusals, follow the app's format
when it is `errors: 'problem'`. `@alxia/rate-limit`'s 429 and the static
files' 404 keep their own bodies. A GraphQL resolver's error stays GraphQL's:
an entry of `errors[]` inside a 200 ([GraphQL](graphql-api.md)).

## Reference

- [Errors and problem details](../../packages/core/docs/guide/errors.md):
  what alxia answers on its own, `HttpError`'s options, `errorFormat` and
  `problemOf` for a middleware of your own
- [Answering a refusal or an error](../../packages/core/docs/guide/middleware.md#answering-a-refusal-or-an-error),
  [refusals in your own format](../../packages/core/docs/guide/routes.md#refusals-in-your-own-format)
- [Replies: `problem()`](../../packages/core/docs/guide/replies.md#problem-details-problem)
- [`@alxia/core` troubleshooting](../../packages/core/docs/troubleshooting.md#responses):
  each answer, by its body
