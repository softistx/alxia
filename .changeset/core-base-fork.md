---
'@alxia/core': minor
---

`app.fork()` builds several apps on one base: a copy of the app — its routes, its middlewares and `derive`s in force, its lifecycle hooks, parsers and options — typed as it is, that shares nothing declared next with it. `base.fork().plugin(todos)` and a spec's `base.fork().use(fakeSession).plugin(todos)` no longer collide on the registered base. A method and path declared twice now says when `base.fork()` is the fix, naming the case where the very same route was mounted twice.
