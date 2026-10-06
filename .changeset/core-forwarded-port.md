---
'@alxia/core': minor
---

Read `X-Forwarded-Port` in `originalUrl(ctx)`, from the same trusted hop as the scheme and the host: `https://api.example.com:8443/…` behind a proxy that sends `X-Forwarded-Host: api.example.com` and `X-Forwarded-Port: 8443`. A port in the host wins, a value that is not digits from 1 to 65535 is ignored, the scheme's default is left out, and `untrusted: 'refuse'` now refuses a request from an untrusted connection that carries the header.
