---
'@alxia/core': minor
---

`app.all(path, options?, ...middlewares, handler)` declares one route for every method at a path, typed as `get`'s — the same middlewares, `validate`, `responds`, options, `defineRoutes` and `Register` — and listed in `app.routes`, the dev route table and the 404 hint as `ALL`. `app.all(path, options?, end)` ends it with a middleware that answers in place of a handler, such as `@alxia/proxy`'s `proxy(url)`: its `Response` is sent, its `next()` answers 404. A route of the path's own method wins over it whatever the order declared, a `HEAD` goes to the path's `GET` first, a socket's upgrade needs a `ws` route, and its path never answers 405. `RouteDefinition['method']` gains `'ALL'`. Every route method now shares one set of forms (`RouteApp<Method, …>`), so an app's methods are typed once: a route's type error names `RouteApp<Method, …>` where it named the method.
