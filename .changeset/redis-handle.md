---
"@alxia/redis": minor
---

An `@nxgt/redis` handle everywhere. `redis(handle)` takes what `openRedis(defineRedis({ uri, prefix, caches }))` gives: `caches` typed from its scopes, a `lock` and every key under its `prefix`, and the handle closed once in core's `onStop`, after the drain (`{ close: false }` to close it yourself). `redisStore`, `redisCacheStore` and `idempotency` accept the handle where they accept a client and put its prefix in front of their keys, so every key of the deployment shares one prefix. `redisCheck(handle, { timeout? })` is a readiness check for `health({ checks })`, its `timeout` in milliseconds named as `health({ timeout })`'s. The bare `RedisClient` forms are unchanged.
