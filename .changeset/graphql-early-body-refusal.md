---
'@alxia/graphql': patch
---

The endpoint leaves a limit inherited from the app's `bodyLimit()` where that call stands, so core refuses a declared oversize body there, before the middlewares after it. Only the `bodyLimit` option, or the 1 MiB default when nothing is inherited, gives the endpoint's `POST` a limit of its own. A declared oversize `POST` now gets core's 413, without the headers Yoga's plugins set (for example `Cache-Control: no-store`); a chunked body keeps them. Needs `@alxia/core` 0.16.0.
