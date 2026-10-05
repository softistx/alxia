---
'@alxia/core': minor
---

A 405 or a 426 runs the chain in force of the routes at its path before it answers: a guarded group without a prefix, `group(g => g.use(guard).get('/secret', …))`, now refuses `DELETE /secret` with its guard's 401 or 403 and no `Allow`, as a prefixed group already did, instead of a 405 whose `Allow` told the route and its methods. A request the guard lets through gets the 405 and its `Allow`, unchanged. When several groups own methods at one path, each one's chain runs, in the order declared, and the first refusal is the answer. The app's own chain still runs first, once; a hook two routes share runs once; a route's own middlewares and its `validate` never run there. A 404 runs the app's chain alone, as before, and a preflight `cors()` answers is still answered before any guard. This applies to a group inside a mounted `plugin(app)` too, and the dev 405 `hint` follows the `Allow`.
