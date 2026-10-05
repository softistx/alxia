# @alxia/openapi

From 0.4.0, `@alxia/openapi` is the spec-first package that was
`@alxia/openapi-routes`: its releases up to 0.2.0, below, were published
under that name. The `@alxia/openapi` of 0.1.0 to 0.3.0, which wrote an OpenAPI
document from an app's route schemas, is retired; its changelog is
[in the repository's history](https://github.com/softistx/alxia/blob/3f80253/packages/openapi/CHANGELOG.md).

## 0.5.1

### Patch Changes

- Updated dependencies [[`137c5c8`](https://github.com/softistx/alxia/commit/137c5c8b618b961674c63a6242568e6b800939ab)]:
  - @alxia/core@0.6.0

## 0.5.0

### Minor Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `apiDocs`: an interactive page (Scalar, or Swagger UI) and the OpenAPI document served by the app, with no configuration: `import spec from '../openapi.yaml'` then `app.plugin(apiDocs({ spec }))` answers `GET /docs`, `GET /docs/openapi.yaml` and `GET /docs/openapi.json`. `spec` is the document as an object — imported, so `bun build` bundles it and an image holding `dist/` alone serves it — or a YAML or JSON file, read once at startup from the working directory; `path`, `ui`, `title`, `servers` and `enabled` are options (`enabled: Bun.env.NODE_ENV === 'development'` for development alone: `process.env.NODE_ENV` is inlined by `bun build`). The document is public unless guarded: `use('/docs', guard)` before the plugin keeps it behind a login. The page loads from a CDN at a pinned version with an integrity hash and sets its own `Content-Security-Policy`, which `secureHeaders` keeps: scripts and styles from that version's folder alone, requests to the app and to the origins of the document's absolute `servers` alone, framed by no one. Scalar's AI agent, MCP generator, share-and-deploy developer tools and telemetry are off. `matchesSpec` leaves its routes out, and `isApiDocsRoute(route)` says whether a route is one, typed as `isHealthRoute` (`Pick<RouteDefinition, 'handler'>`).

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `matchesSpec` leaves out the probes of `@alxia/core`'s `health()` — `/health` and `/ready`, wherever mounted, told apart by `isHealthRoute` — as it does the routes of `apiDocs()`: no `exclude` is needed for them.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Remove `exactly` and `ExactlyOptions`, the deprecated aliases of `matchesSpec` and `MatchesSpecOptions`. Use `matchesSpec`; its messages start `matchesSpec():` instead of `exactly():`.

### Patch Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs are organised around tasks. Each README and docs index links the new "Start in 5 minutes" and the recipes of the repository (authentication, a spec-first CRUD, a GraphQL API, file uploads, SSE and WebSockets, testing, errors, health and shutdown, caching and rate limiting, deploying), whose code is type-checked. `@alxia/core`'s README names the four templates of `bun create @alxia`. `@alxia/redis`'s roadmap gains its 0.2.0 entry and says which release removed `app.plugin(idempotency(…))`, and its troubleshooting entry for a handle that wires nothing carries `@nxgt/redis` 0.5's whole message. The tables of contents of the `@alxia/env` and `@alxia/janus` troubleshooting pages link the right headings.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - For `@alxia/core`'s dev comfort: `apiDocs` is marked with `markFactory` as making a plugin, so `plugin(apiDocs)` throws where it is declared, `plugin(): argument 1 looks like a factory (apiDocs): call it, plugin(apiDocs())`.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The spec-first guide shows the single middleware form of `@alxia/core` 0.5.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: a guide to testing with the generated client (openapi-fetch over `app.fetch`), and a troubleshooting entry.
- Updated dependencies [[`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787)]:
  - @alxia/core@0.5.0

## 0.4.1

### Patch Changes

- [#135](https://github.com/softistx/alxia/pull/135) [`3c00925`](https://github.com/softistx/alxia/commit/3c00925eead5f8409d23f1920ac07f92fbe72c00) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the generator notes now describe `@nxgt/openapi-codegen` 0.7.0, which validates cookie parameters as `cookies` and generates named server-sent events with JSON data.

## 0.4.0

### Minor Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@alxia/openapi` is now alxia's spec-first toolkit, the package that was `@alxia/openapi-routes`: `implemented(app, operations)` and `matchesSpec(app, operations)` check an app's routes against the operations `@nxgt/openapi-codegen`'s `alxia` option generates from the OpenAPI document, bound with `@alxia/core`'s `route(operation, ...middlewares, handler)`. Its exports are `@alxia/openapi-routes` 0.2's, unchanged: change the import. The `@alxia/openapi` of 0.3 and before, which wrote an OpenAPI document from an app's route schemas (`openapi`, `docs`, `toJsonSchema`, `Converter` and the rest), is retired: alxia is OpenAPI spec first, so the document is the source and is written, not generated from the app. This version follows 0.3.0, the last of the retired package, so that npm's `latest` is the new one. See `@alxia/core`'s upgrading guide.

### Patch Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The README and the guide show routes declared with `route(operation, ...middlewares, handler)`, `@alxia/core`'s middleware form, and how `implemented` and `matchesSpec` match them: as any other route.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs and examples mount each plugin app with `@alxia/core`'s new `app.plugin(…)` — `base.plugin(todoRoutes)`, `app.plugin(redis(client))` — `use(…)` being for middlewares, its plugin forms deprecated. `@alxia/i18n` mounts its language plugin the same way inside, and `@alxia/context-storage`'s factory, given uncalled, now says `contextStorage is a factory: use(contextStorage()), not use(contextStorage)`. `@alxia/openapi`'s guides say where `route(operation)` checks replies: the handler's, just before it, a middleware's reply sent as it is, unless `responds(operation)` stands among the middlewares.
- Updated dependencies [[`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd)]:
  - @alxia/core@0.4.0

## 0.2.0

### Minor Changes

- [#98](https://github.com/softistx/alxia/pull/98) [`ccf30df`](https://github.com/softistx/alxia/commit/ccf30df35170f388740249025d1ba1d083608f93) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `matchesSpec(app, operations)` is the new name of `exactly`: one call that throws when an operation of the spec has no route, or a route is not in the spec. `exactly` and `ExactlyOptions` still work, deprecated.

### Patch Changes

- Updated dependencies [[`56ffcb9`](https://github.com/softistx/alxia/commit/56ffcb93a5155568ec002ab6fee332369bac3f30), [`a01ebed`](https://github.com/softistx/alxia/commit/a01ebed5745c5f863193f54bea8172abf51df85b), [`c9d43b7`](https://github.com/softistx/alxia/commit/c9d43b78f5ea9137e9ba56621e7ad89095621cff), [`f9a0ae7`](https://github.com/softistx/alxia/commit/f9a0ae7de698a63a94bb4aa4dfc2af33303827f2), [`8beb606`](https://github.com/softistx/alxia/commit/8beb606f81aa02bbdd068a674fa13385c4e52183)]:
  - @alxia/core@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`d0eaf4a`](https://github.com/softistx/alxia/commit/d0eaf4a21354ae86f5ec6959cb06e796e750d086), [`26ea5c1`](https://github.com/softistx/alxia/commit/26ea5c1e985ac7fcb819b10fc4d847f7b55f9709), [`eab8ca4`](https://github.com/softistx/alxia/commit/eab8ca4eff8ab407abe3801d15e4f5c6df23a735)]:
  - @alxia/core@0.2.0

## 0.1.0

### Minor Changes

- [`d6822f8`](https://github.com/softistx/alxia/commit/d6822f85cfcba85d2a4cffca15a1cf7acc00adce) The first release of alxia: a zero-dependency, type-safe HTTP framework for Bun, its typed client, its OpenAPI document, its Zod and GraphQL Yoga integrations, its plugins, and its adapters to the nxgt suite: telemetry, Redis and janus.

### Patch Changes

- Updated dependencies [[`d6822f8`](https://github.com/softistx/alxia/commit/d6822f85cfcba85d2a4cffca15a1cf7acc00adce)]:
  - @alxia/core@0.1.0
