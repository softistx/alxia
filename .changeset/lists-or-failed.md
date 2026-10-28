---
"@alxia/react-router": minor
---

`@alxia/react-router/lists` exports the loader half of `usePagedRows`: `orFailed(after, run)`, `FAILED` (`{ failed: true }`), `isFailedPage` and `FailedPage`. With no `after` an error is rethrown; with an `after` it answers `FAILED`, so the rows stay with a retry, except a 3xx `Response`, which is rethrown. Additive.
