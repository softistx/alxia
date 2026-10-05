---
'@alxia/rate-limit': patch
---

Document that the default key, `ctx.ip`, is one text per address under core's canonical `ctx.ip`, so an IPv4-mapped or uncompressed IPv6 notation counts against the same bucket, with a spec that holds it.
