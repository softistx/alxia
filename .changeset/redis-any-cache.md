---
'@alxia/redis': patch
---

`AnyCache`, the constraint of `redis()`'s `caches`, is exported: a function generic over the caches it hands to `redis()` names it instead of rebuilding `CacheDefinition<any, z.ZodType>`.
