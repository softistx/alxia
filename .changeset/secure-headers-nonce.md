---
'@alxia/secure-headers': minor
---

`secureHeaders({ nonce: true })` makes a fresh nonce for each request (128 random bits, base64), adds it to the policy's `script-src` and `script-src-elem`, or wherever the policy names the exported `NONCE`, and gives the same one to the routes declared after it as `ctx.nonce`, typed by `NonceContext`. A policy with nowhere to put it, `contentSecurityPolicy: false` with it, and `NONCE` without it are refused at startup. Without `nonce: true`, every header is what it was.
