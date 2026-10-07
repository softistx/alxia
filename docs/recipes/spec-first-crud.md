# A spec-first CRUD API

**The problem.** You want an HTTP API whose contract is written once, in an
OpenAPI document, and holds everywhere: the server validates each request
against it and checks each reply, a test fails when a route is missing or
extra, a client is typed from it, and its documentation page is served by
the app. Nothing is written twice.

This is the `api` template of `bun create @alxia my-api --template api`,
taken one step further, with every operation of a CRUD. The shape:

```text
openapi.yaml ──generate──▶ src/generated/  ──▶ route(operation, handler)
     │                       alxia.ts: operations     │
     │                       operations.ts: the client's table
     ├──▶ matchesSpec(app, operations)   a test: no operation without a route
     └──▶ apiDocs({ spec })              the page and the document, served
```

```sh
bun add @alxia/core @alxia/env zod
bun add -d @alxia/openapi @nxgt/openapi-codegen @nxgt/httpyz @nxgt/openapi-httpyz typescript
```

## 1. The contract

The document is the source. Edit it first, then regenerate.

```yaml
# file: openapi.yaml
openapi: 3.1.0
info:
  title: Todos
  version: 0.1.0
paths:
  /todos:
    get:
      operationId: listTodos
      responses:
        '200':
          description: The todos, oldest first
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Todo' }
    post:
      operationId: createTodo
      security: [{ apiKey: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/NewTodo' }
      responses:
        '201':
          description: The todo, created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Todo' }
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
  /todos/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: integer, minimum: 1 }
    get:
      operationId: getTodo
      responses:
        '200':
          description: The todo
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Todo' }
        '400': { $ref: '#/components/responses/ValidationError' }
        '404': { $ref: '#/components/responses/NotFound' }
    patch:
      operationId: updateTodo
      security: [{ apiKey: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/TodoChanges' }
      responses:
        '200':
          description: The todo, changed
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Todo' }
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
    delete:
      operationId: deleteTodo
      security: [{ apiKey: [] }]
      responses:
        '204': { description: The todo is gone }
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
components:
  securitySchemes:
    apiKey: { type: apiKey, in: header, name: x-api-key }
  responses:
    ValidationError:
      description: alxia's own 400, for a request the schemas refuse
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ValidationError' }
    Unauthorized:
      description: No x-api-key header, or not the key
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Unauthorized' }
    NotFound:
      description: No todo has this id
      content:
        application/json:
          schema: { $ref: '#/components/schemas/NotFound' }
  schemas:
    Todo:
      type: object
      required: [id, title, done]
      properties:
        id: { type: integer }
        title: { type: string }
        done: { type: boolean }
    NewTodo:
      type: object
      required: [title]
      properties:
        title: { type: string, minLength: 1 }
    TodoChanges:
      type: object
      properties:
        title: { type: string, minLength: 1 }
        done: { type: boolean }
    Unauthorized:
      type: object
      required: [error]
      properties:
        error: { type: string, enum: [unauthorized] }
    NotFound:
      type: object
      required: [error]
      properties:
        error: { type: string, enum: [not_found] }
    ValidationError:
      type: object
      required: [error, issues]
      properties:
        error: { type: string, enum: [validation] }
        issues:
          type: array
          items:
            type: object
            required: [target, path, code, message]
            properties:
              target: { type: string, enum: [params, query, headers, cookies, body] }
              path:
                type: array
                items: { anyOf: [{ type: string }, { type: integer }] }
              code: { type: string }
              message: { type: string }
```

The 400 is declared in the document because alxia answers it itself, with
`{ error: 'validation', issues }`, for a request the operation's schemas
refuse. `validationErrors: false` tells the generator not to declare another:

```ts
// file: openapi-codegen.config.ts
import { defineConfig } from '@nxgt/openapi-codegen';

export default defineConfig({
	input: 'openapi.yaml',
	output: 'src/generated',
	alxia: true, // writes alxia.ts: each operation, as route() takes it
	validationErrors: false, // the document declares alxia's 400
});
```

```sh
bunx nxgt-openapi generate   # src/generated/: types, Zod schemas, paths.ts, alxia.ts
```

Commit `src/generated/`: the project builds with no generation step, and
`bunx nxgt-openapi generate --check` in CI fails when it drifts from the
document.

## 2. The routes

`context.ts` is what every route reads, here the store. Registering it lets
the routes file read it with no import of the app.

```ts
// file: src/context.ts
import { alxia } from '@alxia/core';
import type { Todo } from './generated/types';

const todos: Todo[] = []; // your database
let lastId = 0;

export const base = alxia().decorate({ todos, nextId: () => ++lastId });

declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}
```

Each `route(operation, …middlewares, handler)` takes its method, path and
schemas from the document. The request is validated just before the handler,
which reads `body` and `params` typed by it, and the handler's reply is
checked against the document's responses: answering a status the operation
does not declare, or a body it does not describe, is a compile error.

```ts
// file: src/routes/todos.ts
import { defineMiddleware, defineRoutes } from '@alxia/core';
import { operations } from '../generated/alxia';

// A 401 before the body is read. The document declares it for each write.
const requireKey = defineMiddleware(({ request, reply }, next) =>
	request.headers.get('x-api-key') === (Bun.env['API_KEY'] ?? 'dev-key')
		? next()
		: reply(401, { error: 'unauthorized' as const }),
);

export const todoRoutes = defineRoutes()
	.route(operations.listTodos, ({ todos, reply }) => reply.ok(todos))
	.route(operations.createTodo, requireKey, ({ body, todos, nextId, reply }) => {
		const todo = { id: nextId(), title: body.title, done: false };
		todos.push(todo);
		return reply.created(todo);
	})
	.route(operations.getTodo, ({ params, todos, reply }) => {
		const todo = todos.find(({ id }) => id === params.id); // params.id: number
		return todo ? reply.ok(todo) : reply.notFound({ error: 'not_found' as const });
	})
	.route(operations.updateTodo, requireKey, ({ params, body, todos, reply }) => {
		const todo = todos.find(({ id }) => id === params.id);
		if (!todo) return reply.notFound({ error: 'not_found' as const });
		Object.assign(todo, body);
		return reply.ok(todo);
	})
	.route(operations.deleteTodo, requireKey, ({ params, todos, reply }) => {
		const index = todos.findIndex(({ id }) => id === params.id);
		if (index < 0) return reply.notFound({ error: 'not_found' as const });
		todos.splice(index, 1);
		return reply.noContent();
	});
```

```ts
// file: src/app.ts
import { apiDocs } from '@alxia/openapi';
import spec from '../openapi.yaml'; // bundled into dist/: the image needs no openapi.yaml beside it
import { base } from './context';
import { todoRoutes } from './routes/todos';

export const app = base
	.plugin(todoRoutes)
	// GET /docs, /docs/openapi.yaml and /docs/openapi.json: in development and
	// under test alone, off wherever it is deployed (NODE_ENV unset included)
	.plugin(apiDocs({ spec, enabled: ['development', 'test'].includes(Bun.env['NODE_ENV'] ?? '') }));
```

```ts
// file: src/server.ts
import { app } from './app';

// listen handles SIGINT and SIGTERM: in-flight requests finish, then it exits.
app.listen({ port: Number(Bun.env['PORT'] ?? 3000) });
```

## 3. Prove it

`matchesSpec` fails while an operation has no route, or a route has another
method or path than its operation. A route the document lacks does not fail,
and comes back as `extra`; pass `{ strict: true }` to fail on it too, where
`apiDocs`'s routes and `health()`'s are left out by themselves.
The client is [`@nxgt/openapi-httpyz`](https://www.npmjs.com/package/@nxgt/openapi-httpyz)
over [`@nxgt/httpyz`](https://www.npmjs.com/package/@nxgt/httpyz), bound to
the generated `operations.ts`, and its `fetch` is the app's: every call is in
process, no server, and a test that no longer matches the document stops
compiling. A reply is a union narrowed on its status, so `reply.data` is the
`Todo` once the status is 201, and a status the document does not declare
for the operation throws. Any OpenAPI client works here, since the document
is the contract.

```ts
// file: src/app.spec.ts
import { expect, test } from 'bun:test';
import { matchesSpec } from '@alxia/openapi';
import { createHttpClient } from '@nxgt/httpyz';
import { createOpenApiClient } from '@nxgt/openapi-httpyz';
import { app } from './app';
import { operations as routes } from './generated/alxia';
import { operations } from './generated/operations';

const http = createHttpClient({
	baseUrl: 'http://alxia.test', // only has to be a URL: nothing is sent to it
	fetch: (request) => app.fetch(request),
	headers: { 'x-api-key': 'dev-key' },
});
const api = createOpenApiClient(http, operations);
// The client checks a request against the document before it sends it; this
// one does not, to see the server refuse what the document forbids.
const raw = createOpenApiClient(http, operations, { validate: { request: false } });

test('routes every operation of openapi.yaml', () => {
	matchesSpec(app, routes);
});

test('creates, reads, changes and deletes a todo', async () => {
	const created = await api.op('createTodo', { json: { title: 'Write a route' } });
	if (created.status !== 201) throw new Error(`got a ${created.status}`);
	const id = created.data.id; // narrowed: data is the Todo
	const changed = await api.op('updateTodo', { param: { id }, json: { done: true } });
	expect(changed.data).toEqual({ id, title: 'Write a route', done: true });
	const found = await api.get('/todos/{id}', { param: { id } });
	expect(found.data).toMatchObject({ done: true });
	expect((await api.delete('/todos/{id}', { param: { id } })).status).toBe(204);
	expect((await api.get('/todos/{id}', { param: { id } })).status).toBe(404);
});

test('a write without the key is a 401, before the body is read', async () => {
	const reply = await raw.op('createTodo', { json: { title: '' } }, { headers: { 'x-api-key': 'wrong' } });
	expect(reply.status).toBe(401);
	expect(reply.data).toEqual({ error: 'unauthorized' });
});

test('what the client cannot send needs app.request', async () => {
	// `id: "first"` does not compile in the client; the app answers it with a 400.
	const response = await app.request('/todos/first');
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ error: 'validation', issues: [{ target: 'params' }] });
});

test('the document is served', async () => {
	expect((await app.request('/docs')).status).toBe(200);
	expect(await (await app.request('/docs/openapi.yaml')).text()).toContain('operationId: listTodos');
});
```

## Change the API

1. Edit `openapi.yaml`.
2. `bunx nxgt-openapi generate`. A new operation is now in `operations`, and
   `matchesSpec` fails until it has a route.
3. Add `.route(operations.newOne, …)` to the routes file. The types of its
   `body`, `params`, `query` and `reply` come from the document.
4. `bun test`.

## Reference

- [Spec first, end to end](../../packages/openapi/docs/guide/spec-first.md),
  [`matchesSpec` and `implemented`](../../packages/openapi/docs/guide/checks.md),
  [testing with the generated client](../../packages/openapi/docs/guide/testing.md),
  [`apiDocs`](../../packages/openapi/docs/guide/api-docs.md)
- [Routes and validation](../../packages/core/docs/guide/routes.md),
  [replies](../../packages/core/docs/guide/replies.md),
  [groups and plugins](../../packages/core/docs/guide/groups-and-plugins.md)
- [Errors as problem details](errors.md): `errors: 'problem'` changes the 400
  the document declares
- [Authentication](authentication.md): a bearer guard in place of the key
- [The `api` template](../../packages/create/docs/guide.md)
