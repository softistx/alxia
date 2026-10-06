---
'@alxia/react-router': minor
---

Under `react-router dev` and `vite preview`, a loader's or an action's `alxiaOf(context).server` (core's `ctx.server`) is now the `Bun.Server` the plugin relays the app's sockets to, on a loopback port, rather than `undefined`: an action's `server.publish(topic, data)` reaches the app's WebSocket subscribers in dev as from the build. Its `url` is that loopback port's, and `requestIP` and `timeout` know nothing of a request Vite took, so `ctx.ip` stays `undefined` there as before. Behind `bun build/server/index.js` it is the listening server, as it was.
