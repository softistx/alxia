---
"@alxia/create": patch
---

The `api` template pins `@nxgt/openapi-codegen` at exactly 0.7.0, which writes alxia's own 400 body, validates `in: cookie` parameters as `cookies` and supports named server-sent events; its committed `src/generated/` is regenerated.
