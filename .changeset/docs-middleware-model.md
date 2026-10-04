---
"@alxia/cache": patch
"@alxia/compress": patch
"@alxia/context-storage": patch
"@alxia/janus": patch
"@alxia/jwt": patch
"@alxia/logger": patch
"@alxia/rate-limit": patch
"@alxia/redis": patch
"@alxia/zod": patch
---

The examples are written in `@alxia/core`'s middleware model: a route's body or query is validated by `validate({ … })` and its replies by `responds({ … })`, among its middlewares, in place of a schema before the handler.
