---
"@alxia/rate-limit": patch
---

The README, guide and troubleshooting key a limit by `ip` behind a proxy with core's `forwardedIp`, not the first entry of `X-Forwarded-For`, which a client writes and so bypasses the limit; a spec proves the spoofed header buys no allowance.
