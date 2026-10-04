---
"@alxia/core": minor
---

Hooks on one route: every route method takes a list of hooks after its path — `app.patch('/bookmarks/:id', [canView, loadBookmark, canEdit], schema, handler)`, `app.get(path, [hook], handler)`, `route(operation, [hooks], handler)`, `ws(path, [hooks], schema, handlers)` — run after the hooks in force, in order, then validation, then the handler. `defineHook` and `defineWrap` make them, once, naming what they read with `defineHook<{ user: User; params: { id: string } }>()(hook)`: a route whose context or path does not give it is a compile error. What a hook adds, the hooks after it and the handler read; its replies join that route's type, so the client reads them. The hooks read `params`, `query` and `cookies` as they arrived, never the body. A list holds at most 8 hooks; a route without one costs the compiler nothing more.
