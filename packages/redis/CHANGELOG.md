# @alxia/redis

## 0.5.7

### Patch Changes

- Updated dependencies [[`4eac9ea`](https://github.com/softistx/alxia/commit/4eac9ea56b3ad3eb50a5cec27128ae3fce7c65ff), [`d462fd7`](https://github.com/softistx/alxia/commit/d462fd7bf5ddf4fd4601a5e146fa267d5df74297)]:
  - @alxia/core@0.12.0
  - @alxia/cache@0.3.7
  - @alxia/rate-limit@0.4.9

## 0.5.6

### Patch Changes

- Updated dependencies [[`79fbd81`](https://github.com/softistx/alxia/commit/79fbd81a9e1d9e72cbd9d733085fbc8d73d3ed72), [`c7c994a`](https://github.com/softistx/alxia/commit/c7c994a48eeaa4b069bc81e0eeb73aa7217dd12e)]:
  - @alxia/core@0.11.0
  - @alxia/cache@0.3.6
  - @alxia/rate-limit@0.4.8

## 0.5.5

### Patch Changes

- Updated dependencies [[`3385725`](https://github.com/softistx/alxia/commit/33857253e8a67fc33f39884d58bdd55377ae2915), [`da95f24`](https://github.com/softistx/alxia/commit/da95f24391b942db81c082c253aeeaa5fcade07b), [`3385725`](https://github.com/softistx/alxia/commit/33857253e8a67fc33f39884d58bdd55377ae2915)]:
  - @alxia/core@0.10.0
  - @alxia/rate-limit@0.4.6
  - @alxia/cache@0.3.5

## 0.5.4

### Patch Changes

- Updated dependencies [[`86af86e`](https://github.com/softistx/alxia/commit/86af86e9c73dbc5084a468113de1ec98207cfdf0), [`17d28fe`](https://github.com/softistx/alxia/commit/17d28fe08a73e4c549f04b98411364ff5c6715f5), [`bc2573c`](https://github.com/softistx/alxia/commit/bc2573c7eb045fcfd954fa5457a340abefc32579)]:
  - @alxia/core@0.9.0
  - @alxia/cache@0.3.4
  - @alxia/rate-limit@0.4.5

## 0.5.3

### Patch Changes

- Updated dependencies [[`89aa1df`](https://github.com/softistx/alxia/commit/89aa1df408840165fca6eb189aabedc3fee498ba), [`4a6df2b`](https://github.com/softistx/alxia/commit/4a6df2b1cfc4bf87c4f5b38a856c3157acf1e42f), [`e536262`](https://github.com/softistx/alxia/commit/e5362622a260faa3320bc1cdbd456bae07565953), [`d256d6a`](https://github.com/softistx/alxia/commit/d256d6a169bb9a532014814c3aea888fd592c762), [`9ab4a7f`](https://github.com/softistx/alxia/commit/9ab4a7fd3a62545b15f788e3c6da51ac73de2705)]:
  - @alxia/core@0.8.0
  - @alxia/cache@0.3.3
  - @alxia/rate-limit@0.4.4

## 0.5.2

### Patch Changes

- Updated dependencies [[`28cdcfe`](https://github.com/softistx/alxia/commit/28cdcfe800ca90cfadacf48662fac0fc99b4f63b)]:
  - @alxia/core@0.7.0
  - @alxia/cache@0.3.2
  - @alxia/rate-limit@0.4.3

## 0.5.1

### Patch Changes

- Updated dependencies [[`137c5c8`](https://github.com/softistx/alxia/commit/137c5c8b618b961674c63a6242568e6b800939ab), [`137c5c8`](https://github.com/softistx/alxia/commit/137c5c8b618b961674c63a6242568e6b800939ab)]:
  - @alxia/core@0.6.0
  - @alxia/rate-limit@0.4.2
  - @alxia/cache@0.3.1

## 0.5.0

### Minor Changes

- [#158](https://github.com/softistx/alxia/pull/158) [`990ab0b`](https://github.com/softistx/alxia/commit/990ab0ba8fc72d392250d48a1079938320fae3fe) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `redisStore(handle.limits.api)` alone carries the rate: it reads `limit` and `per` from the bound limit's `definition` (`@nxgt/redis` 0.7), so `rateLimit({ store: redisStore(handle.limits.api) })` needs no numbers and returns a `PolicyStore`. A limit bound by hand with `bindRateLimit` does the same. The two-argument form, `redisStore(bound, api)`, still works and is deprecated: it now compares `limit` and `per` rather than the name, and throws on a mismatch (a definition of another name and the same rate is accepted). `idempotency(handle.idempotency.orders)` names itself from the definition in its warning. The peer is `@nxgt/redis` `^0.7.0`: the single-argument form has no rate to read from an older bound limit.

### Patch Changes

- Updated dependencies [[`990ab0b`](https://github.com/softistx/alxia/commit/990ab0ba8fc72d392250d48a1079938320fae3fe)]:
  - @alxia/rate-limit@0.4.1

## 0.4.0

### Minor Changes

- [#153](https://github.com/softistx/alxia/pull/153) [`87c9d67`](https://github.com/softistx/alxia/commit/87c9d6716ef3fe40f15f5965fd3442492abcc972) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A rate limit that reads its policy from the store. `redisStore(handle.limits.api, api)`, given the definition beside the wired limit, declares the definition's `limit` and `per` as its `policy`, so `rateLimit({ store })` needs no `limit` nor `windowMs` and its `RateLimit-*` headers come from the definition; numbers that differ throw at declaration. A definition of another name than the wired limit's is a `TypeError`. (`@nxgt/redis` 0.6 does not expose a bound limit's rate, hence the definition as an argument.) `redisStore(handle.limits.api)` alone is unchanged. Requires `@alxia/rate-limit` 0.4.

### Patch Changes

- Updated dependencies [[`87c9d67`](https://github.com/softistx/alxia/commit/87c9d6716ef3fe40f15f5965fd3442492abcc972)]:
  - @alxia/rate-limit@0.4.0

## 0.3.0

### Minor Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - An `@nxgt/redis` handle everywhere. `redis(handle)` takes what `openRedis(defineRedis({ uri, prefix, caches }))` gives: `caches` typed from its scopes, a `lock` and every key under its `prefix`, and the handle closed once in core's `onStop`, after the drain (`{ close: false }` to close it yourself). `redisStore`, `redisCacheStore` and `idempotency` accept the handle where they accept a client and put its prefix in front of their keys, so every key of the deployment shares one prefix. `redisCheck(handle, { timeout? })` is a readiness check for `health({ checks })`, its `timeout` in milliseconds named as `health({ timeout })`'s. The bare `RedisClient` forms are unchanged.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@alxia/redis` is now on `@nxgt/redis` alone: the rate limits and the idempotency that `@nxgt/redis-guard` held moved into `@nxgt/redis` 0.5, and `@nxgt/redis-guard` (deprecated) is no longer a peer. **Upgrade:** raise `@nxgt/redis` to `^0.5.0` and remove `@nxgt/redis-guard` from your dependencies (`bun remove @nxgt/redis-guard`; `bun add @nxgt/redis@^0.5.0`). Nothing in `@alxia/redis`'s own API changes. If you import `@nxgt/redis-guard` yourself, import the same names from `@nxgt/redis`; a hand-built `IdempotencyDefinition` now needs its `lease`, which `defineIdempotency` fills with 10 000.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - For `@alxia/core` 0.5: the middleware's exported type is a plain `(ctx, next)` function, without `MiddlewareMark`, and `app.plugin(x())`, deprecated in 0.4, is gone: give the middleware to `use(...)`. The docs show the single form, and an error is answered by a `try`/`catch` middleware where they showed `onError`.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A rate limit and an idempotency defined once, in `defineRedis`. On `@nxgt/redis` 0.6, `defineRedis` takes `limits` and `idempotency` and the handle exposes `handle.limits.api` and `handle.idempotency.orders`; `redisStore(handle.limits.api)` and `idempotency(handle.idempotency.orders, { required: true })` take that wired entry, so the name, rate, `ttl` and `lease` live in the definition and its types flow through, and the keys are those `@nxgt/redis` writes, `<prefix>:<name>:<key>`, shared with every other consumer of the handle. The idempotency's `schema` is the new `idempotencyResult`. The by-name forms, `redisStore(handle, { name })` and `idempotency(handle, { name })`, are unchanged. Moving a rate limit from the by-name store to the wired one restarts its counts (the layouts differ); an idempotency keeps its keys. The peer range of `@nxgt/redis` is `^0.5.0 || ^0.6.0`: nothing here needs more than 0.5's types, and 0.5 code still works.

### Patch Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs are organised around tasks. Each README and docs index links the new "Start in 5 minutes" and the recipes of the repository (authentication, a spec-first CRUD, a GraphQL API, file uploads, SSE and WebSockets, testing, errors, health and shutdown, caching and rate limiting, deploying), whose code is type-checked. `@alxia/core`'s README names the four templates of `bun create @alxia`. `@alxia/redis`'s roadmap gains its 0.2.0 entry and says which release removed `app.plugin(idempotency(…))`, and its troubleshooting entry for a handle that wires nothing carries `@nxgt/redis` 0.5's whole message. The tables of contents of the `@alxia/env` and `@alxia/janus` troubleshooting pages link the right headings.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - For `@alxia/core`'s dev comfort: `idempotency` is marked with `markFactory`, and `redis` as making a plugin, so either given uncalled throws where it is declared, naming itself, rather than answering each request 500; the middleware `idempotency` makes is a named function, which the dev route table shows.
- Updated dependencies [[`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787)]:
  - @alxia/cache@0.3.0
  - @alxia/core@0.5.0
  - @alxia/rate-limit@0.3.0

## 0.2.0

### Minor Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The plugins that installed request hooks are middlewares, under the same factory names: `app.use(logger())`, `app.use(telemetry(…))`, `app.use(compress())`, `app.use(cors())`, `app.use(secureHeaders(…))`, `app.use(rateLimit(…))`, `app.use(cache(…))`, `app.use(idempotency(client, …))`, `app.use(contextStorage())`, `app.use(language(…))`, `app.use(createI18n(…))`, `app.use(bearer(…))`, and janus's `session()`, `permission()` and `janusErrors()`. `app.plugin(x())` keeps working, deprecated. Given to `use` first, the observers — logger, telemetry, secure-headers, cors, compress — see every response, a 404, an `onError` reply and a 500 included; cors answers a preflight to any path. A guard on the app (`bearer`, a required `session`, `rateLimit`) runs on a request no route matches too, before its 404. `janusErrors()` is a try/catch around what follows it: give it to `use` before `session()`. `idempotency` and `cache` let a request no route matches through, never kept. New types: `LoggerContext`, `TelemetryContext`, `SecureHeaders`, `RateLimit`, `CacheMiddleware`, `Bearer`, `JanusErrors`, `SessionMiddleware`.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New type `IdempotencyMiddleware`, what `idempotency()` returns.

### Patch Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The examples are written in `@alxia/core`'s middleware model: a route's body or query is validated by `validate({ … })` and its replies by `responds({ … })`, among its middlewares, in place of a schema before the handler.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs no longer use `@alxia/client`, which is retired: alxia is OpenAPI spec first, and a typed client is generated from the API's OpenAPI document. The examples call the app with `app.request()`.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs and examples mount each plugin app with `@alxia/core`'s new `app.plugin(…)` — `base.plugin(todoRoutes)`, `app.plugin(redis(client))` — `use(…)` being for middlewares, its plugin forms deprecated. `@alxia/i18n` mounts its language plugin the same way inside, and `@alxia/context-storage`'s factory, given uncalled, now says `contextStorage is a factory: use(contextStorage()), not use(contextStorage)`. `@alxia/openapi`'s guides say where `route(operation)` checks replies: the handler's, just before it, a middleware's reply sent as it is, unless `responds(operation)` stands among the middlewares.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `idempotency` no longer shares one key space between every client when it cannot tell them apart: a request with no `ctx.ip` and no `scope` (or a `scope` that returns `undefined`) now runs unguarded, nothing stored or replayed, and the middleware warns once, saying how to give it a scope. It used to scope such keys to `anyone`, so one client could be replayed another's response.
- Updated dependencies [[`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd)]:
  - @alxia/cache@0.2.0
  - @alxia/core@0.4.0
  - @alxia/rate-limit@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`56ffcb9`](https://github.com/softistx/alxia/commit/56ffcb93a5155568ec002ab6fee332369bac3f30), [`a01ebed`](https://github.com/softistx/alxia/commit/a01ebed5745c5f863193f54bea8172abf51df85b), [`c9d43b7`](https://github.com/softistx/alxia/commit/c9d43b78f5ea9137e9ba56621e7ad89095621cff), [`f9a0ae7`](https://github.com/softistx/alxia/commit/f9a0ae7de698a63a94bb4aa4dfc2af33303827f2), [`8beb606`](https://github.com/softistx/alxia/commit/8beb606f81aa02bbdd068a674fa13385c4e52183)]:
  - @alxia/core@0.3.0
  - @alxia/cache@0.1.2
  - @alxia/rate-limit@0.1.2

## 0.1.2

### Patch Changes

- [#96](https://github.com/softistx/alxia/pull/96) [`a79f0ec`](https://github.com/softistx/alxia/commit/a79f0ec652fe44170eee52d20022f00c85f1dec9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `AnyCache`, the constraint of `redis()`'s `caches`, is exported: a function generic over the caches it hands to `redis()` names it instead of rebuilding `CacheDefinition<any, z.ZodType>`.
- Updated dependencies [[`69c815c`](https://github.com/softistx/alxia/commit/69c815c17ed26067b39ca5c731c48396f4da6377)]:
  - @alxia/core@0.2.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`d0eaf4a`](https://github.com/softistx/alxia/commit/d0eaf4a21354ae86f5ec6959cb06e796e750d086), [`26ea5c1`](https://github.com/softistx/alxia/commit/26ea5c1e985ac7fcb819b10fc4d847f7b55f9709), [`eab8ca4`](https://github.com/softistx/alxia/commit/eab8ca4eff8ab407abe3801d15e4f5c6df23a735)]:
  - @alxia/core@0.2.0
  - @alxia/cache@0.1.1
  - @alxia/rate-limit@0.1.1

## 0.1.0

### Minor Changes

- [`d6822f8`](https://github.com/softistx/alxia/commit/d6822f85cfcba85d2a4cffca15a1cf7acc00adce) The first release of alxia: a zero-dependency, type-safe HTTP framework for Bun, its typed client, its OpenAPI document, its Zod and GraphQL Yoga integrations, its plugins, and its adapters to the nxgt suite: telemetry, Redis and janus.

### Patch Changes

- Updated dependencies [[`d6822f8`](https://github.com/softistx/alxia/commit/d6822f85cfcba85d2a4cffca15a1cf7acc00adce)]:
  - @alxia/core@0.1.0
  - @alxia/rate-limit@0.1.0
  - @alxia/cache@0.1.0
