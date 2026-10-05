---
"@alxia/core": minor
---

Add `onOperation(ctx, observer)` and `startOperation(ctx, report)`, the operations a socket runs after its upgrade, for the observers around that upgrade: an observer subscribes before `next()`, is called as each operation starts, and is told `'ok'` or `'errors'` once it ends. New types `OperationObserver` and `OperationOutcome`.
