---
'@alxia/react-router': minor
---

add `@alxia/react-router/pwa`, the code with no UI an installable app shares and that imports nothing: `defineWorkerContract` (the worker's cache names from a required `cachePrefix`, `obsoleteCaches`, `clearableCaches`), `cachingFor` and `isStorable` (which requests a service worker caches and which responses it may store, with `never` and `immutable` options), `parseBrowserManifest`, `precacheList` and `assetPrecache` (the precache list read from a build), and `clearAppCaches(contract)`.
