# @alxia/openapi

OpenAPI spec first for [`@alxia/core`](https://www.npmjs.com/package/@alxia/core).
The OpenAPI document is the source:
[`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen)'s
`alxia` option generates each operation as `{ method, path, schema }`,
`@alxia/core`'s `app.route(operation, ...middlewares, handler)` binds a
handler to it, and this package's `implemented` and `matchesSpec` check
that the app routes every operation of the document, and only those. A
route the document declares and nobody wrote fails a test, not a client.

```sh
bun add -d @alxia/openapi typescript
bun add -d --exact @nxgt/openapi-codegen
bun add zod
```

`@alxia/core` and `typescript` are its peers; `@alxia/core` is the app's
own dependency. `@nxgt/openapi-codegen` writes the operations, and the code
it writes imports `zod` (4.5.4 or later) at runtime. For a check at startup
rather than in a test, install `@alxia/openapi` without `-d`.

`bun create @alxia my-api --template api` starts a project wired this way.

## Spec first, end to end

Write `openapi.yaml` — here with a `listTodos` and a `createTodo`
operation — then point the generator at it:

```ts
// openapi-codegen.config.ts
import { defineConfig } from '@nxgt/openapi-codegen';

export default defineConfig({
	input: 'openapi.yaml',
	output: 'src/generated',
	alxia: true, // writes src/generated/alxia.ts
	validationErrors: false, // alxia sends its own 400: declare it in the spec
});
```

```sh
bunx nxgt-openapi generate # writes src/generated/, alxia.ts included
```

Bind each operation to its handler, with the middlewares it needs:

```ts
// src/app.ts
import { alxia, defineMiddleware } from '@alxia/core';
import { operations } from './generated/alxia';
import type { Todo } from './generated/types';

const requireKey = defineMiddleware(({ request, reply }, next) =>
	request.headers.get('x-api-key') === Bun.env['API_KEY']
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
	});
```

And check the app against the same operations:

```ts
// src/app.spec.ts
import { test } from 'bun:test';
import { matchesSpec } from '@alxia/openapi';
import { app } from './app';
import { operations } from './generated/alxia';

test('routes every operation of openapi.yaml, and nothing else', () => {
	matchesSpec(app, operations);
});
```

The [spec-first guide](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/spec-first.md)
walks through every step: the document, alxia's own 400, middlewares,
committing the generated files, and a client from the same document.

## Every operation has a route

```ts
import { implemented } from '@alxia/openapi';

implemented(app, operations); // routes the app serves beside the spec are fine
```

When some are missing, it throws, naming each by method, path and operation id:

```text
TypeError: implemented(): 2 operations have no route: GET /pets/:petId (getPet), QUERY /employees (searchEmployees)
```

## Only the operations

```ts
import { matchesSpec } from '@alxia/openapi';

matchesSpec(app, operations, {
	exclude: (route) => route.path === '/health',
});
```

`matchesSpec` throws as `implemented` does, and also lists each route no
operation declares, `exclude` aside:

```text
TypeError: matchesSpec(): 1 operation has no route: GET /pets/:petId (getPet); 1 route has no operation: POST /admin/reset
```

## Under a prefix

`app.routes` holds full paths. For `alxia({ prefix: '/api' })`, say so, and
each operation is looked up under it:

```ts
implemented(app, operations, { prefix: '/api' });
```

## Routes with middlewares

`app.route(operation, ...middlewares, handler)` checks every reply with a
status the operation declares, a middleware's too, and validates the request
just before the handler, or where `validate(operation)` stands. The checks
match such a route as any other, by method and path:

```ts
import { alxia, validate } from '@alxia/core';
import { operations } from './generated/alxia';

// requireKey, todos: as above
export const app = alxia()
	.route(operations.listTodos, ({ reply }) => reply.ok(todos))
	.route(
		operations.createTodo,
		requireKey, // first: an anonymous client gets its 401 before the body is read
		validate(operations.createTodo),
		({ body, reply }) => reply.created({ id: todos.length + 1, title: body.title, done: false }),
	);
```

Put the key check before `validate(...)`: auth first, so an anonymous client
gets no body parsed, up to `bodyLimit`, and no validation issues back, which
would reveal the schema.

## How a route is matched

- by method and path, as `app.routes` holds them: groups, plugins and the
  prefix included
- by the path's shape, the core's `shapeOf`: a `GET /pets/:id` serves the
  `GET /pets/:petId` operation, as the router matches them alike
- a `HEAD` operation is served by the `GET` route, as the core serves it
- operations as an object, named by their keys (`operations` of `alxia.ts`),
  or as a list, named by `schema.detail.operationId` when they have one
- socket routes (`app.ws`) are not read: an OpenAPI operation is HTTP

It reads `app.routes` and nothing else: it sends no request, and checks no
schema.

## Traps

- `validationErrors` defaults to `true`, which declares in the client-facing
  files a 400 alxia never sends: set `validationErrors: false` and declare
  alxia's `{ error: 'validation', issues }` in the spec.
- The generator does not turn `security` into a middleware: write one with
  `defineMiddleware` and give it to `route(operation, auth, handler)`.
- In `@nxgt/openapi-codegen` 0.6.0, a `cookie` parameter makes the generator
  refuse the whole document: read the cookie in a middleware instead.

## Coming from `@alxia/openapi` 0.3 or `@alxia/openapi-routes`

**`@alxia/openapi` 0.1 to 0.3** was another package: it wrote a document
from the app's routes (`openapi`, `docs`, `toJsonSchema`). It is retired,
since the document now comes first, and 0.4 has none of its exports. Save
the document it served, the app's `/openapi.json`, as the starting point
of your own (the generator reads JSON as well as YAML), generate the
operations from it, and bind the routes with `app.route()`.

**`@alxia/openapi-routes`** is this package under its former name: the same
functions, options and messages.

```sh
bun remove @alxia/openapi-routes
bun add -d @alxia/openapi
```

```ts
// before
import { implemented, matchesSpec } from '@alxia/openapi-routes';
// after
import { implemented, matchesSpec } from '@alxia/openapi';
```

The core's side of the move is in its
[upgrading notes](https://github.com/softistx/alxia/blob/develop/packages/core/docs/upgrading.md#no-more-client-spec-first).

## API

| export | |
| --- | --- |
| `implemented(app, operations, options?)`, `ImplementedOptions` | throws a `TypeError` listing each operation with no route, or one with the core's reason for an operation path no route may be declared at. `prefix` |
| `matchesSpec(app, operations, options?)`, `MatchesSpecOptions` | the same, and each route no operation declares. `prefix`, `exclude` |
| `exactly`, `ExactlyOptions` | deprecated: `matchesSpec` and `MatchesSpecOptions` under their former names, with messages that start `exactly():` |
| `Operations` | what both take: an object of core's `RouteOperation`, or a list of them |

## Documentation

- [Documentation index](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/README.md): every page, and when to read it.
- [Spec first](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/spec-first.md): the whole workflow, from `openapi.yaml` to the generated operations, the routes, the check and a client.
- [The checks](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/checks.md): `implemented` and `matchesSpec`, how a route is matched, the prefix, and the routes to exclude.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/troubleshooting.md): each message of the checks and the generator, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/roadmap.md): what is coming, and what is not planned.
