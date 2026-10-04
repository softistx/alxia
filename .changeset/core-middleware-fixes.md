---
"@alxia/core": minor
---

Fixes to the middleware model:

- A middleware that calls `next()` and returns nothing answers with the rest of the route's response, as Koa and Hono do, rather than a 500 after the handler ran. One that returns its own reply before the `next()` it called settled (`next(); return reply(403)`) has its reply sent once the rest has run, with a warning, and the rest's error is logged instead of left as an unhandled rejection.
- On a socket route, what a middleware returns after `next()` once the upgrade happened is ignored, and what it throws is logged: an app-wide middleware that wraps every response no longer turns an open socket's upgrade into a 500.
- The implicit `responds` of `route(operation)` stands just before the handler, after its `validate`, and checks the handler's reply alone: an auth's 401 whose body differs from the operation's is sent as it is, no longer a 500. `responds(operation)` reads an operation's responses; placed among the middlewares, it checks the replies of those after it, as before, and the implicit one is left out.
- A second `validate` of the cookies checks the request's cookies, not the first one's output: no more spurious 400.
- A route with no middleware and no schema runs no validation, and the schema of 0.3 validates only its parts: what a middleware of `use` passed `next` — a `body` — reaches the handler.
- The exported `Middleware` type no longer leaks `any` into a route's context (`MiddlewareResult`'s brand is `Next`), which had turned off the check of what later middlewares require.
- `validate` and `responds` are marked by `Symbol.for('alxia.builtin')`, so a second copy of `@alxia/core` recognises them, and carry `BuiltinMark` in their type (new export).
- A list of hooks mixed with middlewares — `app.get(path, [hook], middleware, handler)`, `route(operation, [hook], middleware, handler)` — throws when the route is declared, rather than drop an argument.
- A middleware whose requirement the route's context does not give is reported on the middleware forms of a route, `ws`, `route(operation)` and `use`, naming the missing key, rather than on the deprecated list of hooks.
