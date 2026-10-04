---
"@alxia/context-storage": patch
"@alxia/graphql": minor
"@alxia/janus": patch
"@alxia/react-router": patch
"@alxia/secure-headers": patch
---

Typed against `@alxia/core`'s `Alxia<Ctx, Prefix, Shortcuts>`, which has no route table any more: `session()`, `secureHeaders({ nonce: true })`, `contextStorage()`, `graphql()`, `reactRouter()` and `FreshApp` drop its `Routes` argument. `@alxia/graphql` no longer exports `GraphQLRoutes`, the route table entry of its endpoint.
