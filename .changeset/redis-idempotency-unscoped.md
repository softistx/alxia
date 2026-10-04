---
'@alxia/redis': patch
---

`idempotency` no longer shares one key space between every client when it cannot tell them apart: a request with no `ctx.ip` and no `scope` (or a `scope` that returns `undefined`) now runs unguarded, nothing stored or replayed, and the middleware warns once, saying how to give it a scope. It used to scope such keys to `anyone`, so one client could be replayed another's response.
