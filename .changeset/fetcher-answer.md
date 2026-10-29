---
'@alxia/react-router': minor
---

Add `@alxia/react-router/fetcher` with `useFetcherAnswer(fetcher, onAnswer?)`: calls `onAnswer` once per answer a fetcher gives while idle, ignoring the data it already held at mount (a keyed fetcher outlives its page), reads the handler from a ref, and returns the latest answer handed over.
