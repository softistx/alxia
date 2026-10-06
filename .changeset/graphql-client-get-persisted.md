---
'@alxia/graphql': minor
---

`graphqlClient` from `@alxia/graphql/testing` sends a `GET` and a persisted operation. `method: 'GET'` (per call, or on the client) puts `query`, `operationName` and, as JSON, `variables` and `extensions` in the URL. `persisted` is the hash of a registered operation, sent as `extensions.persistedQuery` (the shape `@graphql-yoga/plugin-persisted-operations` reads by default) with the document or, with `query({ persisted })`, alone, so an app that allows only persisted operations can be tested; `extensions` is sent as given, for an app that reads an id of its own. The client adds no CSRF header: put the app's in `headers`.
