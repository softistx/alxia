---
'@alxia/redis': minor
---

A rate limit that reads its policy from the store. `redisStore(handle.limits.api, api)`, given the definition beside the wired limit, declares the definition's `limit` and `per` as its `policy`, so `rateLimit({ store })` needs no `limit` nor `windowMs` and its `RateLimit-*` headers come from the definition; numbers that differ throw at declaration. A definition that is not the one that wired the limit is a `TypeError`. (`@nxgt/redis` 0.6 does not expose a bound limit's rate, hence the definition as an argument.) `redisStore(handle.limits.api)` alone is unchanged. Requires `@alxia/rate-limit` 0.4.
