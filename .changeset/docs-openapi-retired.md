---
"@alxia/core": patch
"@alxia/react-router": patch
"@alxia/secure-headers": patch
---

The docs no longer name the `@alxia/openapi` that wrote a document from an app, which is retired: alxia is OpenAPI spec first, and `@alxia/openapi` is now the package that checks an app's routes against the operations generated from the document (`matchesSpec`). `isReactRouterRoute` is documented for `matchesSpec`'s `exclude`. `@alxia/core`'s upgrading guide covers the move.
