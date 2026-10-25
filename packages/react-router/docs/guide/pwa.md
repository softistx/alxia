# Installable and offline

What an installable React Router app shares, that has no UI: the service
worker's contract, which requests the worker caches, which responses it may
store, the precache list read from a build, registering the worker and
offering an update, the web app manifest, and the cleaning at sign-out.
The code is in `@alxia/react-router/pwa`, its React hooks in
`@alxia/react-router/pwa/react`, the server's `noCache` in
`@alxia/react-router/pwa/server`, and every app-specific name (the
cache prefix, the paths never cached) is an option, so two apps never share a
default.

The worker itself (its Workbox strategies) and the build that writes it stay
the app's for now: the [roadmap](../roadmap.md#next) lists them.

- [What the subpath holds](#what-the-subpath-holds)
- [The worker's contract](#the-workers-contract)
- [What the worker caches](#what-the-worker-caches)
- [The precache list from a build](#the-precache-list-from-a-build)
- [Registering the worker and offering an update](#registering-the-worker-and-offering-an-update)
- [The web app manifest (and why the language travels in `?lang=`)](#the-web-app-manifest-and-why-the-language-travels-in-lang)
- [In React](#in-react)
- [Clearing at sign-out](#clearing-at-sign-out)
- [Serving the worker's script](#serving-the-workers-script)
- [Adopting from an app's own copy](#adopting-from-an-apps-own-copy)

## What the subpath holds

`@alxia/react-router/pwa` imports nothing (`boundary.spec.ts` checks the built
file), and its code reads `caches` and other globals only inside its functions,
never at load. So each runtime can import it:

| runtime | imports it for |
| --- | --- |
| the service worker | the contract, `cachingFor`, `isStorable` |
| the page | the contract (the same names), `registerServiceWorker`, `createUpdateNotice`, `manifestHref`, `clearAppCaches` |
| a build script | `parseBrowserManifest`, `precacheList`, `assetPrecache` |
| the server | `SERVICE_WORKER_URL`, to serve the worker under its path; `MANIFEST_PATH`, `MANIFEST_HEADERS`, `manifestLanguage` and `webAppManifest`, to serve the manifest |

`@alxia/react-router/pwa/react` is the page's hooks and needs `react`, an
optional peer of the package (`^19`): its built file imports `react` and
nothing else, and shares no chunk with the main entry, so a page never loads
core for it (`boundary.spec.ts` checks both). Keep it out of the worker and
the build script, which would bundle React.

`@alxia/react-router/pwa/server` is `noCache` and needs `@alxia/core`, a peer
the package already has: its built file imports `@alxia/core` and nothing
else (`boundary.spec.ts` checks it). It is for the server file alone.

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
| `immutable(path)` | `path.startsWith('/assets/')` | which static paths are cache-first. This matches how `serveClient` serves `build/client/assets/`, with `immutable` for a year. A file you keep unhashed there is cached for a year by the HTTP cache anyway: [more](../troubleshooting.md#an-unhashed-file-under-publicassets-is-cached-for-a-year) |
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

## Registering the worker and offering an update

`registerServiceWorker(navigator.serviceWorker, onWaiting, options?)`
registers the worker (`options.url`, `/service-worker.js` by default, and
`options.scope`, `'/'`) and calls `onWaiting(worker, apply)` for each new
version that finished installing while an older one controls the page. A
first install controls nothing, so it offers nothing. `apply(worker)` posts
`SKIP_WAITING`, and reloads once when the new worker takes control. When the
tab comes back to the foreground the registration checks for an update, as a
long-lived page would otherwise only on its next full load. Run it after the
page has loaded, so it never competes with it:

```ts
// file: app/register.ts
import {
  afterLoad,
  createUpdateNotice,
  registerServiceWorker,
  sessionStore,
} from '@alxia/react-router/pwa';

export const notice = createUpdateNotice(sessionStore);

export function startWorker() {
  if (!('serviceWorker' in navigator)) return;
  afterLoad(() => {
    registerServiceWorker(navigator.serviceWorker, (worker, apply) =>
      notice.offer(() => apply(worker)),
    ).catch(console.error);
  });
}
```

With several tabs open, a tab that did not click "Reload" never reloads on
its own (a form may be half filled); once another tab has activated the
worker, its "Reload" reloads at once, and a double click reloads once.
`registerServiceWorker` is made of two parts you can use alone:
`watchForUpdates(registration, container, onWaiting)` finds each waiting
worker, and `createUpdater(container, reload?)` returns the `apply` that posts
`SKIP_WAITING` and reloads once.

Call it from a browser-only effect, and only in production: a worker under a
dev server caches the code you are editing.

`createUpdateNotice(storage, key?)` is the state a banner reads. `offer(apply)`
says a version waits; `current()` returns `{ reload, later }`, the same object
until it changes, or `undefined`; `subscribe(listener)` returns the function
that stops listening. These are the three arguments of React's
`useSyncExternalStore`, so a hook is `useSyncExternalStore(notice.subscribe,
notice.current, () => undefined)`. `later()` hides the notice for the tab's
session: it is written under `key` (`UPDATE_LATER_KEY`, `alxia.update-later`,
by default) in `storage()`. `sessionStore` is `sessionStorage` or nothing, and
a storage that is missing or throws (private mode) only hides the notice on
that page. The notice and the registration touch no global at load, and
neither imports React.

## The web app manifest (and why the language travels in `?lang=`)

A browser fetches the manifest without cookies, so a `language` cookie never
reaches it. The page names its language in the query, and the server reads it:

```tsx
// file: app/root.tsx
import { manifestHref } from '@alxia/react-router/pwa';

export function links() {
  return [{ rel: 'manifest', href: manifestHref('fr') }];
}
```

```ts
// file: app/manifest-route.ts
import {
  MANIFEST_HEADERS,
  manifestLanguage,
  webAppManifest,
} from '@alxia/react-router/pwa';

const LANGUAGES = ['en', 'fr'] as const;

export function manifestResponse(request: Request, accepted: 'en' | 'fr') {
  const lang = manifestLanguage(new URL(request.url), LANGUAGES, accepted);
  const manifest = webAppManifest({
    name: 'My app',
    description: lang === 'fr' ? 'Mon application' : 'My app',
    lang,
    themeColor: '#1e40af',
    backgroundColor: '#ffffff',
    categories: ['productivity'],
  });
  return new Response(JSON.stringify(manifest), { headers: MANIFEST_HEADERS });
}
```

`manifestLanguage(url, supported, fallback)` returns `?lang=` when it is one
of `supported`, else `fallback`: pass the request's `Accept-Language`, never
its cookie, because `MANIFEST_HEADERS` says `Vary: Accept-Language`. Those
headers also make it cacheable for an hour and give it a policy that loads
nothing: the pages' policy carries a nonce, and a nonce never goes in a
response a cache may keep.

`webAppManifest(options)` takes the texts and colours you translate and
choose, and keeps the rest the same in every language, so switching language
never makes a second app:

| option | default | |
| --- | --- | --- |
| `name`, `description`, `lang`, `themeColor`, `backgroundColor` | none | required |
| `shortName` | `name` | |
| `dir` | `'ltr'` | |
| `categories` | left out | |
| `icons` | `MINIMAL_2023_ICONS` | the four files `@vite-pwa/assets-generator`'s `minimal2023Preset` writes in `public/`: 64, 192, 512 and a maskable 512. A browser needs a 192 and a 512 to offer the install |
| `id`, `startUrl`, `scope` | `'/'` | |
| `display` | `'standalone'` | |

Serve the manifest at `MANIFEST_PATH`, or at a path of your own that you give
both `manifestHref(language, path)` and `cachingFor`'s `manifestPath`. The
icons' files are yours: test that each `src` exists in `public/`.

## In React

`@alxia/react-router/pwa/react` wraps the page's side in three hooks and the
page's one notice. It needs `react` (`bun add react`, which a React Router app
has already).

```tsx
// file: app/app.tsx
import { useServiceWorker } from '@alxia/react-router/pwa/react';
import { Outlet } from 'react-router';
import { UpdateBanner } from './update-banner';

export default function App() {
  useServiceWorker({
    enabled: import.meta.env.PROD,
    onError: (error) => console.warn('No service worker', error),
  });
  return (
    <>
      <UpdateBanner />
      <Outlet />
    </>
  );
}
```

```tsx
// file: app/update-banner.tsx
import { useOnline, useUpdateNotice } from '@alxia/react-router/pwa/react';

export function UpdateBanner() {
  const notice = useUpdateNotice();
  const online = useOnline();
  if (!online) return <p role="status">You are offline.</p>;
  if (!notice) return null;
  return (
    <p role="status">
      A new version is ready.
      <button type="button" onClick={notice.reload}>Reload</button>
      <button type="button" onClick={notice.later}>Later</button>
    </p>
  );
}
```

- **`useServiceWorker({ enabled })`** registers the worker after the page has
  loaded, when `enabled` and the browser has `navigator.serviceWorker`. The
  app passes `enabled`, usually `import.meta.env.PROD`: this package never
  reads `import.meta.env`, since a bundler replaces it in a dependency only
  by chance of its pre-bundling, and Bun and tests never do. `url` and `scope`
  are `registerServiceWorker`'s. `onError` is called when registering fails
  (private mode, a blocked script); the app works without a worker, so by
  default the error is dropped. The effect runs again only when `enabled`,
  `url`, `scope` or `notice` change, never for a new inline `onError`.
- **`useUpdateNotice(notice?)`** is `useSyncExternalStore` over the store: the
  `{ reload, later }` while a version waits, else `undefined`, and always
  `undefined` on the server and while hydrating.
- **`useOnline()`** is `navigator.onLine`, `true` on the server and while
  hydrating, so the first client render matches the server's.
- **`updateNotice`** is the page's one store. It is made in this subpath, not in
  `/pwa`, so the model a worker bundle imports does nothing at load. Both
  hooks use it unless given another `notice`; pass the same store to both
  when you make your own with `createUpdateNotice(storage, key)`.

A banner from a component library takes the notice as a prop, so it depends
on neither this package nor React Router: `<UpdateBanner notice={useUpdateNotice()} />`.
A spec or a story passes a notice of its own, made with `createUpdateNotice`
and `offer(() => {})`, and the quality checks that show the banner in
development call `updateNotice.offer(() => location.reload())` from an effect
of the app, which this package leaves out.

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

## Serving the worker's script

Two things are true of the worker's script and of no other static file. It
must be revalidated on every update check: the client's top-level files are
served for an hour, and an update would wait that long. And it takes the
policy its own response carries, not the pages': it runs no other script and
fetches this site only. `noCache` sets `Cache-Control: no-cache` and
`WORKER_POLICY` (`default-src 'none'; connect-src 'self'`) on the response of
the path it is declared for.

Declare it in `beforeAll`, which runs before the client's files. A middleware
declared in `configure` comes after them, and the file answers before it
runs:

```ts
// file: app/server.ts
import { createServer } from '@alxia/react-router';
import { SERVICE_WORKER_URL } from '@alxia/react-router/pwa';
import { noCache } from '@alxia/react-router/pwa/server';

export default createServer({
  beforeAll: (app) => app.use(SERVICE_WORKER_URL, noCache),
});
```

A worker that fetches an API of another origin needs a wider policy. Write
the middleware with `revalidated(response, policy)`:

```ts
import { defineMiddleware } from '@alxia/core';
import { revalidated } from '@alxia/react-router/pwa/server';

const POLICY = "default-src 'none'; connect-src 'self' https://api.example.com";

export const workerScript = defineMiddleware(async (_ctx, next) =>
  revalidated(await next(), POLICY),
);
```

Declare the offline page's policy in its own `<meta>`: it is the one other
document in `build/client`, and `noCache` does not touch it.

## Adopting from an app's own copy

An app that grew its own `app/core/pwa/` replaces each local module with the
package's. The names are the same unless the table says otherwise:

| old local module | now |
| --- | --- |
| `model/worker-contract.ts` (cache names, `SERVICE_WORKER_URL`, `OFFLINE_URL`, `SKIP_WAITING`) | `defineWorkerContract({ cachePrefix })` from `@alxia/react-router/pwa`, kept in one module of the app that exports `workerContract`; the three constants are imported from the same subpath |
| `model/cacheability.ts` (which requests are cached) | `cachingFor(request, origin, options)` and `isStorable(response)` from `@alxia/react-router/pwa`; the app's own paths become the `never` and `immutable` options |
| `model/precache-list.ts` | `parseBrowserManifest`, `precacheList` and `assetPrecache` from `@alxia/react-router/pwa`; a font filter becomes `assetPrecache(files, /^font-[\w-]{8}\.woff2$/)` |
| `model/registration.ts` | `registerServiceWorker`, `afterLoad` from `@alxia/react-router/pwa` |
| `model/update-notice.ts` | `createUpdateNotice` and `sessionStore` from `@alxia/react-router/pwa`, or `updateNotice` from `@alxia/react-router/pwa/react` |
| `model/manifest.ts` | `webAppManifest(options)`, `manifestHref`, `manifestLanguage`, `MANIFEST_PATH` and `MANIFEST_HEADERS` from `@alxia/react-router/pwa`; the app keeps the texts and colours it passes |
| `model/clear-app-caches.ts` | `clearAppCaches(contract)` from `@alxia/react-router/pwa` |
| `hooks/use-online.ts`, `hooks/use-service-worker.ts`, `hooks/use-update-notice.ts` | `useOnline`, `useServiceWorker({ enabled })` and `useUpdateNotice` from `@alxia/react-router/pwa/react` |
| `server/no-cache.server.ts` | `noCache` from `@alxia/react-router/pwa/server`, declared in `createServer({ beforeAll })` |

What stays in the app: the theme colours, the icons' files and their test,
the offline page, the banner's markup, and the service worker with the script
that builds it.
