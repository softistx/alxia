# Roadmap

What `@alxia/redis` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/redis/CHANGELOG.md).

## Now

- **`idempotency` as a middleware.** `app.use(idempotency(client, { name }))` is
  the form; `app.plugin(idempotency(…))`, deprecated in 0.4, was removed in 0.5.
  It skips a
  request no route matches, and keeps what the route answers, an error's
  answer included. `redis()` stays a plugin.

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
