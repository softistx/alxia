---
"@alxia/redis": minor
---

A rate limit and an idempotency defined once, in `defineRedis`. On `@nxgt/redis` 0.6, `defineRedis` takes `limits` and `idempotency` and the handle exposes `handle.limits.api` and `handle.idempotency.orders`; `redisStore(handle.limits.api)` and `idempotency(handle.idempotency.orders, { required: true })` take that wired entry, so the name, rate, `ttl` and `lease` live in the definition and its types flow through, and the keys are those `@nxgt/redis` writes, `<prefix>:<name>:<key>`, shared with every other consumer of the handle. The idempotency's `schema` is the new `idempotencyResult`. The by-name forms, `redisStore(handle, { name })` and `idempotency(handle, { name })`, are unchanged. Moving a rate limit from the by-name store to the wired one restarts its counts (the layouts differ); an idempotency keeps its keys. The peer range of `@nxgt/redis` is `^0.5.0 || ^0.6.0`: nothing here needs more than 0.5's types, and 0.5 code still works.
