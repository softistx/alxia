---
"@alxia/logger": minor
---

Log each operation over a socket: behind `@alxia/graphql`'s `ws: true`, every query, mutation and subscription gets a line of its own once it ended, with the upgrade's `requestId`, `operationName`, `operationType`, its `duration` and `outcome: 'ok'` or `'errors'` (a `warn`), beside the upgrade's line.
