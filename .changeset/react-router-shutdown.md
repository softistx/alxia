---
"@alxia/react-router": patch
---

`start` relies on `@alxia/core`'s `listen` for `SIGINT` and `SIGTERM` rather than on handlers of its own: the same order as 0.1.2 — the handlers in place before `onListen` — with core's graceful shutdown: the requests in flight drain within `shutdownTimeout`, readiness turns 503, the `onStop` hooks run, and the process exits 0, or 1 when a hook throws.
