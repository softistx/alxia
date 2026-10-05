---
"@alxia/create": patch
---

Every template's `dev` script sets `NODE_ENV=development` (`NODE_ENV=development bun --hot src/index.ts`, `NODE_ENV=development react-router dev`), since alxia's dev helps — the route table, a 404's hint, a 500's error page — are now on under `development` alone. The `api` template's `API_KEY` defaults to `dev-key` only when `NODE_ENV` is `development` or `test`: anywhere else it is required, and the app does not start without it, where it used to accept `dev-key` in production. The `graphql` template drops its `NODE_ENV` variable, which defaulted to `development`: GraphiQL follows `graphql()`'s default, the app's dev switch.
