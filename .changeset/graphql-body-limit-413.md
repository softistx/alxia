---
"@alxia/graphql": patch
---

A body past core's `bodyLimit` is answered with core's 413 (problem+json under `errors: 'problem'`), with a `Content-Length` or chunked, instead of Yoga's 400 "POST body sent invalid JSON."; and Yoga's 400 for a request it cannot parse no longer carries the parser's error in `extensions.originalError`.
