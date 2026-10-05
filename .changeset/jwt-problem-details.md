---
"@alxia/jwt": minor
---

`bearer()`'s 401 follows `@alxia/core`'s `alxia({ errors: 'problem' })`: an RFC 9457 problem sent as `application/problem+json`, `reason` and `issues` its extensions, the `WWW-Authenticate` challenge kept, typed `UnauthorizedProblem`. The `Bearer` type's 401 is `UnauthorizedBody | UnauthorizedProblem`; the default body is unchanged.
