---
'@alxia/core': minor
---

A declared oversize body is refused where `bodyLimit()` stands. A request whose `Content-Length` is over the limit is refused at the last `bodyLimit()` in force for the route, or at the head of a route's own middlewares for a `bodyLimit` option, or where a plugin declared it, before any byte is read: the middlewares before that step run, the ones after it and the handler do not. **Breaking:** a middleware that answers a refusal in its own format, or that must see the refused request, goes before `bodyLimit()`; a route that never read its body now answers 413 to an oversize declared one. A `Content-Length` is read as plain digits (`1e3` and `0x10` are no longer lengths) and a chunked body is still cut at the read. The step is shown as `bodyLimit` in the dev route table. See [Upgrading](https://github.com/softistx/alxia/blob/develop/packages/core/docs/upgrading.md#0160).
