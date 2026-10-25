---
'@alxia/react-router': minor
---

Add `@alxia/react-router/pwa`, the code with no UI an installable app shares and that imports nothing: `defineWorkerContract` (the worker's cache names from a required `cachePrefix`, `obsoleteCaches`, `clearableCaches`), `cachingFor` and `isStorable` (which requests a service worker caches and which responses it may store, with `never`, `immutable` and `contract` options), `parseBrowserManifest`, `precacheList` and `assetPrecache` (the precache list read from a build), and `clearAppCaches(contract)`; `defineWorkerContract` checks `cacheVersion` and owns a cache by the shape of its name, `<prefix>-<kind>-<version>`, so a retired kind is still swept; and the page's side: `registerServiceWorker`, `createUpdateNotice` (the update notice's store, with no React and no singleton), and the web app manifest (`webAppManifest`, `manifestHref`, `manifestLanguage`, `MANIFEST_PATH`, `MANIFEST_HEADERS`).

Add `@alxia/react-router/pwa/react`, the page's hooks, whose only package import is `react` (an optional peer, `^19`): `useOnline`, `useServiceWorker({ enabled })` (the app passes `enabled`, such as `import.meta.env.PROD`; the package never reads it) and `useUpdateNotice`, with `updateNotice`, the page's one store; `useServiceWorker` reads its options when its effect runs and registers no cleanup.

Add `@alxia/react-router/pwa/server`, whose only package import is `@alxia/core`: `noCache`, the middleware that serves the worker's script with `Cache-Control: no-cache` and the worker's policy (declare it with `createServer({ beforeAll })`, before the client's files), `revalidated(response, policy?)` and `WORKER_POLICY`.

The package's guide moved from `docs/guide.md` to `docs/guide/`, one page per topic, and `docs/guide.md` keeps the old section anchors that links use, each pointing to its new page.
