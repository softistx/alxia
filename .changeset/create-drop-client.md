---
'@alxia/create': patch
---

New projects no longer install `@alxia/client`, which is retired: the `api` template's spec calls the app with `app.request()`. alxia is OpenAPI spec first, so a typed client is generated from the API's OpenAPI document, with a generator such as `@nxgt/openapi-codegen`.
