---
"@alxia/janus": minor
---

The answers of `janusErrors()`, a required `session()` and `permission()` follow `@alxia/core`'s `alxia({ errors: 'problem' })`: RFC 9457 problems sent as `application/problem+json`, `janusErrors()`'s with `bodyOf(error)` — its `code` among them — as extensions and `Retry-After` kept. `JanusErrorProblem`, `UnauthenticatedProblem` and `PermissionRefusedProblem` type them, and each refusal's reply type is the union of the body and the problem; the default bodies are unchanged.
