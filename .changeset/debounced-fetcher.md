---
'@alxia/react-router': minor
---

Add `useDebouncedFetcher` to `@alxia/react-router/fetcher`: a resource route loaded through a fetcher for what is typed, after a pause and from a minimum length, with the previous answer kept (`stale`) until the new one lands, and a `retry`. `/fetcher` now imports `react-router` as well as `react`.
