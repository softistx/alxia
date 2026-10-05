---
"@alxia/openapi": patch
---

For `@alxia/core`'s dev comfort: `apiDocs` is marked with `markFactory` as making a plugin, so `plugin(apiDocs)` throws where it is declared, `plugin(): argument 1 looks like a factory (apiDocs): call it, plugin(apiDocs())`.
