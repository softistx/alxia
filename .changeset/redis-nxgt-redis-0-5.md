---
"@alxia/redis": minor
---

`@alxia/redis` is now on `@nxgt/redis` alone: the rate limits and the idempotency that `@nxgt/redis-guard` held moved into `@nxgt/redis` 0.5, and `@nxgt/redis-guard` (deprecated) is no longer a peer. **Upgrade:** raise `@nxgt/redis` to `^0.5.0` and remove `@nxgt/redis-guard` from your dependencies (`bun remove @nxgt/redis-guard`; `bun add @nxgt/redis@^0.5.0`). Nothing in `@alxia/redis`'s own API changes. If you import `@nxgt/redis-guard` yourself, import the same names from `@nxgt/redis`; a hand-built `IdempotencyDefinition` now needs its `lease`, which `defineIdempotency` fills with 10 000.
