---
"@alxia/create": patch
---

New projects get the `@alxia/core` minor with the middleware model. The API template still writes its key check with `defineHook`, which the minor deprecates but keeps working; it moves to `defineMiddleware` in a later release.
