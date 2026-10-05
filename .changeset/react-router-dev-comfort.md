---
"@alxia/react-router": patch
---

`start` prints `@alxia/core`'s route table in dev, and `alxia listening on <url>` otherwise; `listen: { onListen }` is given the core's `ListenInfo` and wins over the `onListen(server)` option.
