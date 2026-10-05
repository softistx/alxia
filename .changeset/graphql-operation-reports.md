---
"@alxia/graphql": minor
---

The endpoint reports each operation it executes or subscribes to, its type and its name, to the middlewares around it, through a Yoga plugin added after the app's own: `@alxia/logger` and `@alxia/telemetry` now say `GetNotes` where every call was an anonymous `POST /graphql`. A batched body reports each operation; a request refused before it executes, and an operation over `ws: true`, report none. Needs `@alxia/core` with `reportOperation`.
