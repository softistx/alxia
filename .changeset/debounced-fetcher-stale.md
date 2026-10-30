---
'@alxia/react-router': patch
---

`useDebouncedFetcher` stays `loading` (stale) from the end of the pause until the route has answered for the current value. It no longer reports the previous answer as `done` and not stale for one render, which re-enabled stale results for a frame.
