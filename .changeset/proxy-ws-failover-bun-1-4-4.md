---
'@alxia/proxy': patch
---

`proxy.ws()` fails over again on Bun 1.4.4: a refused or unresolved connect now goes to the next upstream. Bun 1.4.4 closes every failed WebSocket connect with 1006 and an empty reason, and names a failed connect in the `error` event's `error.code` (`ECONNREFUSED`, `ENOTFOUND`); the proxy reads that code, and still reads the `Failed to connect` reason of earlier Bun versions.
