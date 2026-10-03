# @alxia/openapi-routes

Checks that an [`@alxia/core`](https://www.npmjs.com/package/@alxia/core)
app routes every operation of an OpenAPI document, and, if you ask, only
those. Each operation is the `{ method, path, schema }` that
`app.route(operation, handler)` takes, as
[`@nxgt/openapi-codegen`](https://github.com/softistx/nxgt-http/tree/develop/packages/openapi-codegen)'s
`alxia` option writes them into `alxia.ts` (that option is not in a
published release yet; a list of operations written by hand works today).
A route the document declares and nobody wrote fails a test, not a client.

```sh
bun add -d @alxia/openapi-routes
bun add -d typescript
```

`@alxia/core` is its peer: the app's own dependency. For a check at
startup rather than in a test, install it without `-d`.

## Every operation has a route

```ts
// app.spec.ts
import { test } from 'bun:test';
import { implemented } from '@alxia/openapi-routes';
import { app } from './app';
import { operations } from './generated/alxia';

test('every operation of the spec is served', () => {
	implemented(app, operations);
});
```

When some are not, it throws, naming each by method, path and operation id:

```text
TypeError: implemented(): 2 operations have no route: GET /pets/:petId (getPet), QUERY /employees (searchEmployees)
```

## Only the operations

```ts
import { matchesSpec } from '@alxia/openapi-routes';

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

## API

| export | |
| --- | --- |
| `implemented(app, operations, options?)`, `ImplementedOptions` | throws a `TypeError` listing each operation with no route, or one with the core's reason for an operation path no route may be declared at. `prefix` |
| `matchesSpec(app, operations, options?)`, `MatchesSpecOptions` | the same, and each route no operation declares. `prefix`, `exclude` |
| `exactly`, `ExactlyOptions` | deprecated: `matchesSpec` and `MatchesSpecOptions` under their former names, with messages that start `exactly():` |
| `Operations` | what both take: an object of core's `RouteOperation`, or a list of them |

## Documentation

- [Guide](https://github.com/softistx/alxia/blob/develop/packages/openapi-routes/docs/guide.md): where to call the checks, the prefix, what counts as a route, and the routes to exclude.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/openapi-routes/docs/troubleshooting.md): each message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/openapi-routes/docs/roadmap.md): what is coming, and what is not planned.
- [From an OpenAPI document](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/from-a-document.md), in `@alxia/openapi`'s docs: the whole flow, from the spec to the generated operations, the routes and these checks.
