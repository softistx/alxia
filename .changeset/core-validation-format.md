---
"@alxia/core": minor
"@alxia/openapi": minor
"@alxia/client": patch
---

`onRefusal(hook)` answers a request a route's schemas refuse in your own format — an RFC 9457 problem from the new `problem()` helper, sent as `application/problem+json` — typed for the client and documented by `@alxia/openapi`; the default 400 is unchanged.
