---
'@alxia/graphql': patch
---

A streamed response (SSE, multipart) no longer leaves a listener on the server's shutdown signal; a client asking for `text/event-stream` on plain queries could grow the process's memory without bound.
