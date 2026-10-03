# Roadmap

What `@alxia/openapi-routes` gives an app, and what is coming. This page is
a direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/openapi-routes/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **Checking the schemas.** The checks read each route's method and path.
  A route declared with `app.route(operation, handler)` takes its schemas
  from the operation itself, so they cannot differ; a route written by hand
  is the app's to keep in step.
- **Registering the routes.** `app.route(operation, handler)` is in
  `@alxia/core`, where it keeps the chain that types the app.
- **A runtime dependency.** `@alxia/openapi-routes` declares no dependency,
  only `@alxia/core`, whose types it reads, and `typescript` as peers.

## Shipped

### 0.1.0

- **Every operation has a route.** `implemented(app, operations)` throws,
  listing each operation of the document that the app does not serve, by
  method, path and operation id.
- **Only the operations.** `exactly(app, operations)` also lists each route
  the document does not declare; `exclude` leaves out the ones it should
  not, such as a health check or the document's own route.
- **The generated shape.** Both take the `operations` object
  `@nxgt/openapi-codegen`'s `alxia` option writes, or a list of operations,
  typed as `@alxia/core`'s `RouteOperation`; `prefix` looks them up under
  the app's prefix.
