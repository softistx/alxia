---
"@alxia/logger": minor
---

The request's entry gains `operationName` and `operationType` when `@alxia/graphql` served an operation: `query`, `mutation` or `subscription`, and `batch` for a batched body, whose `operationName` lists every name joined by commas. An anonymous operation has a type and no name; the message is unchanged. `LogEntry` types both fields. Needs `@alxia/core` with `operationOf`.
