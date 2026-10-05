---
"@alxia/openapi": minor
---

`apiDocs`: an interactive page (Scalar, or Swagger UI) and the OpenAPI document served by the app, with no configuration: `app.plugin(apiDocs({ spec: 'openapi.yaml' }))` answers `GET /docs`, `GET /docs/openapi.yaml` and `GET /docs/openapi.json`. `spec` is a YAML or JSON file, read once at startup, or an object; `path`, `ui`, `title`, `servers` and `enabled` are options. The page loads from a CDN at a pinned version with an integrity hash and sets its own `Content-Security-Policy`, which `secureHeaders` keeps. `matchesSpec` leaves its routes out, and `isApiDocsRoute` says whether a route is one.
