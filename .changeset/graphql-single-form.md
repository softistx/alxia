---
"@alxia/graphql": minor
---

For `@alxia/core` 0.5: `graphql()` is typed by `Alxia<Ctx, Prefix>`, without the removed `Shortcuts` parameter. A guard before the endpoint is any `(ctx, next)` middleware given to `use`, `bearer()` among them, and what it passes `next` is typed into the resolvers; the docs show it.
