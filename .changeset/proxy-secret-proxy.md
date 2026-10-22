---
'@alxia/proxy': patch
---

Strip the header `trustProxy({ secret })` reads before forwarding a request, so an upstream never receives the proxy secret.
