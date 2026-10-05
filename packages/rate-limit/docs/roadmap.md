# Roadmap

What `@alxia/rate-limit` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/rate-limit/CHANGELOG.md).

## Now

- **A middleware, not a plugin.** `app.use(rateLimit({ limit, windowMs }))` is
  the form; `app.plugin(rateLimit(…))`, deprecated in 0.4, was removed in 0.5.
  Given to the
  app, the limit also counts a request no route matches, and `RateLimit<Requires>`
  names what `rateLimit()` returns.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/rate-limit` installs nothing beside
  itself; `@alxia/core` is its only peer.
- **A Redis store in this package.** This package defines the store's
  contract and ships the memory store; counting across processes is
  `@alxia/redis`'s `redisStore`, which answers the same contract, so an app
  that never runs more than one process installs no Redis client.

## Shipped

### 0.1.0

- **A rate limit as a plugin**, the 0.1 form. `rateLimit({ limit, windowMs })` counts
  the requests of every route declared after it, per client address by
  default, and answers a 429 with `Retry-After` and
  `{ error: 'rate_limited', retryAfter }` past the limit.
- **Options that can work, or a startup error.** A `limit` or `windowMs`
  that is not a whole number of 1 or more throws when `rateLimit()` is
  called.
- **A 429 only behind the limit.** A route declared before the limit is
  never counted and never answers a 429. (Its place in a typed client left
  with the client: alxia is OpenAPI spec first, so the 429 is declared in
  the document a client is generated from.)
- **What the route reads.** `ctx.rateLimit` gives the limit, what is left,
  and when the allowance is whole again.
- **Standard headers.** The IETF draft's `RateLimit-Limit`, `-Remaining`,
  `-Reset` and `-Policy` on every counted response, `X-RateLimit-*` with
  `headers: 'legacy'`, or none.
- **What is counted, your way.** `key` counts by an address, a token or an
  API key, sync or async; `skip` and an `undefined` key leave a request
  uncounted. `rateLimit<{ user: User }>(…)` types them with what an earlier
  plugin adds, and an app that does not give it cannot use the limit.
- **A store contract.** `RateLimitStore` decides each request; `MemoryStore`
  counts a fixed window in one process, and `@alxia/redis`'s `redisStore`
  counts across processes. `reset(key)` forgets a key.
