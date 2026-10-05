---
"@alxia/telemetry": minor
---

The span of a GraphQL request follows OpenTelemetry's conventions: named `query GetNotes` (`mutation` for an anonymous one) with `graphql.operation.name` and `graphql.operation.type`, instead of `POST /graphql`. A batched body is `batch GetNotes,AddNote`, its name attribute listing every operation and no type. `http.route` stays. New exports `GRAPHQL_NAME` and `GRAPHQL_TYPE`. Needs `@alxia/core` with `operationOf`.
