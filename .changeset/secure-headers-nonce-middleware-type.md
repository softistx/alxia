---
'@alxia/secure-headers': minor
---

`NoncePlugin` is renamed `NonceMiddleware`, since `secureHeaders({ nonce: true })` makes a middleware; `NoncePlugin` stays, a deprecated alias.
