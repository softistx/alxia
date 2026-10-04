---
"@alxia/openapi": minor
---

`@alxia/openapi` is now alxia's spec-first toolkit, the package that was `@alxia/openapi-routes`: `implemented(app, operations)` and `matchesSpec(app, operations)` check an app's routes against the operations `@nxgt/openapi-codegen`'s `alxia` option generates from the OpenAPI document, bound with `@alxia/core`'s `route(operation, ...middlewares, handler)`. Its exports are `@alxia/openapi-routes` 0.2's, unchanged: change the import. The `@alxia/openapi` of 0.3 and before, which wrote an OpenAPI document from an app's route schemas (`openapi`, `docs`, `toJsonSchema`, `Converter` and the rest), is retired: alxia is OpenAPI spec first, so the document is the source and is written, not generated from the app. This version follows 0.3.0, the last of the retired package, so that npm's `latest` is the new one. See `@alxia/core`'s upgrading guide.
