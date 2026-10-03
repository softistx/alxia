# Roadmap

What `@alxia/rate-limit` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/rate-limit/CHANGELOG.md).

## Now

Nothing scheduled yet.

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

- **A rate limit as a plugin.** `use(rateLimit({ limit, windowMs }))` counts
  the requests of every route declared after it, per client address by
  default, and answers a 429 with `Retry-After` and
  `{ error: 'rate_limited', retryAfter }` past the limit.
- **Options that can work, or a startup error.** A `limit` or `windowMs`
  that is not a whole number of 1 or more throws when `rateLimit()` is
  called.
- **A typed 429.** The 429 is part of each limited route's type, so
  `@alxia/client` reads it, and a route declared before the limit has none.
- **What the route reads.** `ctx.rateLimit` gives the limit, what is left,
  and when the allowance is whole again.
- **Standard headers.** The IETF draft's `RateLimit-Limit`, `-Remaining`,
  `-Reset` and `-Policy` on every counted response, `X-RateLimit-*` with
  `headers: 'legacy'`, or none.
- **What is counted, your way.** `key` counts by an address, a token or an
  API key, sync or async; `skip` and an `undefined` key leave a request
  uncounted.
- **A store contract.** `RateLimitStore` decides each request; `MemoryStore`
  counts a fixed window in one process, and `@alxia/redis`'s `redisStore`
  counts across processes. `reset(key)` forgets a key.
