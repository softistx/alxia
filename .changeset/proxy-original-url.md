---
'@alxia/proxy': minor
---

Send `X-Forwarded-Proto`, `X-Forwarded-Host` and `Forwarded`'s `proto` and `host` from core's `originalUrl(ctx)`: behind `alxia({ proxy: trustProxy(…) })`, the upstream gets the scheme and host the trusted proxy said, so a chain stays truthful. Without `proxy`, nothing changes, and `trustForwarded` keeps its meaning.
