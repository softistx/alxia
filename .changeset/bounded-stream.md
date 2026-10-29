---
'@alxia/graphql': minor
---

Add `boundedStream(source, { idleMs, totalMs, checkEveryMs, checkDebounceMs?, check, mapError?, signal? })`: wraps a subscription's async iterable so it ends cleanly after an idle period and after a total lifetime, re-runs `check` every `checkEveryMs` (also while idle) and before an event when the last check is old enough, throws `mapError(error)` when `check` fails or the source itself throws, and calls the source's `return()` at once on disconnect or any end.
