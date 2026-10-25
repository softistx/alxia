# Installable and offline

What an installable React Router app shares, that has no UI: the service
worker's contract, which requests the worker caches, which responses it may
store, the precache list read from a build, and the cleaning at sign-out.
Everything is in `@alxia/react-router/pwa`, and every app-specific name (the
cache prefix, the paths never cached) is an option, so two apps never share a
default.

- [What the subpath holds](#what-the-subpath-holds)
- [The worker's contract](#the-workers-contract)
- [What the worker caches](#what-the-worker-caches)
- [The precache list from a build](#the-precache-list-from-a-build)
- [Clearing at sign-out](#clearing-at-sign-out)

## What the subpath holds

`@alxia/react-router/pwa` imports nothing (`boundary.spec.ts` checks the built
file), and its code reads `caches` and other globals only inside its functions,
never at load. So each runtime can import it:

| runtime | imports it for |
| --- | --- |
| the service worker | the contract, `cachingFor`, `isStorable` |
| the page | the contract (the same names), `clearAppCaches` |
| a build script | `parseBrowserManifest`, `precacheList`, `assetPrecache` |
| the server | `SERVICE_WORKER_URL`, to serve the worker under its path |

The main entry, `@alxia/react-router`, is not for those: it imports
`@alxia/core`, which imports `node:*`, and a client bundle should not carry it.

## The worker's contract

The worker and the page must agree on the cache names: the worker fills
them, the page clears them. Write the contract once, in a module both
import:

```ts
// file: app/pwa-contract.ts
import { defineWorkerContract } from '@alxia/react-router/pwa';

export const workerContract = defineWorkerContract({ cachePrefix: 'my-app' });
```

`cachePrefix` is required: every Cache Storage cache the worker owns starts
with `my-app-`. Two apps on one origin need two prefixes. The options are:

| option | default | |
| --- | --- | --- |
| `cachePrefix` | none | a non-empty name that does not end with `-` |
| `cacheVersion` | `'v1'` | bump it when a cache's content changes shape: the next worker deletes the prefix's caches of another version when it activates |
| `serviceWorkerUrl` | `/service-worker.js` | where the build writes the worker |
| `offlineUrl` | `/offline.html` | the page served when a navigation fails |

The contract gives three cache names, `cacheNames.precache`
(`my-app-precache-v1`, the name Workbox builds from
`setCacheNameDetails({ prefix, precache: 'precache', suffix: version })`),
`cacheNames.assets` and `cacheNames.static`, and two filters over
`caches.keys()`:

```ts
// file: sw/activate.ts
import { workerContract } from '../app/pwa-contract';

export async function deleteObsoleteCaches() {
  const obsolete = workerContract.obsoleteCaches(await caches.keys());
  await Promise.all(obsolete.map((name) => caches.delete(name)));
}
```

`obsoleteCaches(names)` returns the prefix's caches that are not current;
`clearableCaches(names)` returns all of the prefix's but the current
precache. The module also exports `SERVICE_WORKER_URL`, `OFFLINE_URL` and
`SKIP_WAITING`, the message a page posts to a waiting worker.

## What the worker caches

`cachingFor(request, origin, options?)` answers with one of four words:

| answer | the request | the worker |
| --- | --- | --- |
| `navigation` | a page load | always the network, never stored; the offline page only when it fails |
| `immutable` | a hashed bundle | cache-first |
| `static` | another same-origin script, style, font or image | stale-while-revalidate |
| `none` | anything else | untouched, left to the browser |

`none` is every non-GET, every other origin, a request with an
`Authorization` header or a query, React Router's `.data` and `/__manifest`,
the worker's own path, the manifest's, a document or iframe fetch, and any
path with no static extension. The options add to that, or move the line
between `immutable` and `static`:

```ts
// file: sw/strategy.ts
import { cachingFor, isStorable } from '@alxia/react-router/pwa';

const options = {
  never: (path: string) => path.startsWith('/api/'),
  immutable: (path: string) =>
    path.startsWith('/assets/') && !path.startsWith('/assets/icons/'),
};

export function strategyOf(request: Request) {
  return cachingFor(request, self.location.origin, options);
}

export function mayStore(response: Response) {
  return isStorable(response);
}
```

| option | default | |
| --- | --- | --- |
| `never(path)` | none | paths of the app always answered fresh |
| `immutable(path)` | `path.startsWith('/assets/')` | which static paths are cache-first. This matches how `serveClient` serves `build/client/assets/`, with `immutable` for a year. A file you keep unhashed there is cached for a year by the HTTP cache anyway: [more](troubleshooting.md#an-unhashed-file-under-publicassets-is-cached-for-a-year) |
| `serviceWorkerUrl` | `SERVICE_WORKER_URL` | never cached. A value here replaces the default |
| `manifestPath` | `/manifest.webmanifest` | never cached. A value here replaces the default |

An app that gives its contract a custom `serviceWorkerUrl` passes the same value to `cachingFor` (e.g. `{ serviceWorkerUrl: contract.serviceWorkerUrl }`), or the worker's own script is cached like a static file.

The decision is on the request; `isStorable(response)` is on the answer, and
the worker asks both. A response is stored only when it is a full,
same-origin 200 of a script, style, font or image, that the server marked
`public` (alxia does on every static file it serves, and a route answering an
image, such as a user's photo, does not), neither `private` nor `no-store`,
and that does not vary on `Cookie`, `Authorization` or `*`.

## The precache list from a build

A worker precaches the code of every route, so a client navigation offline to
a route never visited still finds its modules. `react-router build` writes the
list in `build/client/assets/manifest-*.js`:

```ts
// file: scripts/precache.ts
import { readdirSync, readFileSync } from 'node:fs';
import {
  assetPrecache,
  parseBrowserManifest,
  precacheList,
} from '@alxia/react-router/pwa';

const assets = 'build/client/assets';
const files = readdirSync(assets);
const manifestFile = files.find((file) => /^manifest-.*\.js$/.test(file));
if (!manifestFile) throw new Error('Run react-router build first.');

const manifest = parseBrowserManifest(
  readFileSync(`${assets}/${manifestFile}`, 'utf8'),
);

export const precache = [
  ...precacheList(manifest),
  ...assetPrecache(files, /^body-latin-[\w-]{8}\.woff2$/),
];
```

`precacheList(manifest)` returns the manifest's own file first, then the
entry's and every route's module, imports and CSS, each once, as
`{ url, revision: null }`: a hashed name needs no revision. Only `/assets/`
files named `name-<8 hash characters>.js` or `.css` are kept, so a sprite or
an unhashed script is left out. `assetPrecache(files, include, base?)` adds
the files a regex of yours matches, such as fonts, sorted, under `/assets/`
or `base`. Chunks only a component loads on demand stay out: the cache-first
route stores them the first time they load.

## Clearing at sign-out

What the caches hold is static and public by design, and clearing them at
sign-out leaves nothing behind anyway. `clearAppCaches(contract)` deletes the
caches the worker filled but the offline page and the app's code (the current
precache), and does nothing where Cache Storage does not exist (the server,
an old browser):

```ts
// file: app/sign-out.ts
import { clearAppCaches } from '@alxia/react-router/pwa';
import { workerContract } from './pwa-contract';

export async function signOut() {
  await fetch('/sign-out', { method: 'POST' });
  await clearAppCaches(workerContract);
}
```
