# Roadmap

What `@alxia/cache` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/cache/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/cache` installs nothing beside itself
  and its `@alxia/core` and `typescript` peers: it is built on Bun's and the
  web platform's own APIs, so adding it to an app adds no package to audit
  or update.
- **A Redis store in this package.** This package defines the store's
  contract and ships the memory store; sharing responses across processes
  is `@alxia/redis`'s `redisCacheStore`, which answers the same contract, so
  an app that runs one process installs no Redis client. The plugin never
  knows which store it was given.

## Shipped

### 0.1.0

- **Response caching as a plugin.** `use(cache({ ttl }))` answers the `GET`
  and `HEAD` requests of every route declared after it from a store while
  they are fresh, and from the route otherwise, saying `X-Cache: HIT` or
  `MISS` and `Age`.
- **Stale while revalidate.** With `staleWhileRevalidate`, an expired
  response is still served at once, as `X-Cache: STALE`, while one request
  refreshes it behind: no client waits for a slow route.
- **One run for many misses.** Concurrent requests for a missing response
  wait for one run of the route, not one each, when its response is kept.
- **Only what may be shared.** A response is kept only with a status in
  `statuses` (`200` by default), and never when it says
  `Cache-Control: private` or `no-store`, sets a cookie, streams events, or
  its route calls `cache.skip()`.
- **ETags and 304s.** Every kept response gets a weak `ETag` from its body
  when the route set none, and a client whose copy is current gets a 304.
- **Keys your way.** The path and query by default; `vary` adds request
  headers to the key and to `Vary`; `key` replaces it, and `undefined`
  leaves a request uncached. `defaultKey` builds the default one.
  `cache<{ user: User }>(…)` types `key` and `tags` with what an earlier
  plugin adds, and an app that does not give it cannot use the cache.
- **Invalidation.** `invalidate(path)` forgets every response kept for a
  path, whatever its key, and
  `invalidateTag(tag)` every response tagged by the plugin's `tags` or by
  its route's `cache.tag()`.
- **A store that cannot answer costs the cache, not the response.** A
  lookup that fails is a miss and a keep that fails keeps nothing, logged
  once per outage; an invalidation rejects, so the code that changed the
  data knows.
- **A store contract.** `CacheStore` is four methods; `MemoryCacheStore`
  keeps the least recently read responses of one process, within
  `maxEntries` and `maxBytes`, and `@alxia/redis`'s `redisCacheStore` shares
  them across processes.
