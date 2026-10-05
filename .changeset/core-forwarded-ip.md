---
"@alxia/core": minor
---

`forwardedIp({ header?, trusted })`, an `ip` option for an app behind proxies: `alxia({ ip: forwardedIp({ trusted: 1 }) })` reads the client from `X-Forwarded-For`, or from `Forwarded` (RFC 7239) with `header: 'forwarded'`, from the right: `trusted` is a number of hops (the Nth entry from the right) or CIDR ranges, or a function, of the proxies, and a connection from elsewhere is the client whatever it sends. Entries left of the proxies' own, which the client writes, are never read, so a rate limit keyed by `ip` cannot be bypassed with a header. It falls back to the connection's address when the header is missing, a hop count exceeds the entries or the entry chosen is malformed; IPv6, brackets and ports are read. The Serving guide no longer shows `split(',')[0]`, which a client could spoof.
