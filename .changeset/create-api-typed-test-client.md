---
"@alxia/create": minor
---

The `api` template's tests call the app through a typed client: openapi-fetch over the generated `paths.ts`, with `app.fetch` as its `fetch`, so no server runs and every path, body and reply in `src/app.spec.ts` is typed by `openapi.yaml`. One test keeps `app.request`.
