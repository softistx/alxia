# @alxia/jwt

## 0.4.5

### Patch Changes

- Updated dependencies [[`79fbd81`](https://github.com/softistx/alxia/commit/79fbd81a9e1d9e72cbd9d733085fbc8d73d3ed72), [`c7c994a`](https://github.com/softistx/alxia/commit/c7c994a48eeaa4b069bc81e0eeb73aa7217dd12e)]:
  - @alxia/core@0.11.0

## 0.4.4

### Patch Changes

- Updated dependencies [[`3385725`](https://github.com/softistx/alxia/commit/33857253e8a67fc33f39884d58bdd55377ae2915), [`da95f24`](https://github.com/softistx/alxia/commit/da95f24391b942db81c082c253aeeaa5fcade07b)]:
  - @alxia/core@0.10.0

## 0.4.3

### Patch Changes

- Updated dependencies [[`86af86e`](https://github.com/softistx/alxia/commit/86af86e9c73dbc5084a468113de1ec98207cfdf0), [`17d28fe`](https://github.com/softistx/alxia/commit/17d28fe08a73e4c549f04b98411364ff5c6715f5), [`bc2573c`](https://github.com/softistx/alxia/commit/bc2573c7eb045fcfd954fa5457a340abefc32579)]:
  - @alxia/core@0.9.0

## 0.4.2

### Patch Changes

- Updated dependencies [[`89aa1df`](https://github.com/softistx/alxia/commit/89aa1df408840165fca6eb189aabedc3fee498ba), [`4a6df2b`](https://github.com/softistx/alxia/commit/4a6df2b1cfc4bf87c4f5b38a856c3157acf1e42f), [`e536262`](https://github.com/softistx/alxia/commit/e5362622a260faa3320bc1cdbd456bae07565953), [`d256d6a`](https://github.com/softistx/alxia/commit/d256d6a169bb9a532014814c3aea888fd592c762), [`9ab4a7f`](https://github.com/softistx/alxia/commit/9ab4a7fd3a62545b15f788e3c6da51ac73de2705)]:
  - @alxia/core@0.8.0

## 0.4.1

### Patch Changes

- [#173](https://github.com/softistx/alxia/pull/173) [`4d18c3a`](https://github.com/softistx/alxia/commit/4d18c3a006c3fb063c057801d54372885a7663c2) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Security fix, upgrading is recommended: a key set holding an Ed25519 key of small order (the identity point, the all-zero point, or any other point of libsodium's `has_small_order` list) could be used to forge tokens, since under such a key a signature anyone can make verifies. A `jwks` or `discovery` verifier now refuses those keys, and any Ed25519 key that is not exactly 32 bytes, as `key`. Also: an RSA modulus is counted in bits from its first set bit (2048 to 8192), a key's `n`, `e`, `x` and `y` must be strict, unpadded base64url (and an EC key's coordinates its curve's size), a `key_ops` that is not an array no longer matches (nor answers a 500), the key cache's lifetimes and refetch limit run on a monotonic clock, and a verifier by a secret or a key pair refuses a header with `crit` as `malformed`, as the `jwks` one already did. The test fixtures no longer ship in the tarball.
- Updated dependencies [[`28cdcfe`](https://github.com/softistx/alxia/commit/28cdcfe800ca90cfadacf48662fac0fc99b4f63b)]:
  - @alxia/core@0.7.0

## 0.4.0

### Minor Changes

- [#163](https://github.com/softistx/alxia/pull/163) [`04fbb74`](https://github.com/softistx/alxia/commit/04fbb7479b97e641fc8d43321e2c6b2c1971e468) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Verify the tokens of an identity provider by its published keys: `createJwt({ jwks })`, or `createJwt({ discovery })` to read `jwks_uri` from the issuer's OpenID configuration, for Keycloak, Auth0, Ory or Cognito. The key is found by the token's `kid` and verified with Web Crypto (`RS256/384/512`, `PS256/384/512`, `ES256/384`, `EdDSA`), with no dependency. The set is cached by `Cache-Control: max-age` or `cacheMs`, refetched once on an unknown `kid` and never more often than `refetchMs`, and used for `staleMs` past its lifetime while the issuer is down; with nothing cached the guard fails closed. `alg: none`, every `HS*` token and an algorithm the key's type does not allow are refused, so a public key cannot be used as a secret. A new `JwksJwt` and `Verifier` (what `bearer` takes), and the reasons `key` and `keys_unavailable`. HS and key-pair behaviour is unchanged.

## 0.3.1

### Patch Changes

- Updated dependencies [[`137c5c8`](https://github.com/softistx/alxia/commit/137c5c8b618b961674c63a6242568e6b800939ab)]:
  - @alxia/core@0.6.0

## 0.3.0

### Minor Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `bearer()`'s 401 follows `@alxia/core`'s `alxia({ errors: 'problem' })`: an RFC 9457 problem sent as `application/problem+json`, `reason` and `issues` its extensions, the `WWW-Authenticate` challenge kept, typed `UnauthorizedProblem`. The `Bearer` type's 401 is `UnauthorizedBody | UnauthorizedProblem`; the default body is unchanged.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - For `@alxia/core` 0.5: the middleware's exported type is a plain `(ctx, next)` function, without `MiddlewareMark`, and `app.plugin(x())`, deprecated in 0.4, is gone: give the middleware to `use(...)`. The docs show the single form, and an error is answered by a `try`/`catch` middleware where they showed `onError`.

### Patch Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs are organised around tasks. Each README and docs index links the new "Start in 5 minutes" and the recipes of the repository (authentication, a spec-first CRUD, a GraphQL API, file uploads, SSE and WebSockets, testing, errors, health and shutdown, caching and rate limiting, deploying), whose code is type-checked. `@alxia/core`'s README names the four templates of `bun create @alxia`. `@alxia/redis`'s roadmap gains its 0.2.0 entry and says which release removed `app.plugin(idempotency(…))`, and its troubleshooting entry for a handle that wires nothing carries `@nxgt/redis` 0.5's whole message. The tables of contents of the `@alxia/env` and `@alxia/janus` troubleshooting pages link the right headings.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - For `@alxia/core`'s dev comfort: `bearer` is marked with `markFactory`, so given uncalled it throws where it is declared, naming itself, rather than answering each request 500; the middleware it makes is a named function, which the dev route table shows.
- Updated dependencies [[`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787)]:
  - @alxia/core@0.5.0

## 0.2.0

### Minor Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The plugins that installed request hooks are middlewares, under the same factory names: `app.use(logger())`, `app.use(telemetry(…))`, `app.use(compress())`, `app.use(cors())`, `app.use(secureHeaders(…))`, `app.use(rateLimit(…))`, `app.use(cache(…))`, `app.use(idempotency(client, …))`, `app.use(contextStorage())`, `app.use(language(…))`, `app.use(createI18n(…))`, `app.use(bearer(…))`, and janus's `session()`, `permission()` and `janusErrors()`. `app.plugin(x())` keeps working, deprecated. Given to `use` first, the observers — logger, telemetry, secure-headers, cors, compress — see every response, a 404, an `onError` reply and a 500 included; cors answers a preflight to any path. A guard on the app (`bearer`, a required `session`, `rateLimit`) runs on a request no route matches too, before its 404. `janusErrors()` is a try/catch around what follows it: give it to `use` before `session()`. `idempotency` and `cache` let a request no route matches through, never kept. New types: `LoggerContext`, `TelemetryContext`, `SecureHeaders`, `RateLimit`, `CacheMiddleware`, `Bearer`, `JanusErrors`, `SessionMiddleware`.

### Patch Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The examples are written in `@alxia/core`'s middleware model: a route's body or query is validated by `validate({ … })` and its replies by `responds({ … })`, among its middlewares, in place of a schema before the handler.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs no longer use `@alxia/client`, which is retired: alxia is OpenAPI spec first, and a typed client is generated from the API's OpenAPI document. The examples call the app with `app.request()`.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs and examples mount each plugin app with `@alxia/core`'s new `app.plugin(…)` — `base.plugin(todoRoutes)`, `app.plugin(redis(client))` — `use(…)` being for middlewares, its plugin forms deprecated. `@alxia/i18n` mounts its language plugin the same way inside, and `@alxia/context-storage`'s factory, given uncalled, now says `contextStorage is a factory: use(contextStorage()), not use(contextStorage)`. `@alxia/openapi`'s guides say where `route(operation)` checks replies: the handler's, just before it, a middleware's reply sent as it is, unless `responds(operation)` stands among the middlewares.
- Updated dependencies [[`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd)]:
  - @alxia/core@0.4.0

## 0.1.2

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
