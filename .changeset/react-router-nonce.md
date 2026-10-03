---
'@alxia/react-router': minor
---

`nonceOf(loadContext)` reads the request's CSP nonce in `entry.server.tsx`: the `nonce` that `@alxia/secure-headers`' `nonce: true`, or a `derive` of the app's own, put on the context, or `undefined`. Passed to `<ServerRouter nonce>` and React's renderer, it lands on every script the page renders. Neither package depends on the other.
