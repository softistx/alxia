---
"@alxia/create": patch
---

The `api` template is OpenAPI spec first. `openapi.yaml` describes its operations, `GET /todos`, `POST /todos` and `GET /todos/{id}`; `bun run generate` runs `@nxgt/openapi-codegen` with its `alxia` option into `src/generated/`, which is committed, so the project and its image build with no generation step; `src/routes/todos.ts` binds each route with `route(operations.createTodo, requireKey, handler)`; and `src/app.spec.ts` asserts `matchesSpec` from `@alxia/openapi`. `bun run verify` starts with `bun run generate --check`, which fails when `src/generated/` is not what `openapi.yaml` gives. New projects install `@alxia/openapi` at the version this release was published beside, and `@nxgt/openapi-codegen` pinned exactly and kept at that version, so `bun run verify` passes in a fresh project whatever a later generator release writes. Biome is pinned exactly too, moved to the newest patch of its minor.
