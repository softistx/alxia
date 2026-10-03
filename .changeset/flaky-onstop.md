---
'@alxia/react-router': patch
---

`start` now calls `onListen`, or prints `alxia listening on …`, only after its `SIGINT` and `SIGTERM` handlers are in place. Before, a supervisor that sent `SIGTERM` as soon as it read that line could kill the process (exit 143) before any `onStop` hook ran.
