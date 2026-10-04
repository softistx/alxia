---
"@alxia/graphql": patch
"@alxia/react-router": patch
---

The docs and examples give the package middlewares to `use` — `app.use(logger())`, `app.use(bearer({ jwt }))` — the request hooks being deprecated. `alxiaOf(context)` types `route` as the catch-all's `string`, `BaseContext.route` being `string | undefined` now.
