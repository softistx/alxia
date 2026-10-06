---
'@alxia/core': patch
---

Document `ctx.server`, the `Bun.Server` serving the request: `listen`'s, the one given to `app.fetch(request, server)`, or `undefined` under `app.request` and `app.fetch(request)` alone. Its type doc, the README's context table and the serving guide name what it is for (`publish` to the app's sockets from any route, `timeout` for a long request) and point to `ctx.ip` over `requestIP`; troubleshooting covers `ctx.server` being `undefined` in a test. Nothing changes at runtime or in the types.
