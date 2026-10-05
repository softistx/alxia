---
"@alxia/graphql": minor
---

A subscription over server-sent events, or an incremental delivery, ends when the app starts shutting down — `@alxia/core`'s `shutdownSignal` — so the graceful shutdown of `listen` answers the queries in flight and exits without waiting for it until `shutdownTimeout`. The docs say how GraphQL errors stay in `errors[]`, inside a 200, under core's `errors: 'problem'`, which applies to the HTTP layer around the endpoint, and show `health()` beside it.
