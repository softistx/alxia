# Roadmap

What `@alxia/openapi` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/openapi/CHANGELOG.md).

## Now

- **The spec-first `@alxia/openapi`.** The OpenAPI document is the source:
  `@nxgt/openapi-codegen`'s `alxia` option generates the operations,
  `@alxia/core`'s `app.route(operation, ...middlewares, handler)` binds
  them, and `implemented` and `matchesSpec` check the app against them.
  The package that was `@alxia/openapi-routes` now carries this name.
  The docs cover the whole workflow, from the document to the generated
  operations, routes with middlewares, the check and a client.
- **The deprecated names removed.** `@alxia/openapi-routes`, the
  re-export package, is gone, with `exactly` and `ExactlyOptions`, the
  aliases of `matchesSpec` and `MatchesSpecOptions`: import
  `implemented` and `matchesSpec` from `@alxia/openapi`, same options and
  messages. Ships as 0.5.0.

## Next

- **A client from the document, in this package.** Today you bring your own
  generator, `@nxgt/openapi-codegen`'s `paths.ts` with openapi-fetch for
  one ([Spec first](guide/spec-first.md#5-a-client-from-the-same-document)).
  A client generated here, from the same document, is the direction; it is
  not designed yet.

## Later

Nothing scheduled yet.

## Not planned

- **Generating the document from the app.** That was `@alxia/openapi` 0.1
  to 0.3, now retired: with the document written first, a second document
  derived from the routes would be a second source of truth.
- **Checking the schemas.** The checks read each route's method and path.
  A route declared with `app.route(operation, ...middlewares, handler)`
  takes its schemas from the operation itself, so they cannot differ; a
  route written by hand is the app's to keep in step.
- **Registering the routes.** `app.route(operation, ...middlewares,
  handler)` is in `@alxia/core`, where it keeps the chain that types the
  app.
- **A runtime dependency.** `@alxia/openapi` declares no dependency, only
  `@alxia/core`, whose types it reads, and `typescript` as peers.

## Shipped

Before 0.4.0, the name `@alxia/openapi` (0.1.0 to 0.3.0) belonged to a
different package, which wrote a document from the app's routes; it is
retired. The releases below are this package's, under its former name,
`@alxia/openapi-routes`.

### `@alxia/openapi` 0.5.0

- **API docs, with no configuration.** `app.plugin(apiDocs({ spec:
  'openapi.yaml' }))` serves an interactive page (Scalar, or Swagger UI) at
  `/docs` and the document at `/docs/openapi.yaml` and `.json`. The page
  loads from a pinned CDN version with an integrity hash, sets its own
  `Content-Security-Policy`, and `matchesSpec` leaves its routes out.

### `@alxia/openapi-routes` 0.2.0

Removed in 0.5: `matchesSpec` from `@alxia/openapi` is its name.

- **One name for the check both ways.** `matchesSpec(app, operations)`,
  the new name of `exactly`, which stayed as a deprecated alias until 0.5.

### `@alxia/openapi-routes` 0.1.0

Removed in 0.5: `implemented` and `matchesSpec` from `@alxia/openapi`
are these checks.

- **Every operation has a route.** `implemented(app, operations)` throws,
  listing each operation of the document that the app does not serve, by
  method, path and operation id.
- **Only the operations.** `exactly(app, operations)` also lists each route
  the document does not declare; `exclude` leaves out the ones it should
  not, such as a health check.
- **The generated shape.** Both take the `operations` object
  `@nxgt/openapi-codegen`'s `alxia` option writes, or a list of operations,
  typed as `@alxia/core`'s `RouteOperation`; `prefix` looks them up under
  the app's prefix.
