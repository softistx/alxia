---
"@alxia/create": minor
---

The `api` template's tests call the app through `@nxgt/openapi-httpyz` over the generated `operations.ts`, with `@nxgt/httpyz`'s `fetch` being `app.fetch`, instead of `openapi-fetch`: each reply is a union narrowed on its status. A new project's devDependencies hold `@nxgt/httpyz` and `@nxgt/openapi-httpyz` in place of `openapi-fetch`.
