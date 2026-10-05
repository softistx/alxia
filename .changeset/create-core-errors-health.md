---
"@alxia/create": patch
---

New projects install the `@alxia/core` with problem details, the `health()` probes and the graceful shutdown of `listen`. The `api` template answers alxia's own errors as RFC 9457 problems (`alxia({ errors: "problem" })`, its `openapi.yaml` declaring the 400 as a `ValidationProblem` in `application/problem+json`); the `api` and `graphql` templates mount `health()` (`GET /health`, `GET /ready`) before their routes. The `minimal`, `api` and `graphql` templates no longer install their own `SIGINT` and `SIGTERM` handlers: `listen` drains the app and exits on them.
