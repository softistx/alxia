# Roadmap

What `@alxia/redis` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/redis/CHANGELOG.md).

## Now

Nothing in progress: `idempotency` as a middleware, the last change planned,
shipped in 0.2.0 and finished in 0.3.0.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A second Redis implementation.** `@alxia/redis` is an adapter over
  [`@nxgt/redis`](https://www.npmjs.com/package/@nxgt/redis),
  never a rewrite of it: its scripts, keys and errors are what it runs.
  They run on Bun's built-in `RedisClient`, so there is no driver to
  install, and it does not run on Node.

## Shipped

### 0.5.0: the definition read from the bound limit

- **`redisStore(handle.limits.api)` alone carries the policy.** On
  `@nxgt/redis` 0.7 a bound limit exposes its `definition`, so the store reads
  `limit` and `per` from it: `rateLimit({ store: redisStore(handle.limits.api) })`
  needs no numbers, wired or bound by hand. The two-argument form,
  `redisStore(handle.limits.api, api)`, is deprecated; it compares `limit` and
  `per` (not the prefixed name) and throws on a mismatch.
- **`idempotency(handle.idempotency.orders)` reads its definition.** It names
  itself from `definition.name` and answers a 409's `Retry-After` from the
  definition's `lease` when the guard gives none.
- **The peer is `@nxgt/redis` `^0.7.0`.** The single-argument form has no rate
  to read from an older bound limit, so it cannot degrade gracefully.

### 0.4.0: the rate, written once

- **A rate limit that reads its policy from the store.**
  `redisStore(handle.limits.api, api)`, given the definition beside the wired
  limit, declares the definition's `limit` and `per` as the store's `policy`;
  `rateLimit({ store })` takes `limit` and `windowMs` from it (optional in the
  type, with `@alxia/rate-limit` 0.4) and writes its `RateLimit-*` headers
  from it, and numbers that differ throw at declaration. `redisStore` returns
  a `PolicyStore`. The one-argument form stays, with its numbers repeated.
  (`@nxgt/redis` 0.6 does not expose a bound limit's rate, hence the
  definition as an argument.)

### 0.3.0, continued: wired guards

- **On `@nxgt/redis` 0.6 (until 0.5.0).** The peer range is `^0.5.0 || ^0.6.0`: the new forms
  need no more than 0.5's types, and 0.6 only adds `handle.limits` and
  `handle.idempotency` to wire them.
- **A rate limit and an idempotency defined once.** `redisStore(handle.limits.api)`
  and `idempotency(handle.idempotency.orders)` take what `defineRedis`
  wired, so the definition lives in one place and writes the keys
  `@nxgt/redis` writes, `<prefix>:<name>:<key>`: every consumer of the handle
  shares the count. `idempotencyResult` is the schema of the wired idempotency.
  Both older forms stay.

### 0.3.0

- **On `@nxgt/redis` 0.5 alone.** The rate limits and the idempotency that
  `@nxgt/redis-guard` held live in `@nxgt/redis` now, and `@nxgt/redis-guard`
  is no longer a peer.
- **One form for `idempotency`.** The middleware's type is a plain
  `(ctx, next)` function, and `app.plugin(idempotency(…))`, deprecated in
  0.2.0, is gone: give it to `use(…)`.
- **An `@nxgt/redis` handle everywhere.** `redis(handle)` takes the handle
  `openRedis(defineRedis({ … }))` gives: typed `caches` from its scopes, a
  `lock` and every key under its `prefix`, and the handle closed once in
  `onStop`, after the drain (`{ close: false }` to opt out). `redisStore`,
  `redisCacheStore` and `idempotency` take it where they take a client and
  put its prefix in front of their keys, and `redisCheck` is a readiness
  check for `health()`. The bare `RedisClient` forms are unchanged.

### 0.2.0

- **Middlewares, under the same names.** `app.use(idempotency(client, …))`
  replaces `app.plugin(idempotency(…))`, which stayed, deprecated, until 0.3.0;
  `IdempotencyMiddleware` is the type it returns. A request no route matches
  passes through it, never kept.
- **A client no one can tell apart is not shared.** A request with no
  `ctx.ip` and no `scope` runs unguarded, nothing stored or replayed, and
  the middleware warns once, instead of keying every such client to
  `anyone`, where one could be replayed another's response.

### 0.1.0

- **A rate limit every process shares.** `redisStore` is an
  `@alxia/rate-limit` store with GCRA in one atomic script, timed by the
  Redis server's clock; a refused request counts nothing, and the 429
  stays typed.
- **A response cache every process shares.** `redisCacheStore` is an
  `@alxia/cache` store on `@nxgt/redis`'s typed caches; a record that no
  longer reads as a response is a miss, and `invalidateTag` reaches every
  process.
- **Idempotent routes.** `idempotency` runs a `POST` or `PATCH` once per
  `Idempotency-Key`, replays its response with `Idempotent-Replayed: true`
  from any process, and answers a typed `409`, `422` or `400` for the
  repeats it cannot; a `5xx` or a stream is not kept.
- **Redis in the context.** `redis` gives routes the client, typed caches
  bound once, and a lock every process respects.
