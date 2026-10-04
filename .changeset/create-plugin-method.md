---
"@alxia/create": patch
---

The `api` template mounts its routes with `base.plugin(todoRoutes)`, `@alxia/core`'s new method for plugins, and its docs say that `route(operation)` checks the handler's reply against the spec, an auth middleware's 401 being sent as it is.
