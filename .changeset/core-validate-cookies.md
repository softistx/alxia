---
"@alxia/core": patch
---

Take, after a `validate({ cookies })` whose output is no `Record<string, string>` (an optional cookie, a coerced one), the shared middlewares that read the cookies as they arrive: one made by `defineMiddleware(fn)` with no context, one typed by `BaseContext`, a guard typed by the keys it requires. They were refused with "`cookies` is in the context with another type than this middleware reads"; a middleware that names a cookies shape of its own is still checked against the schema's output. The guide now says what a middleware reads of its context after `next()`.
