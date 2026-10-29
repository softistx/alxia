---
'@alxia/react-router': minor
---

`apiErrors.fetcherResult(language, about, run, options?)` takes `reword(error)` in its last argument (`FetcherResultOptions`, exported from `@alxia/react-router/errors`, which extends `RouteErrorOptions`): it receives the caught API error and returns the message to answer, or `undefined` to keep the worded one. The status stays the refusal's.
