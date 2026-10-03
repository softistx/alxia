---
"@alxia/logger": minor
---

A streamed body (a page rendered as it goes, an event stream, a `ReadableStream` reply) is now logged once it has been sent, not when the handler returned it. Its entry's `duration` runs to the last byte, and two new fields say the rest: `timeToHeaders`, the time to the response, and `outcome`, `completed`, `aborted` (the client left; at least `warn`) or `errored` (the stream failed; `error`). A body with no length used to be logged as a success even when its client left or it failed midway. A response with no body, or with a `Content-Length` header (which `@alxia/core` sets on every reply of a string, JSON, a buffer or a file), is still logged at once and left untouched; a raw `Response` without that header is timed as a stream.
