# Spec first

This page takes an API from its OpenAPI document to routes that serve it,
a test that holds them to it, and a client generated from the same file.

```ts
import { alxia } from '@alxia/core';
import { operations } from './generated/alxia'; // generated from openapi.yaml

export const app = alxia().route(operations.getTodo, ({ params, reply }) =>
	params.id === 1 // a number: the spec types the path parameter
		? reply.ok({ id: 1, title: 'Write the spec', done: true })
		: reply.notFound({ error: 'not_found' as const }),
);
```

| Step | Who | What it gives |
| --- | --- | --- |
| [1. Write the document](#1-write-the-document) | you | the contract: operations, bodies, replies, alxia's 400 |
| [2. Generate](#2-generate-the-operations) | `@nxgt/openapi-codegen` 0.7.0, `alxia: true` | `src/generated/alxia.ts`: each operation as `{ method, path, schema }` |
| [3. Bind the routes](#3-bind-the-routes) | `@alxia/core`'s `app.route()` | the handlers, typed by the spec, with their middlewares |
| [4. Check](#4-check-the-app-against-the-spec) | `@alxia/openapi`'s `matchesSpec` | a failing test while an operation has no route |
| [5. A client](#5-a-client-from-the-same-document) | the generator of your choice | the other side of the contract |

`bun create @alxia my-api --template api` does the first four, and its
generated `paths.ts` is ready for step 5; this page is what that project
holds, explained.

## 1. Write the document

OpenAPI 3.1 or 3.2, YAML or JSON. Give each operation an `operationId`: it
names the generated constant.

```yaml
# openapi.yaml (excerpt)
paths:
  /todos/{id}:
    get:
      operationId: getTodo
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }
      responses:
        "200":
          description: The todo
          content: { application/json: { schema: { $ref: "#/components/schemas/Todo" } } }
        "400": { $ref: "#/components/responses/ValidationError" }
        "404":
          description: No todo has this id
          content: { application/json: { schema: { $ref: "#/components/schemas/NotFound" } } }
```

### Declare alxia's own 400

A request the schemas refuse is answered by alxia, not by your handler, with
`400 { error: 'validation', issues }`. Declare that body once and refer to
it from each operation that takes a parameter or a body, so a client
generated from the document knows it:

```yaml
components:
  responses:
    ValidationError:
      description: alxia's own 400, for a request the schemas refuse
      content: { application/json: { schema: { $ref: "#/components/schemas/ValidationError" } } }
  schemas:
    ValidationError:
      type: object
      required: [error, issues]
      properties:
        error: { type: string, enum: [validation] }
        issues: { type: array, items: { $ref: "#/components/schemas/ValidationIssue" } }
    ValidationIssue:
      type: object
      required: [target, path, code, message]
      properties:
        target: { type: string, enum: [params, query, headers, cookies, body] }
        path: { type: array, items: { anyOf: [{ type: string }, { type: integer }] } }
        code: { type: string }
        message: { type: string }
```

An app that answers refusals in its own format, with a middleware that
catches them around `await next()`, declares that format instead:

```ts
import { alxia, problem, refusalOf } from '@alxia/core';

const app = alxia().use(async (_ctx, next) => {
	try {
		return await next();
	} catch (error) {
		const refusal = refusalOf(error);
		if (refusal === undefined) throw error;
		return problem({ status: 400, detail: `the ${refusal.part} is invalid` });
	}
});
```

## 2. Generate the operations

```ts
// openapi-codegen.config.ts
import { defineConfig } from '@nxgt/openapi-codegen';

export default defineConfig({
	input: 'openapi.yaml',
	output: 'src/generated',
	alxia: true,
	validationErrors: false,
});
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `input` | `string` | — | the document, relative to the config file |
| `output` | `string` | `'generated/openapi'` | the folder the files are written to |
| `alxia` | `boolean` | `false` | also writes `alxia.ts`, the operations `app.route()` takes |
| `validationErrors` | `boolean` | `true` | `true` declares `@nxgt/openapi-hono`'s 400, `{ status, message, timestamp, issues }`, in `types.ts`, `zod.ts`, `operations.ts` and `paths.ts`. alxia never sends that body, so a client generated from them expects the wrong 400. `false` keeps the spec's own 400, the one declared above |

`alxia.ts` never carries the `validationErrors` 400, whichever way it is
set; the client-facing files do. Every other option is in the generator's
[options guide](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-codegen/docs/guide/options.md).

`bunx nxgt-openapi generate` writes `types.ts`, `zod.ts`, `operations.ts`, `paths.ts`
and `alxia.ts`. `alxia.ts` holds one `as const` constant per operation,
named by its `operationId`, then `operations`, all of them:

```ts
// src/generated/alxia.ts (excerpt). Generated: do not edit.
export const getTodo = {
	method: 'GET',
	path: '/todos/:id', // '/todos/{id}' in the spec
	schema: {
		params: z.object({ id: numeric.pipe(z.int().min(1)) }), // read from the path's text
		response: { 200: zTodo, 400: zValidationError, 404: zNotFound },
		detail: { operationId: 'getTodo', summary: 'One todo' },
	},
} as const;

export const operations = { listTodos, createTodo, getTodo } as const;
```

`params`, `query`, `headers` and `body` are the request's schemas,
`response` a schema per status, `detail` the operation's `operationId`,
`summary`, `tags` and `deprecated`. The generator's
[`alxia.ts` page](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-codegen/docs/guide/generated-code.md#alxiats)
details each part.

### Commit `src/generated/`, and check it in CI

Commit the generated files: the project then builds with no generation
step, offline and in Docker. `--check` writes nothing and exits 1 when the
files are not what the document gives, so drift fails CI:

```json
{
	"scripts": {
		"generate": "nxgt-openapi generate",
		"verify": "bun run generate --check && bun run typecheck && bun test"
	}
}
```

Pin `@nxgt/openapi-codegen` exactly (`bun add -d --exact @nxgt/openapi-codegen`):
another release may write the files differently, and `--check` would then
fail until you generate again. Keep your linter and formatter off
`src/generated/`.

## 3. Bind the routes

`app.route(operation, ...middlewares, handler)` declares the route the
operation describes. The handler's `params`, `query`, `headers`, `body` and
`reply` are typed by the spec; a status the spec does not declare does not
compile.

```ts
// src/app.ts
import { alxia, defineMiddleware } from '@alxia/core';
import { operations } from './generated/alxia';
import type { Todo } from './generated/types';

const apiKey = Bun.env['API_KEY'] ?? 'dev-key';

// The spec's `security` is not generated: authentication is a middleware.
const requireKey = defineMiddleware(({ request, reply }, next) =>
	request.headers.get('x-api-key') === apiKey
		? next()
		: reply(401, { error: 'unauthorized' as const }),
);

const todos: Todo[] = [];

export const app = alxia()
	.route(operations.listTodos, ({ reply }) => reply.ok(todos))
	.route(operations.createTodo, requireKey, ({ body, reply }) => {
		const todo = { id: todos.length + 1, title: body.title, done: false };
		todos.push(todo);
		return reply.created(todo);
	})
	.route(operations.getTodo, ({ params, reply }) => {
		const todo = todos.find(({ id }) => id === params.id);
		return todo ? reply.ok(todo) : reply.notFound({ error: 'not_found' as const });
	});
```

The operation's schema runs as two middlewares the route adds itself, just
before the handler:

- **a `validate` of its request.** So `requireKey` answers a stranger 401
  before his body is read. Place `validate(operation)` among the
  middlewares to validate earlier; the route then runs no other.
- **a `responds` of its responses, after it.** The handler's reply is
  checked against the schema of its status, which must be one the
  operation declares; a body the schema refuses is a 500. A middleware's
  own reply, `requireKey`'s 401 above, is sent as it is. Place
  `responds(operation)` among the middlewares to check the replies of
  those after it too, `requireKey`'s against the spec's `Unauthorized`;
  the route then runs no other.

```ts
import { alxia, responds, validate } from '@alxia/core';

// requireKey's 401 is checked against the spec's Unauthorized
const checked = alxia().route(
	operations.createTodo,
	responds(operations.createTodo),
	requireKey,
	({ body, reply }) => reply.created({ id: todos.length + 1, title: body.title, done: false }),
);
```

```ts
// a bad body gets its 400 before anyone is asked for a key
const strict = alxia().route(
	operations.createTodo,
	validate(operations.createTodo),
	requireKey,
	({ body, reply }) => reply.created({ id: todos.length + 1, title: body.title, done: false }),
);
```

Middlewares before the `validate` read `params` as strings and `body` as
`undefined`. The core's
[routes as data](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/routes.md#routes-as-data-route)
and [middleware](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/middleware.md#where-validate-stands)
guides have the detail.

## 4. Check the app against the spec

Nothing above notices an operation with no route: the app compiles, and the
request gets a 404. `matchesSpec` does, from the same `operations`. It does not mind a route the
document lacks (a health check, a proxied route); `strict: true` does:

```ts
// src/app.spec.ts
import { expect, test } from 'bun:test';
import { matchesSpec } from '@alxia/openapi';
import { app } from './app';
import { operations } from './generated/alxia';

test('routes every operation of openapi.yaml', () => {
	matchesSpec(app, operations);
});

test("answers alxia's 400, as the spec declares it", async () => {
	const response = await app.request('/todos/first');
	expect(response.status).toBe(400);
	expect((await response.json()).error).toBe('validation');
});
```

```text
TypeError: matchesSpec(): 1 operation has no route: GET /todos/:id (getTodo)
```

[The checks](checks.md) covers `implemented`, `exclude`, and
calling the check at startup. Prefixes are in [matching.md](matching.md#under-a-prefix).

## 5. A client from the same document

alxia generates no client: the document is the contract, and any OpenAPI
client works against it. The same run of `@nxgt/openapi-codegen` already
wrote `operations.ts`, the table [`@nxgt/openapi-httpyz`](https://www.npmjs.com/package/@nxgt/openapi-httpyz)
binds onto an [`@nxgt/httpyz`](https://www.npmjs.com/package/@nxgt/httpyz)
client, and `paths.ts`, in openapi-typescript's shape, for a client that
reads it:

```sh
bun add @nxgt/httpyz @nxgt/openapi-httpyz
```

```ts
import { createHttpClient } from '@nxgt/httpyz';
import { createOpenApiClient } from '@nxgt/openapi-httpyz';
import { operations } from './generated/operations';

const api = createOpenApiClient(
  createHttpClient({ baseUrl: 'http://localhost:3000' }),
  operations,
);
const reply = await api.get('/todos/{id}', { param: { id: 1 } });
// reply.status: 200 | 400 | 404, and reply.data narrowed by it
```

With `validationErrors: false`, the 400 a client is typed by is the one the
spec declares, the one alxia sends. In another project, generate from the
same `openapi.yaml`. A test calls the app through the same client, in
process: [Testing with the generated client](testing.md).

## What the generator leaves out (0.7.0)

| In the document | What happens | Do instead |
| --- | --- | --- |
| `security` | not generated | a middleware, as `requireKey` above |
| a `cookie` parameter in the client files | left out of `types.ts`, `zod.ts`, `operations.ts` and `paths.ts`, with an `ignored` warning: only `alxia.ts` validates it, as `cookies` | nothing: read `cookies` in the handler or a middleware |
| server-sent events whose data is text, or with no `itemSchema` naming them | the operation is left out of `alxia.ts`, with an `ignored` warning | give each event's data a JSON `contentSchema`, or declare the route by hand, with `eventStream({ ... })` from `@alxia/core` |
| a `TRACE`, a binary body, a binary, JSON Lines or form reply, a path alxia cannot route | left out, with an `ignored` warning | declare the route by hand, if you serve it |

An operation left out is not in `operations`, so the checks do not know it:
read the generator's warnings. Each message is in
[Troubleshooting](../troubleshooting.md#generator).

## The types

```ts
// @alxia/core: what alxia.ts holds, and app.route() takes, with at most 8 middlewares
interface RouteOperation {
	readonly method: Method; // 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'QUERY'
	readonly path: RoutePath; // `/${string}`, with :name parameters
	readonly schema?: RouteSchema; // params, query, headers, cookies, body, response, detail
}
```

The signatures of the checks are in [The checks](checks.md#the-signatures).
