---
"@alxia/graphql": minor
---

Add `graphqlClient(app, { path?, headers? })` in `@alxia/graphql/testing`: it POSTs a query, its variables, operation name and headers to the endpoint in process through `app.fetch`, with no server, and resolves to `{ status, data, errors, response }`. A string or a `TypedDocumentNode` (or `graphql`'s `TypedQueryDocumentNode`) is accepted and types the answer. It is a subpath, so the main entry and a production bundle do not carry it.
