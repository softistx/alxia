---
'@alxia/core': minor
---

Add `alxia({ proxy: trustProxy({ trusted, header?, untrusted? }) })` and `originalUrl(ctx)`: the proxies in front of the app, declared once, give `ctx.ip` and the scheme and host the client asked for (`X-Forwarded-Proto` and `X-Forwarded-Host`, or `Forwarded`'s `proto=` and `host=`), read from a trusted connection alone, from what the proxies wrote, and checked (`http` or `https`, a bare `host[:port]`). With `untrusted: 'refuse'`, a request carrying forwarding headers from any other connection is answered 403 in the app's error format; one that carries none, a health probe's, passes. `forwardedIp` keeps working, now over the same reading; the one difference is that a quoted `for=` of `Forwarded` has its `\` escapes undone, as RFC 7239 reads it. Under a hop count, a request whose address entry is missing or malformed has its scheme and host ignored, as its address is.
