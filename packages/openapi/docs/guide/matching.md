# How routes are matched

The checks match an operation to a route by method and path, and handle special cases like prefixes and middleware-declared routes.

## How a route is matched

An operation is served by a route of the same method and path:

- **The path's shape.** A parameter's name does not count:
  `app.get('/pets/:id', …)` serves the operation `GET /pets/:petId`, since
  the router sends them the same requests. Both are compared by
  `shapeOf` from `@alxia/core`, the function the router uses itself. As in the router, a parameter
  is a whole `:name` segment, and an operation path with a `:` anywhere
  else, such as `/at/10:45`, throws the core's `TypeError`, as declaring a
  route there would. The route's handler still reads
  `params.id`, not `params.petId`; declaring it with
  `app.route(api.getPet, …)` keeps the spec's names and schemas.
- **`HEAD`.** The core answers `HEAD` with the `GET` route, so a `HEAD`
  operation is served by a `GET` route at its path. `matchesSpec` still lists
  that `GET` route, as `extra` or under `strict`, when no operation declares it.
- **Every other method stands alone.** A `POST /employees` route does not
  serve a `QUERY /employees` operation.
- **An `all` route serves no operation.** `app.all('/api/*', proxy(url))`
  answers every method, but declares none of the document's: it is listed
  as `ALL /api/*`, in `extra` or under `strict`, and an operation under its
  path still needs a route of its own method. Leave it out of `strict`
  with `exclude: (route) => route.method === 'ALL'`.
- **Socket routes are not read.** `app.ws` routes live in `app.sockets`,
  and an OpenAPI operation is HTTP: `matchesSpec` never lists them.

Only the method and the path are compared. A route declared with
`app.route(operation, ...middlewares, handler)` reads its schemas from the operation, so
they cannot differ from the spec's; one written by hand is the app's to
keep in step.

## Under a prefix

`app.routes` holds full paths, so an app made with `alxia({ prefix: '/api' })`
serves `api.getPet` at `GET /api/pets/:petId`. The operations are written
without it, as the document's paths are. Give the prefix, and each operation
is looked up under it, joined by the core's own `joinPath` (`/` under `/api`
is `/api`):

```ts
const app = alxia({ prefix: '/api' }).route(api.getPet, getPet);

implemented(app, api, { prefix: '/api' });
```

Write the prefix as the app's: a leading `/` and no trailing one. `'api'`
[does not compile](../troubleshooting.md#type-pets-is-not-assignable-to-type-string), and `'/api/'` throws
[`implemented(): the prefix "/api/" must start with "/" and not end with one`](../troubleshooting.md#typeerror-implemented-the-prefix--must-start-with--and-not-end-with-one).

The messages then name the full paths, `GET /api/pets/:petId (getPet)`,
since those are what the app is missing. For operations served under a
group, `alxia().group('/v1', …)`, give the group's prefix the same way. A
call takes one prefix: check each group's operations in a call of their
own, and use `matchesSpec` only when every route of the app is under that
prefix, or, under `strict`, excluded.
