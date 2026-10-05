---
"@alxia/graphql": patch
---

A guide page, "Harden a GraphQL API for production": rate limiting the endpoint (by viewer, or by `forwardedIp` behind a proxy; a batch is one request), depth limits, introspection off outside development with `isDev`, masked errors and the `GraphQLError`s a client may read, `bodyLimit` (Yoga answers a body past it with a 400), CSRF for a cookie session, and persisted operations, each snippet type-checked and run in the GraphQL recipe.
