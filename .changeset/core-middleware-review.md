---
"@alxia/core": minor
---

The middleware model, reviewed:

- `use(path, guard)` reads the request's path as the router, the static files and React Router read it, and fails closed: each segment decoded (`%2F` splits one), empty segments collapsed, compared without case, a segment that does not decode or a `.`/`..` running the guard. `/%61dmin/panel`, `//admin/x`, `/admin%2Fx` and `/files/PRIVATE/s.txt` no longer pass a guard on `/admin` or `/files/private`.
- A plugin's own `use(path, guard)` moves under the prefix the plugin is mounted at, in an app's prefix or a group: `alxia({ prefix: '/api' }).plugin(alxia().use('/admin', guard)…)` guards `/api/admin`.
- A plugin with a prefix of its own (`alxia({ prefix: '/todos' })`, `defineRoutes('/todos')`) keeps its middlewares, `derive`s and `decorate`s under that prefix once mounted, as a group does: its routes and the unmatched requests under it, not the routes after `plugin`, to whose context it adds nothing (`MountedIn`). A plugin without a prefix keeps giving them to the app.
- A group's middlewares run on an unmatched request under its prefix too: a guarded group answers `/admin/missing` and `DELETE /admin/secret` with its guard, not a 404 or a 405 whose `Allow` lists its methods.
- `settle(ctx, next())` no longer swallows the error: once the observer returns, the error goes on to the middlewares around it, so a try/catch middleware catches it wherever it stands (`use(janusErrors()).use(i18n).use(session())` answers a janus error), and the response the observers made is sent when none does.
- The deprecated `plugin(middleware)` keeps its 0.3 meaning: app-wide, on the routes declared before it too, so `.get(…).plugin(secureHeaders())` keeps its headers. Given after routes it warns once in development, as `use(middleware)` given after routes does, naming the routes it does not run on.
- A middleware that calls `next()` then throws while the rest had already rejected no longer leaves an unhandled rejection, which exited the process.
- `use`'s middleware form is reported first in a compile error, and a plain `(ctx, next)` function reads `is not assignable to type 'MadeByDefineMiddleware'`. New types `MadeByDefineMiddleware` and `MountedIn`.
- `app.routes[i].schema` holds the route's options alone: the schemas of `validate` and `responds`, which nothing read, are no longer merged into it.
