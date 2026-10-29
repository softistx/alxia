---
'@alxia/react-router': patch
---

`FetcherResultOptions.reword` is typed `(error: ApiErrorLike) => string | undefined` and is called for an API's own refusal only, no longer for an API it cannot reach or another failure that `fetcherResult` words. A callback typed `(error: unknown)` still compiles.
