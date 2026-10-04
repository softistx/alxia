---
"@alxia/cache": patch
"@alxia/compress": patch
"@alxia/context-storage": patch
"@alxia/cors": patch
"@alxia/graphql": patch
"@alxia/i18n": patch
"@alxia/janus": patch
"@alxia/jwt": patch
"@alxia/language": patch
"@alxia/logger": patch
"@alxia/openapi": patch
"@alxia/rate-limit": patch
"@alxia/react-router": patch
"@alxia/redis": patch
"@alxia/secure-headers": patch
"@alxia/telemetry": patch
---

The docs and examples mount each plugin app with `@alxia/core`'s new `app.plugin(…)` — `base.plugin(todoRoutes)`, `app.plugin(redis(client))` — `use(…)` being for middlewares, its plugin forms deprecated. `@alxia/i18n` mounts its language plugin the same way inside, and `@alxia/context-storage`'s factory, given uncalled, now says `contextStorage is a factory: use(contextStorage()), not plugin(contextStorage)`. `@alxia/openapi`'s guides say where `route(operation)` checks replies: the handler's, just before it, a middleware's reply sent as it is, unless `responds(operation)` stands among the middlewares.
