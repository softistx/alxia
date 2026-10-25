---
'@alxia/react-router': minor
---

Add `@alxia/react-router/pwa/worker`, the service worker on Workbox: `startWorker({ contract, caching?, assets?, static?, navigationPreload?, precache? })` registers the precache route, `NetworkOnly` for a page load (the precached offline page answers when the network fails), `CacheFirst` for hashed bundles and `StaleWhileRevalidate` for other static files, both storing only what `isStorable` accepts, sweeps the contract's obsolete caches on `activate` and applies `SKIP_WAITING`. The six `workbox-*` packages (`core`, `expiration`, `navigation-preload`, `precaching`, `routing`, `strategies`, `^7`) are optional peers and the subpath's only package imports; it does nothing when imported, uses no worker global (so it compiles under the app's DOM `tsconfig`), and reads the precache list from `globalThis.__ALXIA_PRECACHE__`, which a build defines, or from `options.precache`.
