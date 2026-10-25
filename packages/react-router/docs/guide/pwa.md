# Installable and offline

This page covers what an installable React Router app shares, that has no
UI: the service worker's contract, the worker itself and the build that
writes it, which requests the worker caches, which responses it may store,
the offline page, registering the worker and offering an update, serving the
worker's script, the web app manifest, and the cleaning at sign-out. It is
read in order: the contract, `app/service-worker.ts`, `public/offline.html`,
`alxia()`, `useServiceWorker`, then `noCache`. Every app-specific name (the
cache prefix, the paths never cached) is an option, so two apps never share
a default.

- [What the subpaths hold](#what-the-subpaths-hold)
- [The worker's contract](#the-workers-contract)
- [The worker](#the-worker)
- [What the worker caches](#what-the-worker-caches)
- [A worker of your own](#a-worker-of-your-own)
- [The offline page](#the-offline-page)
- [Building the worker](#building-the-worker)
- [In React](#in-react)
- [Registering without React](#registering-without-react)
- [Serving the worker's script](#serving-the-workers-script)
- [The web app manifest (and why the language travels in `?lang=`)](#the-web-app-manifest-and-why-the-language-travels-in-lang)
- [Clearing at sign-out](#clearing-at-sign-out)

## What the subpaths hold

Each subpath is for one runtime, and the boundary between them is checked
(`boundary.spec.ts` reads the built files). The code reads `caches` and other
globals only inside its functions, never at load.

| subpath | for | needs |
| --- | --- | --- |
| `/pwa` | every runtime: the contract, `cachingFor`, `isStorable`, `registerServiceWorker`, `createUpdateNotice`, `manifestHref`, `webAppManifest`, `clearAppCaches`, the precache parts and `SERVICE_WORKER_URL` | nothing: it imports nothing |
| `/pwa/react` | the page's hooks: `useServiceWorker`, `useUpdateNotice`, `useOnline` | `react` (`^19`), an optional peer. Keep it out of the worker, which would bundle React |
| `/pwa/server` | the server file alone: `noCache` and `revalidated` | `@alxia/core`, a peer the package already has |
| `/pwa/worker` | the service worker bundle alone: `startWorker` | the six `workbox-*` packages (`core`, `expiration`, `navigation-preload`, `precaching`, `routing`, `strategies`), optional peers (`^7`) |
| `/pwa/build` | a build pipeline of your own: `buildWorker` | Bun; Node's built-ins are its only imports, and it reads `Bun` only inside the function. The Workbox peers must be installed to bundle the worker |

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

`cachePrefix` is required: the caches the worker owns are named
`my-app-<kind>-<version>` (the contract makes `precache`, `assets` and
`static`), and a cache of that shape is swept when it is not current, a
retired kind included. Two apps on one origin need two prefixes; `app` and
`app-admin` do not claim each other's. The options are:

| option | default | |
| --- | --- | --- |
| `cachePrefix` | none | a non-empty name that does not end with `-` |
| `cacheVersion` | `'v1'` | a name without `-`; bump it when a cache's content changes shape: the next worker deletes the prefix's caches of another version when it activates |
| `serviceWorkerUrl` | `/service-worker.js` | where the build writes the worker |
| `offlineUrl` | `/offline.html` | the page served when a navigation fails |

The contract gives three cache names, `cacheNames.precache`
(`my-app-precache-v1`, the name Workbox builds from
`setCacheNameDetails({ prefix, precache: 'precache', suffix: version })`),
`cacheNames.assets` and `cacheNames.static`, and two filters over
`caches.keys()`.

`obsoleteCaches(names)` returns the prefix's caches that are not current;
`clearableCaches(names)` returns all of the prefix's but the current
precache. `startWorker` calls the first when it activates, so the app deletes
no cache itself. The module also exports `SERVICE_WORKER_URL`, `OFFLINE_URL` and
`SKIP_WAITING`, the message a page posts to a waiting worker.

## The worker

`startWorker` turns those answers into Workbox routes. The app's worker is
one file, bundled by the app's build (`app/service-worker.ts` by default):

```ts
// file: app/service-worker.ts
import { startWorker } from '@alxia/react-router/pwa/worker';
import { workerContract } from './pwa-contract';

startWorker({
	contract: workerContract,
	caching: { never: (path) => path.startsWith('/api/') },
	// The build writes the precache list in (see "Building the worker").
});
```

It uses no worker global, so it compiles under the app's DOM `tsconfig`. Add
the packages it bundles as development dependencies:
`bun add -d workbox-core workbox-expiration workbox-navigation-preload workbox-precaching workbox-routing workbox-strategies`.

| option | default | |
| --- | --- | --- |
| `contract` | required | the app's `WorkerContract`: cache names, offline page, the worker's URL |
| `caching` | none | `never`, `immutable`, `manifestPath` and `serviceWorkerUrl`, as `cachingFor` takes them |
| `assets` | `{ maxEntries: 200 }` | how many hashed bundles the cache keeps (`maxEntries`, `maxAgeSeconds`) |
| `static` | `{ maxEntries: 100, maxAgeSeconds: 2592000 }` | the same for the other static files (30 days) |
| `navigationPreload` | `true` | the browser starts a page load's request alongside the worker |
| `precache` | the list the build wrote in | `[{ url, revision }]`; a worker with neither throws at once |

What each answer of `cachingFor` becomes:

| answer | Workbox | stores |
| --- | --- | --- |
| `navigation` | `NetworkOnly`; the precached offline page answers when the network fails (not for an HTTP error), if the contract's `offlineUrl` is in the precache list | nothing |
| `immutable` | `CacheFirst` on `cacheNames.assets`, with `ExpirationPlugin` | what `isStorable` accepts |
| `static` | `StaleWhileRevalidate` on `cacheNames.static`, with `ExpirationPlugin` | what `isStorable` accepts |
| `none` | no route: the browser | nothing |

Around them: the precache route is registered first, with exact URLs only
(`cleanURLs: false`, no directory index), so a page load still goes to the
network; `clientsClaim()` makes a first install control the open pages at
once; an update waits until the page posts `SKIP_WAITING`; and on `activate`
the caches the contract no longer owns (`obsoleteCaches`) are deleted.

The precache list is the `precache` option, or else
`globalThis.__ALXIA_PRECACHE__`, which the build writes into the bundle (a
worker bundled some other way passes `precache`, or defines that global in its
own bundle). Read without the build it is `undefined`, so the
worker's error is [`startWorker(): no precache list`](../troubleshooting.md#startworker-no-precache-list-)
instead of a `ReferenceError`.

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

| option | default | |
| --- | --- | --- |
| `never(path)` | none | paths of the app always answered fresh |
| `immutable(path)` | `path.startsWith('/assets/')` | which static paths are cache-first. This matches how the client's files under `build/client/assets/` are served, `immutable` for a year. A file you keep unhashed there is cached for a year by the HTTP cache anyway: [more](../troubleshooting.md#an-unhashed-file-under-publicassets-is-cached-for-a-year) |
| `serviceWorkerUrl` | `SERVICE_WORKER_URL` | never cached. A value here replaces the default |
| `contract` | none | the app's `WorkerContract`: its `serviceWorkerUrl` is never cached. `serviceWorkerUrl` wins when both are given |
| `manifestPath` | `/manifest.webmanifest` | never cached. A value here replaces the default |

An app that gives its contract a custom `serviceWorkerUrl` passes the
contract to `cachingFor` (`{ contract }`), or the same value as
`serviceWorkerUrl`, or the worker's own script is cached like a static file.

The decision is on the request; `isStorable(response)` is on the answer, and
the worker asks both. A response is stored only when it is a full,
same-origin 200 of a script, style, font or image, that the server marked
`public` (alxia does on every static file it serves, and a route answering an
image, such as a user's photo, does not), neither `private` nor `no-store`,
and that does not vary on `Cookie`, `Authorization` or `*`.

## A worker of your own

When Workbox does not fit, `cachingFor` and `isStorable` need none: the
worker asks the first of the request and the second of the answer.

```ts
// file: app/pwa/answer.ts
import { cachingFor, isStorable } from '@alxia/react-router/pwa';
import { workerContract } from '../pwa-contract';

export async function answer(request: Request): Promise<Response> {
	if (cachingFor(request, self.location.origin, { contract: workerContract }) !== 'immutable') {
		return fetch(request);
	}
	const cache = await caches.open(workerContract.cacheNames.assets);
	const cached = await cache.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (isStorable(response)) await cache.put(request, response.clone());
	return response;
}
```

## The offline page

The worker precaches `public/offline.html` (the contract's `offlineUrl`) and
answers a page load with it when the network fails. It is the one document in
`build/client` that no route renders, so `noCache` does not touch it and it
carries its policy in its own `<meta>`, which loads nothing:

```html
<!-- file: public/offline.html -->
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta http-equiv="Content-Security-Policy" content="default-src 'none'" />
		<title>Offline</title>
	</head>
	<body>
		<h1>You are offline</h1>
		<p>Check your connection and try again.</p>
	</body>
</html>
```

An inline `<style>` or `<script>` is refused by that policy unless its
`sha256-` hash is added to `style-src` or `script-src`. The build revisions
the file by its content: a changed page installs a new worker. A worker with
no offline page passes `offline: false` to the build.

## Building the worker

### Zero config: `alxia()` builds it

With `app/service-worker.ts` in the app, `react-router build` writes
`build/client/service-worker.js`: `alxia()` bundles the file after React Router's
client build, with the precache list written in, and logs how many files it
precaches. The file is the opt-in, as `app/server.ts` is, so an app without one
gets nothing. It needs Bun: run `bun --bun react-router build`, or put `[run]`
and `bun = true` in a `bunfig.toml`. A single-page app (`ssr: false`) gets its
worker too.

```ts
// file: vite.config.ts
import { alxia } from '@alxia/react-router/vite';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		reactRouter(),
		alxia({ worker: { precacheAssets: /^body-latin-[\w-]{8}\.woff2$/ } }),
	],
});
```

| `worker` | |
| --- | --- |
| left out | `app/service-worker.ts`, when it exists |
| a string | another file, relative to Vite's root; the build fails when it is not there |
| `false` | no worker is built |
| an object | `file` (as the string), `contract`, `offline`, `precacheAssets` and `minify`, as in `buildWorker`'s table below |

The object form takes the options of [`buildWorker`](#with-buildworker), but
`root` and `client`, which the plugin knows. Its `contract` must be the same
object `startWorker` gets: the build reads the worker's URL and the offline
page from it, and the worker reads them from its own.

### Moving from a worker of your own

An app that built its worker with a script of its own (a `sw/` folder with its
own `tsconfig.json`, a `build:sw` script) moves to `alxia()` in a few steps:

1. Drop `&& bun run build:sw` from the `build` script and delete the `build:sw`
   script. Otherwise the old script overwrites `build/client/service-worker.js`
   after `alxia()` has written it.
2. Delete `sw/` (`service-worker.ts` and `tsconfig.json`) and
   `scripts/build-sw.ts`. The worker is `app/service-worker.ts`, or the file
   `alxia({ worker: 'path' })` names.
3. Drop `&& tsc -p sw` from the `typecheck` script: `app/service-worker.ts`
   compiles under the app's own `tsconfig`.
4. Keep the six `workbox-*` development dependencies: the build bundles them.
5. Keep `routeDiscovery: { mode: 'initial' }` in `react-router.config.ts`
   ([why](../troubleshooting.md#offline-a-client-navigation-to-a-route-never-visited-shows-the-offline-page)).
6. Move the regex of the fonts the old script precached into
   `alxia({ worker: { precacheAssets } })`.
7. If the contract changes `offlineUrl` or `serviceWorkerUrl`, pass it to the
   build: `alxia({ worker: { contract: workerContract } })`.

### With `buildWorker`

`buildWorker` is for a pipeline where `alxia()` does not build the worker. It
bundles the worker (Workbox included) into the client build, after
`react-router build`, with the precache list written in. It runs on Bun and
writes `build/client/service-worker.js` (the contract's `serviceWorkerUrl`):

```ts
// file: scripts/build-worker.ts
import { buildWorker } from '@alxia/react-router/pwa/build';

const { precache, precacheBytes, bytes } = await buildWorker({
	file: 'app/service-worker.ts',
	precacheAssets: /^body-latin-[\w-]{8}\.woff2$/,
});
console.log(
	`${precache.length} files precached (${precacheBytes} bytes), worker ${bytes} bytes`,
);
```

Run it as `bun scripts/build-worker.ts` after `react-router build`. The list is
the offline page, revisioned by its content (a changed page installs a new
worker), then every route's code, then the `precacheAssets` files. A new build
changes the list, so the worker's bytes, so the browser installs it.

| option | default | |
| --- | --- | --- |
| `file` | required | the worker's source, relative to `root` (named `file`, not `entry`, which `reveal` reads from `alxia({ entry })`) |
| `root` | `process.cwd()` | |
| `client` | `build/client` | the client build, relative to `root` |
| `contract` | `SERVICE_WORKER_URL`, `OFFLINE_URL` | `{ serviceWorkerUrl, offlineUrl }`: where the worker is written and which offline page is precached. Pass the same object `startWorker` gets (the app's contract), or the build and the worker can disagree |
| `offline` | `true` | precache the offline page, which must exist in the client build ([`public/offline.html`](#the-offline-page)) |
| `precacheAssets` | none | a regex over the names in `build/client/assets`, such as fonts |
| `minify` | `true` | |

The result is `{ file, precache, precacheBytes, bytes }`: the absolute path,
the list, the precached files' size before compression and the worker's size.
Its errors are in [the troubleshooting page](../troubleshooting.md#buildworker-expected-one-react-router-browser-manifest).

### The parts

A worker precaches the code of every route, so a client navigation offline to
a route never visited still finds its modules. Set
`routeDiscovery: { mode: 'initial' }` in `react-router.config.ts` as well,
or the navigation asks `/__manifest` for the route and shows the offline page
([more](../troubleshooting.md#offline-a-client-navigation-to-a-route-never-visited-shows-the-offline-page)). `react-router build` writes the
list in `build/client/assets/manifest-*.js`. `buildWorker` does this itself; the parts
are for a pipeline of your own:

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

## In React

`@alxia/react-router/pwa/react` wraps the page's side in three hooks and the
page's one notice. It needs `react` (`bun add react`, which a React Router app
has already).

```tsx
// file: app/root.tsx
import { manifestHref } from '@alxia/react-router/pwa';
import { useServiceWorker } from '@alxia/react-router/pwa/react';
import { Outlet } from 'react-router';
import { UpdateBanner } from './update-banner';

// The manifest, below, makes the app installable.
export function links() {
	return [{ rel: 'manifest', href: manifestHref('fr') }];
}

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
  `url`, `scope` or `notice` change, never for a new inline `onError` (the
  latest one is always called). The options are read when the effect runs,
  and the listeners it adds (the update check when the tab shows, the reload
  on a controller change) stay for the page's life: there is no cleanup.
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

## Registering without React

The hooks of [In React](#in-react) wrap this. For another UI,
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

export function registerWorker() {
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
that page. `storage()` may return any object with `getItem(key)` and
`setItem(key, value)`, such as a fake in a spec or another storage
(`NoticeStorage`). The notice and the registration touch no global at load, and
neither imports React.

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
runs. In `app/server.ts` (the manifest's route, below, goes in the same `createServer` call):

```ts
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

The offline page is the one other document in `build/client`: its policy is
[its own `<meta>`](#the-offline-page), and `noCache` does not touch it.

## The web app manifest (and why the language travels in `?lang=`)

A browser fetches the manifest without cookies, so a `language` cookie never
reaches it. The page names its language in the query, and the server reads it:

```tsx excerpt
import { manifestHref } from '@alxia/react-router/pwa';

export function links() {
	return [{ rel: 'manifest', href: manifestHref('fr') }];
}
```

```ts
// file: app/server.ts
import { createServer } from '@alxia/react-router';
import {
	MANIFEST_HEADERS,
	MANIFEST_PATH,
	manifestLanguage,
	webAppManifest,
} from '@alxia/react-router/pwa';

const LANGUAGES = ['en', 'fr'] as const;

export default createServer({
	configure: (app) =>
		app.get(MANIFEST_PATH, ({ request, reply }) => {
			const lang = manifestLanguage(new URL(request.url), LANGUAGES, 'en');
			const manifest = webAppManifest({
				name: 'My app',
				description: lang === 'fr' ? 'Mon application' : 'My app',
				lang,
				themeColor: '#1e40af',
				backgroundColor: '#ffffff',
				categories: ['productivity'],
			});
			return reply(200, JSON.stringify(manifest), { headers: MANIFEST_HEADERS });
		}),
});
```

`manifestLanguage(url, supported, fallback)` returns `?lang=` when it is one
of `supported`, else `fallback`. The fallback is a supported language that
the app resolves from the request's `Accept-Language` (the example passes
`'en'`; an app with a language negotiator passes its result), never from the
cookie, because `MANIFEST_HEADERS` says `Vary: Accept-Language`. Those
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
