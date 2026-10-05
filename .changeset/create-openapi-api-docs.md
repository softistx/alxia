---
"@alxia/create": patch
---

New projects install `@alxia/openapi` with `apiDocs`: the `api` template serves its API reference at `/docs`, from `openapi.yaml` imported into the bundle (`import spec from "../openapi.yaml"`), so the image, which holds `dist/` alone, needs no copy of the file. It is on in development and off elsewhere unless `API_DOCS=true`. `@alxia/openapi` moves from the template's `devDependencies` to its `dependencies`.
