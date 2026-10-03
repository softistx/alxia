---
"@alxia/telemetry": minor
---

A streamed body (a page rendered as it goes, an event stream, a `ReadableStream` reply) now keeps its server span open until it has been sent: the span used to end when the handler returned the response, before the body. A body that fails midway now makes the span an error, with the stream's error as its exception, and a client that leaves midway adds an `http.response.aborted` event. A response with no body, or with a `Content-Length`, ends the span with the response, as before.
