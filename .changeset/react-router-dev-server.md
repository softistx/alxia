---
'@alxia/react-router': minor
---

Under `react-router dev` and `vite preview`, a loader's or an action's `alxiaOf(context).server` (core's `ctx.server`) is now the `Bun.Server` the plugin relays the app's sockets to, on a loopback port, rather than `undefined`: an action's `server.publish(topic, data)` reaches the app's WebSocket subscribers in dev as from the build. Its `url` is that loopback port's, and `requestIP` and `timeout` know nothing of a request Vite took, so `ctx.ip` stays `undefined` there as before.

Add `context.alxia`, the shorthand for `alxiaOf(context)`: the package augments React Router's `RouterContextProvider` with a read-only `alxia`, typed by its `Register` (core's, then `BaseContext`, with none). It is a getter that reads `alxiaContext`, so it is set exactly when that key is, and on a provider no catch-all filled it throws `alxiaOf`'s error. It is typed with `LoaderFunctionArgs` and `ActionFunctionArgs` from `react-router`; with the generated `Route.LoaderArgs` it works at runtime but `tsc` reports TS2339, because react-router's `./internal` types point at a second declaration of the class, so `alxiaOf(context)` stays the form there. `AlxiaContextOf<App>` names what `alxiaOf<App>(context)` returns.
