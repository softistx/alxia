---
'@alxia/react-router': minor
---

Add `useDebouncedFetcher` to `@alxia/react-router/fetcher`: a resource route loaded through a fetcher for what is typed, after a pause and from a minimum length, with the previous answer kept (`stale`, filtered by an optional `keep`) until the new one lands, and a stable `retry`. `/fetcher` now imports `react-router` as well as `react`.
