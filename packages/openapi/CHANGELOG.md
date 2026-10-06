# @alxia/openapi

From 0.4.0, `@alxia/openapi` is the spec-first package that was
`@alxia/openapi-routes`: its releases up to 0.2.0, below, were published
under that name. The `@alxia/openapi` of 0.1.0 to 0.3.0, which wrote an OpenAPI
document from an app's route schemas, is retired; its changelog is
[in the repository's history](https://github.com/softistx/alxia/blob/3f80253/packages/openapi/CHANGELOG.md).

## 0.6.7

### Patch Changes

- Updated dependencies [[`5d7438a`](https://github.com/softistx/alxia/commit/5d7438afa0909630611d3f0661bd012834760fb6), [`9de1c30`](https://github.com/softistx/alxia/commit/9de1c30e0ba8ab4cb20d38a5f5a14293726e9468), [`b4195c0`](https://github.com/softistx/alxia/commit/b4195c0518ce2c5c8c68181e5cb3de67890c2ae8)]:
  - @alxia/core@0.13.0

## 0.6.6

### Patch Changes

- Updated dependencies [[`4eac9ea`](https://github.com/softistx/alxia/commit/4eac9ea56b3ad3eb50a5cec27128ae3fce7c65ff), [`d462fd7`](https://github.com/softistx/alxia/commit/d462fd7bf5ddf4fd4601a5e146fa267d5df74297)]:
  - @alxia/core@0.12.0

## 0.6.5

### Patch Changes

- [#200](https://github.com/softistx/alxia/pull/200) [`79fbd81`](https://github.com/softistx/alxia/commit/79fbd81a9e1d9e72cbd9d733085fbc8d73d3ed72) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Documents how `matchesSpec` reads an `app.all(path, …)` route: as `ALL` and its path, serving no operation of the document, so it is reported in `extra`, and fails under `strict` unless `exclude` leaves it out.
- Updated dependencies [[`79fbd81`](https://github.com/softistx/alxia/commit/79fbd81a9e1d9e72cbd9d733085fbc8d73d3ed72), [`c7c994a`](https://github.com/softistx/alxia/commit/c7c994a48eeaa4b069bc81e0eeb73aa7217dd12e)]:
  - @alxia/core@0.11.0

## 0.6.4

### Patch Changes

- Updated dependencies [[`3385725`](https://github.com/softistx/alxia/commit/33857253e8a67fc33f39884d58bdd55377ae2915), [`da95f24`](https://github.com/softistx/alxia/commit/da95f24391b942db81c082c253aeeaa5fcade07b)]:
  - @alxia/core@0.10.0

## 0.6.3

### Patch Changes

- Updated dependencies [[`86af86e`](https://github.com/softistx/alxia/commit/86af86e9c73dbc5084a468113de1ec98207cfdf0), [`17d28fe`](https://github.com/softistx/alxia/commit/17d28fe08a73e4c549f04b98411364ff5c6715f5), [`bc2573c`](https://github.com/softistx/alxia/commit/bc2573c7eb045fcfd954fa5457a340abefc32579)]:
  - @alxia/core@0.9.0

## 0.6.2

### Patch Changes

- [#181](https://github.com/softistx/alxia/pull/181) [`f76d073`](https://github.com/softistx/alxia/commit/f76d0738fe3d715ebd1aa15c3f9f7bf7327062b4) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: fix links to matching.md and fold "How a route is matched" into "Under a prefix".

- [#177](https://github.com/softistx/alxia/pull/177) [`7608337`](https://github.com/softistx/alxia/commit/7608337a4e4468a0520bb8e61e414403c0321d76) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: move route matching and prefix details to a new "How routes are matched" guide.
- Updated dependencies [[`89aa1df`](https://github.com/softistx/alxia/commit/89aa1df408840165fca6eb189aabedc3fee498ba), [`4a6df2b`](https://github.com/softistx/alxia/commit/4a6df2b1cfc4bf87c4f5b38a856c3157acf1e42f), [`e536262`](https://github.com/softistx/alxia/commit/e5362622a260faa3320bc1cdbd456bae07565953), [`d256d6a`](https://github.com/softistx/alxia/commit/d256d6a169bb9a532014814c3aea888fd592c762), [`9ab4a7f`](https://github.com/softistx/alxia/commit/9ab4a7fd3a62545b15f788e3c6da51ac73de2705)]:
  - @alxia/core@0.8.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`28cdcfe`](https://github.com/softistx/alxia/commit/28cdcfe800ca90cfadacf48662fac0fc99b4f63b)]:
  - @alxia/core@0.7.0

## 0.6.0

### Minor Changes

- [#166](https://github.com/softistx/alxia/pull/166) [`7cf96ea`](https://github.com/softistx/alxia/commit/7cf96ea0e9e05d0d1dad33fc315acdcf41d8f8da) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `matchesSpec` no longer fails on a route no operation declares. An app may serve routes its document does not describe (proxied, health, docs, hand-written) and still match it. It still throws on each operation with no route, which includes a route of another method or path than its operation. `strict: true` restores the exhaustive check, `exclude` and the `apiDocs()` and `health()` skips included; `matchesSpec` now returns a `MatchesSpecReport`, `{ extra: { method, path }[] }`, listing the undocumented routes without failing. The `api` template's spec test drops "and nothing else" from its title.
  
  Upgrading: to keep the old check, pass `strict: true`.

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
