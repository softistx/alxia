---
"@alxia/create": patch
---

New projects get the `@alxia/core` minor with the middleware model, and the API template is written in it: `requireKey` is a `defineMiddleware` that answers 401 before the body is read, then `validate({ body })` and `responds({ 201 })` stand among the route's middlewares, in place of a list of hooks and a schema. Its spec checks that a request without the key is refused before its body is.
