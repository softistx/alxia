---
'@alxia/rate-limit': minor
---

A store may declare its own policy. `RateLimitStore` gains an optional `policy?: { limit, windowMs }`, and `PolicyStore` names a store that has one. With such a store, `rateLimit({ store })` reads `limit` and `windowMs` from it — both are optional in the type — and writes its `RateLimit-*` headers from it, so the rate is written once. Without a policy they stay required. A `limit` or `windowMs` that differs from the store's policy throws a `TypeError` at declaration. Every existing form works as before.
