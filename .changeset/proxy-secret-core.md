---
'@alxia/core': minor
---

`trustProxy({ secret: { header, value } })`: a proxy that proves itself with a header only it knows. The forwarding headers are believed only when `trusted` AND the secret hold (`value` may be a list, for a rotation); a wrong or missing secret is untrusted, and `untrusted: 'refuse'` or `'refuse-all'` decide what that means, which a hop count can now do with a secret. The header name is on the context, `proxySecretHeader(ctx)`, so a proxy can drop it.
