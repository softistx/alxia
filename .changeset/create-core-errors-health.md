---
"@alxia/create": patch
---

New projects install the `@alxia/core` with problem details (`alxia({ errors: 'problem' })`), the `health()` probes and the graceful shutdown of `listen` on `SIGTERM`.
