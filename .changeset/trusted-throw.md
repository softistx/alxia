---
'@alxia/core': patch
---

Answer a `trusted` function that throws at the app's error boundary. With `trustProxy({ trusted })` or `forwardedIp({ trusted })`, a function that threw gave Bun's default 500; the throw is now a logged 500 in the app's error format (a problem under `errors: 'problem'`), before any middleware or route runs. An `allow` that throws still refuses.
