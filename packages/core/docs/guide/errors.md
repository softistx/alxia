# Errors and problem details

This page covers the answers alxia gives on its own — an error that
escapes a route, a refused request, a 500, a path no route serves — and
how to make them [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)
problem details with one option: `alxia({ errors: 'problem' })`.

```ts
import { alxia, HttpError, validate } from '@alxia/core';
import { z } from 'zod';

const app = alxia({ errors: 'problem' })
	.post('/users', validate({ body: z.object({ login: z.string() }) }), ({ body }) => {
		if (taken.has(body.login)) {
			throw new HttpError(409, { error: 'taken' }, {
				type: 'https://example.com/problems/login-taken',
				detail: `${body.login} is taken`,
				extensions: { login: body.login },
			});
		}
		// …
	});
```

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{"type":"https://example.com/problems/login-taken","title":"Conflict","status":409,
 "detail":"ada is taken","instance":"/users","login":"ada"}
```

## What alxia answers on its own

| Answer | `errors: 'json'`, the default | `errors: 'problem'` |
| --- | --- | --- |
| an `HttpError` no middleware catches | its `status` and `body` | its `status`, a problem of its `type`, `title`, `detail` and `extensions` |
| a refused request (`ValidationError`) | 400 `{ error: 'validation', issues }` | 400 problem, `issues` an extension |
| a body past `bodyLimit` (`ContentTooLargeError`) | 413 `{ error: 'content_too_large', limit }` | 413 problem, `limit` an extension |
| any other error | 500 `{ error: 'internal' }`, logged | 500 problem, logged; nothing of the error is sent |
| a path no route serves | 404 `{ error: 'not_found' }` | 404 problem |
| a method the path does not allow | 405 `{ error: 'method_not_allowed' }`, `Allow` | 405 problem, `Allow` |
| a socket route asked without an upgrade | 426 `{ error: 'upgrade_required' }` | 426 problem |

A problem always carries the five members RFC 9457 defines, typed by
`Problem<Status, Extensions>`:

| Member | Value |
| --- | --- |
| `type` | the error's `type`; `about:blank` by default, a problem the status says all of |
| `title` | the error's `title`; the status's reason phrase by default (`Not Found`, `Content Too Large`) |
| `status` | the response's status |
| `detail` | the error's `detail`; for alxia's own answers, what went wrong (`No route serves GET /nowhere`, `The request's body is invalid`); the `title` when none is given |
| `instance` | the request's path, never its query |

Extension members come after them and never replace one: an extension
named `status` is dropped. The 500 says `The server failed to answer the
request` and nothing more: the error is logged, never sent — outside dev.

In dev (`alxia({ dev })`, on only when `NODE_ENV` is `development`)
both formats say more: the router's 404 and 405 carry a `hint` — `"did you
mean GET /todos/:id?"`, `"/todos/1 allows GET, DELETE"` — and a 500 its
`stack`, as a member of the body or an extension of the problem, or, to a
browser, an HTML page of the error
([Development](development.md#the-dev-switch)).

The format is the **serving app's**: a plugin's routes, a group's, a
`defineRoutes` file's, are answered in the format of the app that serves
the request, and a plugin app's own `errors` option is not read.

## `HttpError` and its problem

```ts no-check
new HttpError(status, body, options?: string | HttpErrorOptions)
```

| Option | Default | Effect |
| --- | --- | --- |
| `message` | `HTTP <status>` | the error's message, for the logs; never sent |
| `type` | `about:blank` | the problem's `type`, a URI naming the kind of problem |
| `title` | the reason phrase | the problem's `title` |
| `detail` | the `title` | the problem's `detail`, about this occurrence |
| `extensions` | none | the problem's other members |
| `cause` | none | `Error`'s `cause` |

A string as the third argument is the message, as before 0.5. The `body`
is what `errors: 'json'` sends; under `errors: 'problem'` the problem is
made of the options and the `body` is not sent, so give both while an app
may run in either format:

```ts
throw new HttpError(404, { error: 'no_user' }, { detail: `No user ${id}` });
```

## A middleware's own error: `errorFormat` and `problemOf`

A middleware that answers an error itself — a guard, a quota — reads the
app's format with `errorFormat(ctx)`, and builds the problem with
`problemOf(ctx, init)`, which fills `type`, `title`, `detail` and
`instance` as alxia does and keeps every other member of `init` as an
extension. `problem(body, init?)` sends it as `application/problem+json`
([Replies](replies.md#problem-details-problem)):

```ts
import { defineMiddleware, errorFormat, problem, problemOf } from '@alxia/core';

const quota = defineMiddleware<{ plan: { left: number } }>()((ctx, next) => {
	if (ctx.plan.left > 0) return next();
	return errorFormat(ctx) === 'problem'
		? problem(problemOf(ctx, { status: 429, detail: 'The plan is over its quota', left: 0 }))
		: ctx.reply(429, { error: 'quota' as const });
});
```

`@alxia/jwt`'s 401 and `@alxia/janus`'s answers — `janusErrors()`, a
required `session()`, `permission()` — follow the format this way. The
other packages keep their own bodies: `@alxia/rate-limit`'s 429, the
static files' 404 and 416.

## Declaring problems in the OpenAPI document

alxia is spec first: declare the problem bodies in `openapi.yaml`, and the
client generated from it reads them. A `Problem` schema, and the 400's
`ValidationProblem` on top of it:

```yaml
components:
  schemas:
    Problem:
      type: object
      description: An RFC 9457 problem, as alxia sends it under errors 'problem'.
      required: [type, title, status, detail, instance]
      properties:
        type: { type: string, description: 'A URI naming the kind of problem; about:blank by default.' }
        title: { type: string }
        status: { type: integer }
        detail: { type: string }
        instance: { type: string, description: The request's path. }
      additionalProperties: true
    ValidationProblem:
      allOf:
        - $ref: '#/components/schemas/Problem'
        - type: object
          required: [issues]
          properties:
            issues:
              type: array
              items:
                type: object
                required: [target, path, code, message]
                properties:
                  target: { type: string, enum: [params, query, headers, cookies, body] }
                  path: { type: array, items: { oneOf: [{ type: string }, { type: integer }] } }
                  code: { type: string }
                  message: { type: string }
  responses:
    Problem:
      description: The request failed.
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    ValidationProblem:
      description: The request, as the server refused it.
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/ValidationProblem' }
```

Each operation then references them:

```yaml
paths:
  /users:
    post:
      operationId: createUser
      responses:
        '201': { $ref: '#/components/responses/User' }
        '400': { $ref: '#/components/responses/ValidationProblem' }
        '409': { $ref: '#/components/responses/Problem' }
```

In TypeScript the same bodies are `Problem`, `ValidationProblem` and
`ContentTooLargeProblem`, for a test that reads one:

```ts
import type { ValidationProblem } from '@alxia/core';

const body = (await response.json()) as ValidationProblem;
expect(body.issues[0]?.path).toEqual(['login']);
```

### With `@nxgt/openapi-codegen`

The `alxia` emitter never declares the 400 alxia answers itself, so the
server's generated types are the same in both formats. Its
`validationErrors` option — on by default — declares that 400 on every
operation for the **client**, as `{ error: 'validation', issues }` sent as
`application/json`: a client that checks its replies would refuse the
problem. Under `errors: 'problem'`, turn it off and declare the 400 in the
document as above:

```ts
// openapi-codegen.config.ts
export default defineConfig({
	input: 'openapi.yaml',
	alxia: true,
	validationErrors: false, // the document declares the 400: ValidationProblem
});
```

The `api` template of `bun create @alxia` already sets `validationErrors:
false`.

## GraphQL

`@alxia/graphql` answers GraphQL's errors in GraphQL's own format: a
resolver's error is an entry of `errors[]`, inside a 200, as the GraphQL
over HTTP specification says — problem details do not apply to it. What
`errors: 'problem'` changes is the HTTP layer around the endpoint: a 401
of `@alxia/jwt`'s `bearer()` before it, a body past its `bodyLimit`, a
500 of a middleware, a 405 at its path.

## Making it the default

`errors: 'json'` stays the default through 0.5, so no app changes format
by upgrading. A later release may make `problem` the default; an app that
wants its bodies kept then says `errors: 'json'`, which every release
keeps accepting. To be ready, set `errors: 'problem'` now, declare the
problems in the document, and give each `HttpError` a `detail`.

## See also

- [Replies](replies.md#problem-details-problem): `problem()`, for a
  handler's own problem replies.
- [Routes and validation](routes.md): `validate`, `bodyLimit`, and
  `refusalOf` for a refusal answered in a format of your own.
- [Middleware](middleware.md): where an error is answered, and `settle`.
- [Troubleshooting](../troubleshooting.md#responses): each answer by its
  body.
