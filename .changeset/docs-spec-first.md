---
"@alxia/compress": patch
"@alxia/cors": patch
"@alxia/i18n": patch
"@alxia/jwt": patch
"@alxia/language": patch
"@alxia/rate-limit": patch
"@alxia/redis": patch
"@alxia/telemetry": patch
"@alxia/zod": patch
---

The docs no longer use `@alxia/client`, which is retired: alxia is OpenAPI spec first, and a typed client is generated from the API's OpenAPI document. The examples call the app with `app.request()`.
