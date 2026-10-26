---
'@alxia/create': patch
---

The React Router template's root passes the nonce to `<Links>`, so its critical CSS hydrates without a nonce mismatch in dev.
