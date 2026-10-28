---
'@alxia/react-router': patch
---

Correct the subscription proxy docs: Bun's default `idleTimeout` (10 s) is shorter than the 15 s heartbeat, so set `listen: { idleTimeout: 30 }`.
