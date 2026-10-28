---
'@alxia/graphql': patch
---

Document that Bun's default `idleTimeout` (10 s) resets an idle SSE subscription before Yoga's first 12 s ping, and the `idleTimeout: 30` fix, in the subscriptions guide and troubleshooting.
