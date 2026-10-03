---
"@alxia/core": minor
"@alxia/openapi": minor
"@alxia/client": patch
---

Add `bodyLimit`, a per-route, per-group or app-wide request body size cap. A body over the limit gets a typed 413 `{ error: 'content_too_large', limit }`: a `Content-Length` over it is refused unread, and a streamed body is cut off as soon as it passes the limit. An `onRefusal` hook reads it as `{ kind: 'body_limit', limit }` and may answer it in its own format, so a hook must check `kind` before reading `part` or `issues`. `@alxia/openapi` documents the 413. `HttpError.name` is now typed `string`, so its subclass `ContentTooLargeError` can name itself; test with `instanceof`.
