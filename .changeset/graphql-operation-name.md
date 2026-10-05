---
"@alxia/core": minor
---

`reportOperation(ctx, { type, name? })` and `operationOf(ctx)`: an endpoint that runs several operations behind one route tells the observers around it which one, and an observer reads one summary after `next()`, `{ type, name }`, or `type: 'batch'` and every name joined by commas for a batched body. `@alxia/graphql` reports; `@alxia/logger` and `@alxia/telemetry` read, and neither imports the other. A socket's operations are never reported. New types `OperationReport` and `OperationSummary`.
