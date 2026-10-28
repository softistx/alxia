# How it works

This page covers what the plugin does in dev, in a build and under
`vite preview`, and what it sets so the build runs on Bun with no
`node_modules`.

With no `app/server.ts`, the plugin serves the app with
`createServer()`, from this package, with no options: a fresh alxia app,
the client's files, and the pages as a catch-all behind it.

## In dev

`react-router dev` starts Vite's server. Vite answers its own requests
first: modules, `/@fs/…`, `public/`, the HMR socket. The plugin hands
every other request to the server: pages, single-fetch data, and alxia's
routes. The server is loaded through Vite's SSR runner, so:

- **HMR** works as in any React Router app: a component edit reaches the
  browser over Vite's socket.
- **An edit to `app/server.ts`, or to a module it imports, is live on the
  next request**, with no restart: the runner reloads what changed.
- **Creating or deleting `app/server.ts`** takes effect on the next
  request.
- **The app's own context keys work**: the server and the routes are one
  module graph. See [The app's own context keys](typing-the-loaders.md#the-apps-own-context-keys).
- **Errors** go to Vite's error page, with the stack mapped to the source.
- **alxia's `ws` routes connect**: an upgrade Vite's HMR does not claim
  goes to the app, as from the build. See [WebSockets](beside-the-pages.md#websockets).

HTTP requests reach the app through `app.fetch`, not through `listen`,
given the loopback server the sockets are relayed to as `ctx.server`
([The server](typing-the-loaders.md#the-server-server)). So `page()` is not served in dev; see
[the troubleshooting entry](../troubleshooting.md#a-page-is-not-served-under-react-router-dev).

## In a build

`react-router build` builds the client as usual. It builds the server
from `app/server.ts`, or from the default server, with React Router's
server build inside it, into one file:

- **`build/server/index.js`'s default export is the alxia app.** Beside it
  are React Router's own exports, so the file is a server build too, and
  React Router's `prerender` reads it. The server file's other exports
  stay out of it.
- **Run, it listens**: `bun build/server/index.js` listens on `PORT`
  (3000 by default) and `HOST` (`0.0.0.0`). It prints
  `alxia listening on <url>`, and in dev — under `react-router dev`; a
  production build never is, whatever `NODE_ENV` says — the route table
  ([`@alxia/core`'s Development](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/development.md#the-route-table)). On `SIGINT` or `SIGTERM` it shuts the app
  down as `@alxia/core`'s `listen` does: readiness turns 503, new
  connections are refused, the requests in flight finish within
  `shutdownTimeout` (10 s; `listen: { shutdownTimeout }` sets it), the
  `onStop` hooks run, and the process exits
  ([core's guide](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/health-and-shutdown.md)).
- **Imported, it starts nothing**: prerendering, a test or another server
  can import it safely, since it listens only when it is the process's
  entry point (`import.meta.main`).
- **The mode follows the command**: `development` under `react-router dev`,
  `production` in a build, whatever `NODE_ENV` says. The app's dev switch
  follows it: `alxia({ dev: mode === 'development' })`, so a 500 of the
  build never shows its stack.
- **The client folder is resolved against the built file**: `../client`,
  from React Router's `buildDirectory`, so it is found wherever the
  process starts.
- **It is self-contained**: every package the server imports, React,
  React Router and alxia included, is bundled into it
  ([Self-contained](#self-contained)), so `build/` runs with no
  `node_modules`.

```sh
bun run build
PORT=8080 bun run start
```

After React Router's builder has written the client, the plugin builds the
service worker when the app has an `app/service-worker.ts` (`worker: false`
turns it off): `build/client/service-worker.js`, with the precache list read
from the client build ([the PWA guide](pwa.md#zero-config-alxia-builds-it)).

Then it writes the compressed copies of the client build, `.br` and `.gz`
beside each compressible file, which the server serves to a browser that
accepts them ([the client's files](beside-the-pages.md#compressed)).
`precompress: false` turns it off, `precompress: { minSize }` moves the 1 kB
threshold.

React Router's `serverBundles` split the server build in several, and
alxia serves one: the plugin refuses them. With `ssr: false`, a
single-page app, the plugin does nothing but build the service worker (when
`app/service-worker.ts` exists).

## Under `vite preview`

After a build, Vite's preview server serves the built server:

```sh
bun run build
bunx --bun vite preview
```

`--bun` runs Vite under Bun even where Node is installed, since Vite's bin
asks for Node: the built server runs inside Vite's process, and it needs
Bun's APIs. With the [`bunfig.toml`](getting-started.md#an-existing-react-router-app) (`[run]`,
`bun = true`), or with no Node installed, a `"preview": "vite preview"`
script run with `bun run preview` works too, as the template's other
scripts do.

The plugin loads `build/server/index.js` on the first request and hands
every request to its default export, the alxia app, before Vite's own
files. So the preview answers as `bun run start` does: the pages and their
data, `/api`, `build/client` with the cache headers of
[the client's files](beside-the-pages.md#the-clients-files), and every middleware of `beforeAll`
and `configure`. Requests, their bodies and every `Set-Cookie` pass
through whole, and pages stream.

What differs from `bun run start`:

- **Vite listens**, on `preview.port` (4173), `preview.host` and
  `preview.https`. `listen`, `onListen`, `PORT` and `HOST` are not read.
- **Requests arrive through `app.fetch`**, as under `react-router dev`:
  `page()` and an HTTP request's `ctx.server` are absent. alxia's `ws`
  routes connect, relayed to a `Bun.serve` of the built app as in dev
  ([WebSockets](beside-the-pages.md#websockets)); an upgrade `preview.proxy` relays stays
  Vite's.
- **Vite's preview options that come after the plugin never run**:
  `preview.proxy` for HTTP requests, `preview.headers` and Vite's file
  serving.
  `preview.cors` and `preview.allowedHosts` still apply.
- **The build is loaded once**: after `bun run build` again, restart the
  preview.

React Router prerenders the `prerender` paths of `react-router.config.ts`
through the same preview server, during `react-router build`. A
prerendered page is therefore rendered by the built server too: its loader
reads `alxiaOf(context)` and `getLoadContext`'s keys, and `beforeAll`'s
and `configure`'s middlewares run around it.

## Built for Bun

`build/server/index.js` runs on Bun, and the plugin builds it for Bun,
with nothing to configure. It adds to Vite's `ssr` environment, under
`react-router dev` and `react-router build` alike but for the last row,
the build's alone:

| option | what the plugin adds | why |
| --- | --- | --- |
| `resolve.conditions` | `bun` | a package bundled into the server whose `exports` has a `bun` condition is bundled as its Bun variant |
| `resolve.externalConditions` | `bun` | a dependency left external, as every one is in dev and one the app names in `ssr.external` is in the build, is loaded as its Bun variant, as Bun loads it |
| `resolve.builtins` | `bun`, and `bun:*` (`bun:sqlite`, `bun:ffi`, …) | Bun's own modules stay imports of the build, whichever runtime runs Vite. Vite knows `bun:*`, and bare `bun` only when it runs on Bun |
| `build.target` | `esnext` | the newest syntax is left as written: Bun runs it, and Vite's default targets browsers |
| `resolve.noExternal` | `true`, under `react-router build` only | every package is bundled into `build/server/index.js`, so `build/` runs with no `node_modules` ([Self-contained](#self-contained)) |

A package written for Bun, then, gives the build the variant Bun would
load, and Bun's own modules are used as they are:

```jsonc
// node_modules/some-package/package.json
{ "exports": { "bun": "./bun.js", "default": "./node.js" } }
```

```ts
// app/server.ts
import { createServer } from '@alxia/react-router';
import { Database } from 'bun:sqlite';

const db = new Database(':memory:');

export default createServer({
	configure: (app) =>
		app.get('/api/count', ({ reply }) =>
			reply.ok(db.query('select sqlite_version() as version').get()),
		),
});
```

```js
// build/server/index.js, in part
import { Database } from "bun:sqlite";
```

Which variant wins is still the package's own order: `exports` is read
top to bottom, and the first condition the build has wins. A package that
lists `node` before `bun` gives its Node variant, as Bun itself would load
it.

What the plugin leaves alone:

- **`ssr.target` stays `node`.** Bun runs Node's modules, and `node`
  keeps `node:*` external and resolves packages as a server does;
  `webworker` would bundle every dependency with the browser's conditions.
  An app that sets `ssr.target: 'webworker'` itself gets none of the
  above: that environment keeps Vite's own defaults.
- **No polyfill is added.** Vite adds none to a server build, and the
  plugin adds none.
- **The client build** is a browser's, as before: none of this reaches
  it. A Bun module imported by code that reaches the client is replaced
  by an empty module there: Vite 7 fails the build, Vite 8 fails in the
  browser ([troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#module--has-been-externalized-for-browser-compatibility-imported-by-)).

What the app sets wins. The plugin adds to the `ssr` environment once
every plugin's `config` has run, and Vite merges what it adds by
concatenating arrays, so conditions and builtins of the app's own are
kept, and `bun` is added only when they lack it. A `build.target`, at the
top level or on the environment, is kept as it is:

```ts
// vite.config.ts
export default defineConfig({
	// Kept: the build resolves `worker`, then `bun`, and targets es2022.
	environments: {
		ssr: {
			resolve: { conditions: ['worker'] },
			build: { target: 'es2022' },
		},
	},
	plugins: [reactRouter(), alxia()],
});
```

`ssr.resolve.conditions` at the top level is the same option, and is kept
the same way.

### Self-contained

Under `react-router build`, the plugin sets `resolve.noExternal: true` on
the `ssr` environment: Vite bundles every package the server imports into
`build/server/index.js`, where it would otherwise leave each one under
`node_modules` as an `import`. What the file still imports is Node's and
Bun's own modules:

```js
// build/server/index.js, its imports
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";
// … and no "react", "react-router" or "@alxia/core"
```

So `build/` is all a server needs, beside Bun: a Docker image's last
stage copies it alone ([Docker](deploying.md#docker)). React and `react-dom/server`,
React Router, alxia and its plugins bundle as they are, CommonJS included;
the `bun` condition above picks each package's Bun variant. One copy of
each package is in the file, so `alxiaContext` and the app's own keys are
one object for the server and the routes. React Router's prerendering and
`vite preview` load the same file.

`react-router dev` is left as it was: Vite's SSR runner loads the
packages from `node_modules`.

What the app sets wins. Vite reads `external` before `noExternal`:

- **`ssr.external: ['sharp']`**, or the same on
  `environments.ssr.resolve.external`, keeps those packages external,
  imported from `node_modules` at runtime. Use it for a package that
  cannot be bundled: a native addon (a `.node` file), or one that reads
  files of its own folder at runtime. The image must then hold that
  package ([Docker](deploying.md#docker)).
- **`ssr.external: true`** keeps every package external, Vite's own
  behaviour: the plugin adds no `noExternal` then, and the server needs
  the production `node_modules` beside `build/`.
- **`ssr.noExternal`**, a list, changes nothing: everything is bundled
  already.

```ts
// vite.config.ts
export default defineConfig({
	// Bundled but for sharp, a native addon.
	ssr: { external: ['sharp'] },
	plugins: [reactRouter(), alxia()],
});
```

A package the build could not bundle and was not told to leave external
fails at runtime, from `build/` alone, with Bun's
`Cannot find package '…'`: see
[the troubleshooting entry](../troubleshooting.md#error-cannot-find-package--from-appbuildserverindexjs).
