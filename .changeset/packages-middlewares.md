---
"@alxia/cache": minor
"@alxia/compress": minor
"@alxia/context-storage": minor
"@alxia/cors": minor
"@alxia/i18n": minor
"@alxia/janus": minor
"@alxia/jwt": minor
"@alxia/language": minor
"@alxia/logger": minor
"@alxia/rate-limit": minor
"@alxia/redis": minor
"@alxia/secure-headers": minor
"@alxia/telemetry": minor
---

The plugins that installed request hooks are middlewares, under the same factory names: `app.use(logger())`, `app.use(telemetry(…))`, `app.use(compress())`, `app.use(cors())`, `app.use(secureHeaders(…))`, `app.use(rateLimit(…))`, `app.use(cache(…))`, `app.use(idempotency(client, …))`, `app.use(contextStorage())`, `app.use(language(…))`, `app.use(createI18n(…))`, `app.use(bearer(…))`, and janus's `session()`, `permission()` and `janusErrors()`. `app.plugin(x())` keeps working, deprecated. Given to `use` first, the observers — logger, telemetry, secure-headers, cors, compress — see every response, a 404, an `onError` reply and a 500 included; cors answers a preflight to any path. A guard on the app (`bearer`, a required `session`, `rateLimit`) runs on a request no route matches too, before its 404. `janusErrors()` is a try/catch around what follows it: give it to `use` before `session()`. `idempotency` and `cache` let a request no route matches through, never kept. New types: `LoggerContext`, `TelemetryContext`, `SecureHeaders`, `RateLimit`, `CacheMiddleware`, `Bearer`, `JanusErrors`, `SessionMiddleware`.
