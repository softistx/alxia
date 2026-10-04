---
"@alxia/react-router": minor
---

`alxiaOf(context)` with no type argument reads the base `@alxia/core`'s `Register` names when this package's `Register` names no server; this package's still wins when both are declared. `RegisteredOf<R, Core>` takes that fallback as its second parameter, by default core's `RegisteredBase`.
