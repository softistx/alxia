---
"@alxia/openapi": minor
---

`matchesSpec` leaves out the probes of `@alxia/core`'s `health()` — `/health` and `/ready`, wherever mounted, told apart by `isHealthRoute` — as it does the routes of `apiDocs()`: no `exclude` is needed for them.
