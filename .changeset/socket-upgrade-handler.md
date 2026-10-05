---
"@alxia/core": minor
---

Add an `upgrade` socket handler: `app.ws(path, ...middlewares, { upgrade, open, message })` awaits `upgrade(data, headers)` after the route's middlewares and before the `101`. `data` is what `socket.data` will be, `headers` the `101`'s, and a throw answers the upgrade request in the app's error format, with no socket opened.
