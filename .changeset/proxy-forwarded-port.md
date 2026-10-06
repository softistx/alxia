---
'@alxia/proxy': patch
---

Document that the client's port, read from a trusted proxy's `X-Forwarded-Port` by core's `originalUrl(ctx)`, is part of the `X-Forwarded-Host` sent upstream.
