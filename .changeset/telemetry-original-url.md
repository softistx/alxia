---
'@alxia/telemetry': minor
---

Record `url.scheme`, `server.address` and `server.port` from core's `originalUrl(ctx)`: behind `alxia({ proxy: trustProxy(…) })`, a request a trusted TLS proxy forwarded is traced as `https` and the public host, not the app's own. Without `proxy`, or from a connection that is not a trusted proxy, nothing changes.
