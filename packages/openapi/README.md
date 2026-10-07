# @alxia/openapi

OpenAPI spec first for [`@alxia/core`](https://www.npmjs.com/package/@alxia/core).
The OpenAPI document is the source:
[`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen)'s
`alxia` option generates each operation as `{ method, path, schema }`,
`@alxia/core`'s `app.route(operation, ...middlewares, handler)` binds a
handler to it, and this package's `implemented` and `matchesSpec` check
that the app routes every operation of the document (and, with
`strict: true`, only those). A route the document declares and nobody wrote
fails a test, not a client.

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

test('routes every operation of openapi.yaml', () => {
	matchesSpec(app, operations);
});
```

The [spec-first guide](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/spec-first.md)
walks through every step: the document, alxia's own 400, middlewares,
committing the generated files, and a client from the same document.

## API docs

`apiDocs` serves the document and an interactive page for it, with no
configuration. The page loads from a CDN, with a pinned version and a
subresource integrity hash, so nothing is added to your dependencies.

```ts
import { alxia } from '@alxia/core';
import { apiDocs } from '@alxia/openapi';
import spec from '../openapi.yaml'; // Bun imports YAML, and bundles it

const app = alxia().plugin(apiDocs({ spec }));
// GET /docs                  the page (Scalar)
// GET /docs/openapi.yaml     the document
// GET /docs/openapi.json     the same, as JSON
```

`spec` is the document as an object — imported, as above, so `bun build`
bundles it and an image that holds `dist/` alone still serves it — or a
path to a YAML or JSON file, read once at startup from the working
directory. Options: `path` (`/docs`), `ui` (`'scalar'` or `'swagger'`),
`title`, `servers` (replaces the document's) and `enabled`. The document is
public unless you guard it: to serve it in development alone, read the
environment at runtime, with `Bun.env` —
`apiDocs({ spec, enabled: Bun.env.NODE_ENV === 'development' })` —
never `process.env.NODE_ENV`, which `bun build` replaces with the mode of
the build; to keep it behind a login, give the guard to `use('/docs', …)`
before the plugin. The page sets its own `Content-Security-Policy`, which
`secureHeaders` keeps, and `matchesSpec` leaves its routes out. The
[guide](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/api-docs.md)
has the options, the policy, a guarded page, and `apiDocs` beside a GraphQL
endpoint.

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

const { extra } = matchesSpec(app, operations);
```

`matchesSpec` throws as `implemented` does: on each operation with no route,
and so on a route of another method or path. A route no operation declares
(a proxied one, a health check, a hand-written one) does not fail; it is
returned as `extra`, `[{ method, path }]`, so a test can assert on it. An
`app.all(path, …)` route serves no operation, and is listed as
`{ method: 'ALL', path }`.

For a spec that must be exhaustive, pass `strict: true`: each route no
operation declares fails too, `exclude` aside. The routes of `apiDocs()`
and the probes of `@alxia/core`'s `health()` are left out already:

```ts
matchesSpec(app, operations, {
	strict: true,
	exclude: (route) => route.path === '/metrics',
});
```

```text
TypeError: matchesSpec(): 1 operation has no route: GET /pets/:petId (getPet); 1 route has no operation: POST /admin/reset
```

Upgrading from before this check was lenient: to keep the old check, pass
`strict: true`.

## Under a prefix

```ts
implemented(app, operations, { prefix: '/api' });
```

For details about prefixes and how routes are matched, see [matching.md](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/matching.md#under-a-prefix). The checks read `app.routes` and nothing else: they send no request, and check no schema.

## Routes with middlewares

`app.route(operation, ...middlewares, handler)` validates the request and
checks the handler's reply just before the handler, or where
`validate(operation)` and `responds(operation)` stand. A middleware's own
reply, such as an auth's 401, is sent as it is. The checks match such a
route as any other, by method and path:

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

## Traps

- `validationErrors` defaults to `true`, which declares in the client-facing
  files a 400 alxia never sends: set `validationErrors: false` and declare
  alxia's `{ error: 'validation', issues }` in the spec.
- The generator does not turn `security` into a middleware: write one with
  `defineMiddleware` and give it to `route(operation, auth, handler)`.
- In `@nxgt/openapi-codegen` 0.7.0, a `cookie` parameter is validated as
  `cookies` by `alxia.ts` alone: the client files leave it out with an
  `ignored` warning, since a client does not set cookies. A cookie that is a
  list or an object fails the run.

## Coming from `@alxia/openapi` 0.3 or `@alxia/openapi-routes`

**`@alxia/openapi` 0.1 to 0.3** was another package: it wrote a document
from the app's routes (`openapi`, `docs`, `toJsonSchema`). It is retired,
since the document now comes first, and 0.4 has none of its exports. Save
the document it served, the app's `/openapi.json`, as the starting point
of your own (the generator reads JSON as well as YAML), generate the
operations from it, and bind the routes with `app.route()`.

**`@alxia/openapi-routes`** was this package under its former name, and is
removed from the repository. Move to `@alxia/openapi`: the same
functions, options and messages, except that `exactly` and `ExactlyOptions`,
its deprecated aliases of `matchesSpec` and `MatchesSpecOptions`, are gone
at 0.5.

```sh
bun remove @alxia/openapi-routes
bun add -d @alxia/openapi
```

```ts no-check
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
| `matchesSpec(app, operations, options?)`, `MatchesSpecOptions`, `MatchesSpecReport` | the same, and returns `{ extra }`, the routes no operation declares; `apiDocs()`'s and `@alxia/core`'s `health()` probes left out; under `strict: true` the rest throw instead. `prefix`, `strict`, `exclude` |
| `apiDocs(options)`, `ApiDocsOptions`, `DocsUi`, `DocsServer` | a plugin: the page at `path`, the document at `path/openapi.yaml` and `.json`. `spec`, `path`, `ui`, `title`, `servers`, `enabled` |
| `isApiDocsRoute(route)` | whether `apiDocs` declared a route, given any `{ handler }` (`Pick<RouteDefinition, 'handler'>`, as core's `isHealthRoute`); `matchesSpec` leaves them out already |
| `Operations` | what both take: an object of core's `RouteOperation`, or a list of them |

## Documentation

- [Documentation index](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/README.md): every page, and when to read it.
- [Spec first](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/spec-first.md): the whole workflow, from `openapi.yaml` to the generated operations, the routes, the check and a client.
- [Testing with the generated client](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/testing.md): `@nxgt/openapi-httpyz` over `app.fetch`, in process, typed by the spec.
- [API docs](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/api-docs.md): `apiDocs`, its options, the Content-Security-Policy, and beside a GraphQL endpoint.
- [The checks](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/checks.md): `implemented` and `matchesSpec`, and the routes to exclude.
- [How routes are matched](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/matching.md): the path's shape, prefixes, and special cases.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/troubleshooting.md): each message of the checks and the generator, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/roadmap.md): what is coming, and what is not planned.
- [Recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md): [A spec-first CRUD API](https://github.com/softistx/alxia/blob/develop/docs/recipes/spec-first-crud.md), [Test an alxia app](https://github.com/softistx/alxia/blob/develop/docs/recipes/testing.md), [Answer errors consistently](https://github.com/softistx/alxia/blob/develop/docs/recipes/errors.md).
