# @alxia/telemetry

## 0.7.3

### Patch Changes

- Updated dependencies [[`71411e2`](https://github.com/softistx/alxia/commit/71411e26dd0d729bf16e10be6f43b1fa6726f6c8), [`3ed7f8e`](https://github.com/softistx/alxia/commit/3ed7f8e7df3dd3e9d97b38e004ee831055ebe163)]:
  - @alxia/core@0.14.0

## 0.7.2

### Patch Changes

- [#214](https://github.com/softistx/alxia/pull/214) [`b4195c0`](https://github.com/softistx/alxia/commit/b4195c0518ce2c5c8c68181e5cb3de67890c2ae8) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the roadmap versions the public `server.port` behind `X-Forwarded-Port` as 0.7.2.

- [#210](https://github.com/softistx/alxia/pull/210) [`5d7438a`](https://github.com/softistx/alxia/commit/5d7438afa0909630611d3f0661bd012834760fb6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Document that `server.port` is the public port behind a trusted proxy that sends `X-Forwarded-Port`, read through core's `originalUrl(ctx)`.
- Updated dependencies [[`5d7438a`](https://github.com/softistx/alxia/commit/5d7438afa0909630611d3f0661bd012834760fb6), [`9de1c30`](https://github.com/softistx/alxia/commit/9de1c30e0ba8ab4cb20d38a5f5a14293726e9468), [`b4195c0`](https://github.com/softistx/alxia/commit/b4195c0518ce2c5c8c68181e5cb3de67890c2ae8)]:
  - @alxia/core@0.13.0

## 0.7.1

### Patch Changes

- Updated dependencies [[`4eac9ea`](https://github.com/softistx/alxia/commit/4eac9ea56b3ad3eb50a5cec27128ae3fce7c65ff), [`d462fd7`](https://github.com/softistx/alxia/commit/d462fd7bf5ddf4fd4601a5e146fa267d5df74297)]:
  - @alxia/core@0.12.0

## 0.7.0

### Minor Changes

- [#197](https://github.com/softistx/alxia/pull/197) [`0795c96`](https://github.com/softistx/alxia/commit/0795c966499a5fc5b4b35311a6f65811afc9383d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Record `url.scheme`, `server.address` and `server.port` from core's `originalUrl(ctx)`: behind `alxia({ proxy: trustProxy(…) })`, a request a trusted TLS proxy forwarded is traced as `https` and the public host, not the app's own. Without `proxy`, or from a connection that is not a trusted proxy, nothing changes.

### Patch Changes

- Updated dependencies [[`79fbd81`](https://github.com/softistx/alxia/commit/79fbd81a9e1d9e72cbd9d733085fbc8d73d3ed72), [`c7c994a`](https://github.com/softistx/alxia/commit/c7c994a48eeaa4b069bc81e0eeb73aa7217dd12e)]:
  - @alxia/core@0.11.0

## 0.6.2

### Patch Changes

- Updated dependencies [[`3385725`](https://github.com/softistx/alxia/commit/33857253e8a67fc33f39884d58bdd55377ae2915), [`da95f24`](https://github.com/softistx/alxia/commit/da95f24391b942db81c082c253aeeaa5fcade07b)]:
  - @alxia/core@0.10.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`86af86e`](https://github.com/softistx/alxia/commit/86af86e9c73dbc5084a468113de1ec98207cfdf0), [`17d28fe`](https://github.com/softistx/alxia/commit/17d28fe08a73e4c549f04b98411364ff5c6715f5), [`bc2573c`](https://github.com/softistx/alxia/commit/bc2573c7eb045fcfd954fa5457a340abefc32579)]:
  - @alxia/core@0.9.0

## 0.6.0

### Minor Changes

- [#182](https://github.com/softistx/alxia/pull/182) [`9ab4a7f`](https://github.com/softistx/alxia/commit/9ab4a7fd3a62545b15f788e3c6da51ac73de2705) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Trace a WebSocket upgrade with a span that ends with its answer, and, behind `@alxia/graphql`'s `ws: true`, each operation on the socket with a span of its own, a child of the upgrade's: named `subscription OnNote`, with `graphql.operation.*`, from its start to its end, an error when answered with errors.

### Patch Changes

- Updated dependencies [[`89aa1df`](https://github.com/softistx/alxia/commit/89aa1df408840165fca6eb189aabedc3fee498ba), [`4a6df2b`](https://github.com/softistx/alxia/commit/4a6df2b1cfc4bf87c4f5b38a856c3157acf1e42f), [`e536262`](https://github.com/softistx/alxia/commit/e5362622a260faa3320bc1cdbd456bae07565953), [`d256d6a`](https://github.com/softistx/alxia/commit/d256d6a169bb9a532014814c3aea888fd592c762), [`9ab4a7f`](https://github.com/softistx/alxia/commit/9ab4a7fd3a62545b15f788e3c6da51ac73de2705)]:
  - @alxia/core@0.8.0

## 0.5.0

### Minor Changes

- [#172](https://github.com/softistx/alxia/pull/172) [`28cdcfe`](https://github.com/softistx/alxia/commit/28cdcfe800ca90cfadacf48662fac0fc99b4f63b) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The span of a GraphQL request follows OpenTelemetry's conventions: named `query GetNotes` (`mutation` for an anonymous one) with `graphql.operation.name` and `graphql.operation.type`, instead of `POST /graphql`. A batched body is `batch GetNotes,AddNote`, its name attribute listing every operation and no type. `http.route` stays. New exports `GRAPHQL_NAME` and `GRAPHQL_TYPE`. Needs `@alxia/core` with `operationOf`.

### Patch Changes

- Updated dependencies [[`28cdcfe`](https://github.com/softistx/alxia/commit/28cdcfe800ca90cfadacf48662fac0fc99b4f63b)]:
  - @alxia/core@0.7.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`137c5c8`](https://github.com/softistx/alxia/commit/137c5c8b618b961674c63a6242568e6b800939ab)]:
  - @alxia/core@0.6.0

## 0.4.0

### Minor Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - For `@alxia/core` 0.5: the middleware's exported type is a plain `(ctx, next)` function, without `MiddlewareMark`, and `app.plugin(x())`, deprecated in 0.4, is gone: give the middleware to `use(...)`. The docs show the single form, and an error is answered by a `try`/`catch` middleware where they showed `onError`.

### Patch Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - For `@alxia/core`'s dev comfort: `telemetry` is marked with `markFactory`, so given uncalled it throws where it is declared, naming itself, rather than answering each request 500; the middleware it makes is a named function, which the dev route table shows.
- Updated dependencies [[`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787)]:
  - @alxia/core@0.5.0

## 0.3.0

### Minor Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The plugins that installed request hooks are middlewares, under the same factory names: `app.use(logger())`, `app.use(telemetry(…))`, `app.use(compress())`, `app.use(cors())`, `app.use(secureHeaders(…))`, `app.use(rateLimit(…))`, `app.use(cache(…))`, `app.use(idempotency(client, …))`, `app.use(contextStorage())`, `app.use(language(…))`, `app.use(createI18n(…))`, `app.use(bearer(…))`, and janus's `session()`, `permission()` and `janusErrors()`. `app.plugin(x())` keeps working, deprecated. Given to `use` first, the observers — logger, telemetry, secure-headers, cors, compress — see every response, a 404, an `onError` reply and a 500 included; cors answers a preflight to any path. A guard on the app (`bearer`, a required `session`, `rateLimit`) runs on a request no route matches too, before its 404. `janusErrors()` is a try/catch around what follows it: give it to `use` before `session()`. `idempotency` and `cache` let a request no route matches through, never kept. New types: `LoggerContext`, `TelemetryContext`, `SecureHeaders`, `RateLimit`, `CacheMiddleware`, `Bearer`, `JanusErrors`, `SessionMiddleware`.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New type `TelemetryMiddleware`, what `telemetry()` returns: a middleware adding `TelemetryContext`, with `.telemetry`. The options keep their name, `TelemetryPluginOptions`.

### Patch Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs no longer use `@alxia/client`, which is retired: alxia is OpenAPI spec first, and a typed client is generated from the API's OpenAPI document. The examples call the app with `app.request()`.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs and examples mount each plugin app with `@alxia/core`'s new `app.plugin(…)` — `base.plugin(todoRoutes)`, `app.plugin(redis(client))` — `use(…)` being for middlewares, its plugin forms deprecated. `@alxia/i18n` mounts its language plugin the same way inside, and `@alxia/context-storage`'s factory, given uncalled, now says `contextStorage is a factory: use(contextStorage()), not use(contextStorage)`. `@alxia/openapi`'s guides say where `route(operation)` checks replies: the handler's, just before it, a middleware's reply sent as it is, unless `responds(operation)` stands among the middlewares.
- Updated dependencies [[`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd)]:
  - @alxia/core@0.4.0

## 0.2.0

### Minor Changes

- [#99](https://github.com/softistx/alxia/pull/99) [`7e3850c`](https://github.com/softistx/alxia/commit/7e3850c6201656173a8e306e9151d8eb971954c5) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A streamed body (a page rendered as it goes, an event stream, a `ReadableStream` reply) now keeps its server span open until it has been sent: the span used to end when the handler returned the response, before the body. A body that fails midway now makes the span an error, with the stream's error as its exception, and a client that leaves midway adds an `http.response.aborted` event. A response with no body, or with a `Content-Length` header (which `@alxia/core` sets on every reply of a string, JSON, a buffer or a file), ends the span with the response, as before, and so does an unsampled one.

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
