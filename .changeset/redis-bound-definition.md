---
"@alxia/redis": minor
---

`redisStore(handle.limits.api)` alone carries the rate: it reads `limit` and `per` from the bound limit's `definition` (`@nxgt/redis` 0.7), so `rateLimit({ store: redisStore(handle.limits.api) })` needs no numbers and returns a `PolicyStore`. A limit bound by hand with `bindRateLimit` does the same. The two-argument form, `redisStore(bound, api)`, still works and is deprecated: it now compares `limit` and `per` rather than the name, and throws on a mismatch (a definition of another name and the same rate is accepted). `idempotency(handle.idempotency.orders)` names itself from the definition and answers a 409's `Retry-After` from its `lease` when the guard gives none. The peer is `@nxgt/redis` `^0.7.0`: the single-argument form has no rate to read from an older bound limit.
