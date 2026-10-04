---
"@alxia/create": patch
---

The `api` project is split across files: `src/context.ts` holds the base the routes read and registers it with `@alxia/core`'s `Register`, `src/routes/todos.ts` binds the operations with `defineRoutes()` and imports no app, and `src/app.ts` is `base.plugin(todoRoutes)`.
