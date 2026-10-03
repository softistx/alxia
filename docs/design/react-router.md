# alxia as the server of a React Router app

Status: **approved** by the owner on 2026-10-03, with the recommended
option of every decision below: a Vite plugin for dev (1a), the package's
`alxiaContext` read through `alxiaOf` (2a), both prerequisites in core and
`@alxia/compress` (3a, 4a), React Router `^8.0.0` only (5a), `HEAD` as `GET`
(6a), the catch-all outside the contract (7a) and a generated `serve.js`
(8a). One PR per slice, in the order given at the end.

The owner wants `@alxia/react-router`: alxia as the HTTP server of a React
Router **framework-mode** app with SSR. Under it, the loaders read what
alxia's hooks derived, typed. alxia's routes (`/api/*`) and hooks (logger,
compress, secure headers) live beside the pages, and development keeps
Vite's HMR, all under Bun. This note covers the prior art, a probe that ran
the whole thing under Bun 1.4.2, and the API the probe argues for.

## Versions

React Router is at **8.4.0** (released 2026-09-15). v8.0.0 shipped on
2026-06-17, and v7 is in maintenance (7.18.4). This note targets v8,
because v8 changed exactly the part an adapter touches:

- Middleware is always on, and the `future.v8_middleware` flag is gone.
- The `context` a loader, an action or a middleware receives is always a
  `RouterContextProvider`.
- A custom server's `getLoadContext` must return a `RouterContextProvider`.
  A plain object is refused, and the `AppLoadContext` augmentation no longer
  types anything.

The probe used these versions:
- `react-router`, `@react-router/dev` and `@react-router/node` 8.4.0;
- `vite` 8.3.2 (`@react-router/dev` 8.4.0 accepts `vite ^7 || ^8`);
- `react` and `react-dom` 19.3.0;
- `react-router-hono-server` 4.1.4, for reading only;
- Bun 1.4.2 on macOS arm64, with no `node` on the `PATH`.

## Prior art

- **`createRequestHandler(build, mode)` from `react-router`.** It is the
  whole server runtime, web standard: `(request, context?) =>
  Promise<Response>`. `build` is the `ServerBuild`, or a function that
  returns one, which is the dev path. Every adapter below is a thin layer
  over it.
- **`@react-router/express`** (about 70 lines). It turns Node's request
  into a `Request`, calls `getLoadContext(req, res)` (typed `=>
  RouterContextProvider` since v8), and writes the `Response` back.
  `@react-router/node` holds the stream helpers. alxia needs neither, since
  Bun already speaks `Request` and `Response`.
- **React Router's own dev server** (`@react-router/dev/vite`). In
  `configureServer` it adds an SSR middleware that calls
  `createRequestHandler(await environments.ssr.runner.import('virtual:react-router/server-build'))`.
  It does so only when `server.middlewareMode` is off: in middleware mode
  it leaves the SSR to the host.
- **react-router-hono-server** (4.1.4, about 1,200 lines). This is the
  closest model:
  - **`reactRouterHonoServer()`, the Vite plugin.** Hono's
    `@hono/vite-dev-server` loads the app's server entry (`app/server.ts`)
    through Vite's SSR runner and answers every request Vite's own
    middlewares leave. On a build, the plugin makes that entry the SSR
    input, so `build/server/index.js` is the server, with the React Router
    build inside it. For Bun it aliases `react-dom/server` to
    `server.browser`.
  - **`createHonoServer({ configure, getLoadContext, beforeAll, … })`,
    per runtime (`/bun`, `/node`, …).** It serves `build/client/assets/*`
    with a year's `max-age`, and the public files with an hour's. It mounts
    the React Router handler under the basename, also at `<basename>.data`,
    and calls `Bun.serve` itself in production. A process-wide flag,
    `IS_RR_BUILD_REQUEST`, keeps it from listening while React Router
    prerenders.
- **Load context in v8.** The way to pass data in is a key made by
  `createContext<T>()`, set on the provider and read with `context.get(key)`.
  As the probe shows, the key is matched by object identity, and that
  decides most of the design.

## What the probe showed

The probe app is a React Router 8 framework app with `ssr: true`. It has:
- a root with an `ErrorBoundary`;
- an index route with a loader and an action;
- a `/slow` route whose loader returns a promise behind `<Await>`;
- a route that throws, one that throws a 404, and an action that redirects
  and sets two cookies.

It is served by an alxia app built from this repository's `dist/`. That app
holds `@alxia/logger`, `@alxia/compress`, `@alxia/secure-headers`, an
`/api/health` route, a `derive` of `user`, and a candidate
`reactRouter()` catch-all. It ran under Bun 1.4.2.

### Production: it works, with three traps

- **`react-router build` works under Bun:** 1.1 s for the client and the
  server, through `bunx --bun react-router build`, or plain `bunx` with no
  `node` installed.
- **The catch-all works** through `app.fetch` and `listen` alike. Each
  method is registered at `/*` (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`),
  and the handler answers `reply(response.status, response.body, {
  headers })`, as `@alxia/graphql` hands Yoga's response back. These all
  came back as React Router sent them:
  - documents;
  - single-fetch data (`/_.data`, `/login.data`);
  - a document action (`POST /?index`) and a single-fetch action;
  - a redirect with two `Set-Cookie` headers, both kept
    (`getSetCookie()` reads `a=1…` and `b=2…`);
  - lazy route discovery (`/__manifest`);
  - the error pages: 500 from a loader that throws, 404 from a thrown
    `data(…, { status: 404 })`, 404 for no route.
- **alxia's routes and hooks run around SSR.** `/api/health` answers its
  JSON. Every page gets `x-request-id`, `server-timing`, the secure headers
  and `vary: Accept-Encoding`, and is compressed (zstd, br, gzip). The
  logger writes one entry per request.
- **Assets.** With `static('/assets', 'build/client/assets', { cacheControl:
  'public, max-age=31536000, immutable' })`, the hashed files are served
  immutable, a missing asset is alxia's JSON 404 rather than a page, and
  `robots.txt`, from `file()`, is served with an hour's cache.
- **Streaming works.** With a browser's user agent and no compression, the
  first chunk of `/slow` (the shell and its fallback) arrives in **1–6 ms**,
  and the deferred value at about **805 ms**. That holds through `listen`,
  through both dev setups, and with an `entry.server.tsx` on
  `renderToReadableStream`, whose first chunk came at 3–4 ms in production
  and in dev. React Router's default entry chooses
  `renderToPipeableStream` under Bun, since Bun reports a Node version, and
  it streams too.
- **The cost of alxia is small.** These are 4,000 requests at a
  concurrency of 32, with Bun's `fetch` as the client on the same machine
  (second round):

  | Server | `GET /` (document) | `GET /_.data` |
  | --- | --- | --- |
  | `createRequestHandler` in a bare `Bun.serve` | 8,855 req/s, p50 3.19 ms | 55,167 req/s, p50 0.50 ms |
  | alxia, the catch-all alone | 8,611 req/s, p50 3.32 ms | 45,936 req/s, p50 0.62 ms |
  | alxia with logger, compress (identity) and secure headers | 8,166 req/s, p50 3.44 ms | — |

  A document is within noise of the bare handler; a data request costs
  about 0.1 ms more.
- **Startup.** `bun build/server/index.js` answers in 44–54 ms, and its
  first SSR takes 17–20 ms.

The three traps follow.

**1. A context key made in `app/` is not the one the loaders read.**
`react-router build` bundles `app/context.ts` into
`build/server/index.js`. A server that imports `app/context.ts` itself gets
another `createContext()` object, so the `context.set(userContext, user)`
it does is never seen. The loader gets the key's default, which was `null`,
silently. Without a default, the loader fails with:

```
Error: No value found for context
```

A key exported by a **package** works. Vite's SSR build leaves
`node_modules` imports external, so the build and the server load one
module. One caveat: Vite externalized the probe package only once its entry
was `.js`. An entry pointing at `.ts` was inlined into the build like `app/`
code. The second way that works is to build the server entry with the app
(section 2 of the proposal): then `app/context.ts` becomes one shared
chunk, and the app's own key works too. The probe measured both.

**2. A route declared after the catch-all is routed differently by
`fetch` and `listen`.** `GET /api/after/x`, declared after the catch-all:

- through `app.fetch`, React Router answers it: `404`, `No route matches
  URL "/api/after/x"`;
- through `listen`, `Bun.serve`'s router prefers the longer path, and alxia
  answers `200`.

Core's guide says of `fetch`: "a path without parameters wins, then the one
declared first". Bun ranks a longer prefix above a wildcard. The gap exists
today for any two wildcards; the catch-all makes it bite. And Vite's dev
server reaches the app through `fetch` (section 3), so dev and production
would route the same app differently.

**3. `@alxia/compress` holds a streamed page until it ends.** With
compression on, the first chunk of `/slow` came at **805–811 ms** in gzip,
br and zstd alike, against 1 ms with identity. `CompressionStream('gzip')`
gave 10 bytes (the header) at 0 ms and the body at 501 ms, and the
`node:zlib` Brotli duplex gave 36 bytes at 510 ms. The fix was probed:
calling `flush()` after each chunk (`Z_SYNC_FLUSH`,
`BROTLI_OPERATION_FLUSH`, `ZSTD_e_flush`) sends the first chunk at **1 ms**,
and the output decodes correctly in all three.

Smaller findings:
- **`HEAD`.** React Router answers a `HEAD` with the status and **no
  headers at all**, not even `Content-Type`; its `GET` has them. Core
  strips the body of a `GET` route answering a `HEAD` by itself.
- **`isbot('Bun/1.4.2')` is `true`.** A test client with Bun's user agent
  gets the whole page at once (805 ms, no fallback), because the default
  entry waits for `allReady` for a bot. That is React Router's choice, not
  a bug; a spec must send a browser's user agent.
- **The logger times a streamed page by its first byte.** It logged about
  2 ms for an 805 ms stream: `onResponse` runs when the headers leave.
- **`@alxia/secure-headers`' default policy, `default-src 'none'`, blocks a
  page's scripts**, React Router's inline ones included. The probe turned
  it off; this was not tried in a browser. React Router takes a `nonce`
  (`<Scripts nonce>`, `ServerRouter nonce`), so the policy can be served
  with a per-request nonce later.
- **An index route's action is `POST /?index`.** `POST /` gives React
  Router's 405: ``You made a POST request to "/" but did not provide an
  `action` for route "root", so there is no way to handle the request.``
  React Router's own behaviour, worth a troubleshooting entry.

### Development: two setups, both with HMR under Bun

The baseline is stock `bunx --bun react-router dev`, which runs under Bun.
Its load context is empty, so it is only a check that Vite itself works.
Then two setups with alxia:

- **D3: alxia owns `Bun.serve`.** Vite runs in middleware mode on an
  internal `node:http` port. Every `GET` that is not a page, a `.data`
  request or `/api/*` is tried on Vite first, and its 404 falls through to
  alxia. The build comes from
  `environments.ssr.runner.import('virtual:react-router/server-build')`,
  and HMR has its own socket port (`hmr.port`).
- **D4: Vite owns the server; alxia is a Vite plugin, as in
  react-router-hono-server.** The plugin comes before `reactRouter()` and
  adds a middleware after Vite's own. That middleware loads the server
  entry `app/server.ts`, whose default export is the alxia app, through the
  SSR runner, and hands it the request through a 40-line Node-to-`Request`
  adapter. React Router's own SSR middleware never runs.

| | D3: alxia owns the server | D4: a Vite plugin |
| --- | --- | --- |
| Startup, then first SSR | 247–254 ms, then 60 ms | 286–295 ms, then 36–38 ms |
| A component edit reaches the browser (`js-update` on the HMR socket) | 115 ms | 94 ms (90 ms under `react-router dev`) |
| A loader edit is live on the next request | yes | yes |
| An edit to the alxia server entry is live | no: restart the process | yes, about 90 ms, no restart |
| The app's own context key (`app/context.ts`) | read as `null`: two module graphs | works: one module graph |
| A key from a package | works | works |
| Streaming (identity) | first chunk 5 ms | first chunk 6 ms |
| alxia's `ws` routes, `page`, `ctx.server` | yes: it is `Bun.serve` | no: requests arrive through `app.fetch`, as in a test |
| Ports and plumbing | two extra ports (internal Vite, HMR) and a rule deciding what goes to Vite | one port; Vite decides |

D4 also builds: with the entry as the SSR input (a plain
`rollupOptions.input` override, without hono-server's `facadeModuleId`
renaming), `build/server/index.js` is the alxia app with the React Router
build in a chunk of its own. `app/context.ts` lands in one chunk both
share. Served by `listen`, that build behaves as the production results
above. Two typing notes for the plugin's own code: Vite types
`environments.ssr` as a `DevEnvironment`, so `.runner` needs
`isRunnableDevEnvironment()` to narrow it. And `Readable.toWeb()`'s stream
type must be cast to the DOM `ReadableStream`.

## Proposal

### 1. `@alxia/react-router`: the catch-all and the context

```ts
// app/server.ts — the server entry: loaded by Vite in dev, built by it for production
import { alxia } from '@alxia/core';
import { compress } from '@alxia/compress';
import { logger } from '@alxia/logger';
import { reactRouter } from '@alxia/react-router';
import { session } from './session'; // an app plugin that derives `user`

export const base = alxia()
	.use(logger())
	.use(compress())
	.use(session)
	.get('/api/health', ({ reply }) => reply.ok({ ok: true }));

export type Base = typeof base;

export default base.use((app) =>
	reactRouter(app, {
		build: () => import('virtual:react-router/server-build'),
	}),
);
```

```ts
// app/routes/dashboard.tsx
import { alxiaOf } from '@alxia/react-router';
import type { Base } from '../server';
import type { Route } from './+types/dashboard';

export async function loader({ context }: Route.LoaderArgs) {
	const { user, log } = alxiaOf<Base>(context); // typed: what `base` derived
	log.info('dashboard');
	return { name: user.name };
}
```

- **`reactRouter(app, options)`** is called through `use`, as `graphql(app,
  …)` is, so that it reads the app's context type. It adds the catch-all:
  `GET`, `POST`, `PUT`, `PATCH` and `DELETE` at `/*`, behind every hook
  declared before it.
- **The options:**
  - `build`: a `ServerBuild`, or a function returning one. In production
    it is called once; in dev, on each request, which is how a route edit
    is picked up.
  - `mode`: `'production'` by default, `'development'` under Vite.
  - `getLoadContext(ctx, context)`: sets the app's own keys on React
    Router's provider. `ctx` is typed by the app, so reading a key no hook
    before it derives is a compile error (probed: three
    `@ts-expect-error`s held).
  - `client`: the client build. In production, `/assets/*` is served from
    it with `public, max-age=31536000, immutable`, and every other
    top-level file or folder (the `public/` copies) with an hour's cache,
    each through core's `static` and `file`, before the catch-all.
- **`alxiaContext`**, the package's own key, is always set to the request's
  context. **`alxiaOf<App>(context)`** reads it, typed as `ContextOf<App>`.
  The key lives in the package, so it is one object whichever way the
  server was built or loaded: that is trap 1 above.
- **`HEAD`** is handed to React Router as a `GET`. Core then strips the
  body, so a `HEAD` carries the page's headers.
- **`isReactRouterRoute(route)`**, for `@alxia/openapi`'s `exclude`. It
  works as `docs()` already recognises its own handlers, so that the
  document does not list `/*`.

### 2. `@alxia/react-router/vite`: one server entry, for dev and production

```ts
// vite.config.ts
import { reactRouter } from '@react-router/dev/vite';
import { alxiaServer } from '@alxia/react-router/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [alxiaServer({ entry: 'app/server.ts' }), reactRouter()], // alxiaServer first
});
```

```jsonc
// package.json
"scripts": {
	"dev": "bunx --bun react-router dev",
	"build": "bunx --bun react-router build",
	"start": "bun build/server/serve.js"
}
```

- **In dev**, it does what D4 does: the entry is loaded through the SSR
  runner, and every request Vite does not answer itself goes to its
  `fetch`. HMR, the server entry's own reload, and the app's context keys
  all work, as measured.
- **In a build**, the entry becomes the SSR input, and the plugin writes
  `build/server/serve.js`. That file imports it and calls `listen` with
  `PORT` and `HOST`. So nothing listens while React Router prerenders, and
  hono-server's process flag is not needed. The `serve.js` wrapper was not
  probed: the probe used a three-line file of its own.
- **Without the Vite plugin**, the runtime alone still serves a build: a
  server file imports `build/server/index.js` and passes it as `build`. It
  must then read the context through `alxiaOf`, never through a key of its
  own in `app/`, because of trap 1. That is the setup for an app that
  needs alxia's sockets in dev (D3). The package documents it and does not
  ship it.

### 3. Prerequisites outside the package

- **Core: `app.fetch` ranks routes as `Bun.serve` does.** Static first,
  then a parameter, then a wildcard, and a longer prefix before a shorter
  one, with the order of declaration only between equals. Then dev (Vite,
  through `fetch`), tests (`app.request`) and production (`listen`) route
  alike, and `/api/*` beats the catch-all wherever it is declared. That is
  trap 2.
- **`@alxia/compress`: a streamed body is flushed chunk by chunk** (trap 3).
  A body with a `Content-Length` keeps today's path.

## Typing

- **`ctx` in `getLoadContext`** is `BaseContext & Ctx` of the app at the
  point of `use`. A plugin declared after `reactRouter()` is not in it,
  just as for any route. That is "order is meaning", unchanged.
- **`alxiaOf<App>()`** takes the type of the app *before* the catch-all:
  `Base`, exported beside the default export. The route imports it with
  `import type`, which nothing bundles.
- **Not a global augmentation.** A `declare module '@alxia/react-router' {
  interface Register { app: … } }` would spare the type argument, but it is
  the global augmentation the [API ergonomics note](api-ergonomics.md#slice-3-extending-the-context-typed)
  rejected, and one app per process is not something a module can know.
  The type argument stays.
- **The route table.** The catch-all adds nothing to `RoutesOf`: pages and
  turbo-stream data are not something the typed client calls. Under
  "the client is honest" that is the rule for global hooks' responses: what
  a typed client never asks stays outside the contract.

## Dependencies and layering

```
core ◄── react-router   (peers: react-router; vite, optional, for /vite only)
```

- **Peers:**
  - `@alxia/core`, `workspace:^`, and also a devDependency;
  - `react-router: ^8.0.0`;
  - `vite: ^7.0.0 || ^8.0.0`, in `peerDependenciesMeta` as optional,
    imported only by `/vite`. This is the range `@react-router/dev` 8.4.0
    itself accepts. The CI job tests 7 and Newest peers tests 8; the probe
    ran 8.3.2 only.
- **No dependencies.**
  - The Node-to-`Request` adapter of `/vite` is its own 40 lines on
    `node:http` and `node:stream`, not `@remix-run/node-fetch-server` or
    `@hono/node-server`.
  - `@react-router/dev`, `@react-router/node`, React and `isbot` are the
    app's, never imported by the package.
- **Two entry points.** `alxia.entrypoints` gets `src/index.ts` and
  `src/vite.ts`, the first package with a subpath. `verify:artifacts`
  already imports every declared subpath and installs optional peers.
- **The specs need a real build.** They build a fixture app with
  `react-router build` (about 1 s) from devDependencies: `react`,
  `react-dom`, `@react-router/dev`, `vite`, `isbot`. They send a browser's
  user agent, since Bun's is a bot to `isbot`.

## Decisions for the owner

1. **The dev setup.**
   - **(a, recommended) A Vite plugin (D4).** Vite owns the dev server, and
     one server entry serves dev and production. It measured best on HMR,
     server reload and first SSR, and the app's own context keys work. The
     cost: in dev, alxia's `ws` routes, `page` and `ctx.server` are absent,
     as under `app.request` today.
   - (b) alxia owns `Bun.serve` (D3). Sockets work in dev, but it adds two
     extra ports and a rule for what goes to Vite. Server edits need a
     restart, and only the package's key reaches the loaders.
2. **How a loader reads alxia's context.**
   - **(a, recommended) The package's `alxiaContext`, read through
     `alxiaOf<App>(context)`, always set**, plus `getLoadContext` for the
     app's own keys. It works in every setup measured.
   - (b) `getLoadContext` only, as express and hono do. It is simpler, but
     it fails silently (or with `No value found for context`) outside the
     plugin's build.
3. **Core ranks routes in `fetch` as `Bun.serve` does.**
   - **(a, recommended) Yes, as a core slice first.** Without it, dev and
     production can route one app differently.
   - (b) No: document "declare `reactRouter()` last" and accept the gap for
     other wildcards.
4. **Streaming and `@alxia/compress`.**
   - **(a, recommended) Flush each chunk** of a body with no
     `Content-Length`. That keeps compression on pages and streaming both,
     and costs a little ratio on streamed bodies only.
   - (b) Skip compressing `text/html` that has no length. It is simpler,
     and pages then go uncompressed.
5. **React Router versions.**
   - **(a, recommended) `^8.0.0` only.** v8 is `latest`, its context model
     is the one this note types, and nothing is published yet.
   - (b) Also `^7.9 || …` with `future.v8_middleware` required: more
     surface, for a line in maintenance.
6. **`HEAD` as `GET`.**
   - **(a, recommended) Yes,** so a `HEAD` carries the headers a `GET`
     would. It costs nothing new: React Router already runs the loaders for
     a `HEAD`, then drops everything.
   - (b) Pass `HEAD` through as React Router answers it.
7. **The catch-all and the contract.**
   - **(a, recommended) Outside `RoutesOf`, excluded from OpenAPI** through
     `isReactRouterRoute`.
   - (b) Typed like `@alxia/graphql`'s routes: the client would show a
     `/*` nobody calls.
8. **Production start.**
   - **(a, recommended) The plugin writes `build/server/serve.js`**, which
     listens. The entry stays a module that only exports the app.
   - (b) The entry calls `listen()` under `import.meta.env.PROD`. That is
     shorter, but a prerender at build time would import it and start
     listening, which is the reason hono-server's process flag exists.

Left for later: a per-request CSP nonce shared by `@alxia/secure-headers`
and `<Scripts nonce>`, the logger's duration for streamed bodies, a React
Router `basename`, `bun build --compile` into one file, and Cloudflare or
Node runtimes, which alxia does not target.

## Cost

- **`@alxia/react-router`:** about 150 lines for the runtime and 150 for
  `/vite` (the plugin, the adapter, the build wiring), plus specs over a
  fixture app built in the spec run, a README and a `docs/` folder (guide,
  troubleshooting with the traps above, roadmap).
- **Core:** the router's ranking in `match`, with specs that `fetch` and
  `listen` agree, and the "Routes" guide's paragraph on precedence.
- **`@alxia/compress`:** a flushing compressor for streamed bodies, with a
  spec that measures the first chunk.
- **CI:** the fixture build adds about a second to the test run, and
  `vite` and `@react-router/dev` join the devDependencies.

## Slices

1. **Core:** `app.fetch` ranks routes as `Bun.serve` does, with specs that
   compare it with `listen`, and the guide.
2. **`@alxia/compress`:** streamed bodies flushed per chunk, with a spec
   of the first chunk's timing.
3. **`@alxia/react-router`:** `reactRouter()`, `alxiaContext`, `alxiaOf`,
   the client assets, `HEAD`, `isReactRouterRoute`, specs over a fixture
   build, and the README.
4. **`@alxia/react-router/vite`:** the dev plugin, the entry as the SSR
   input, `serve.js`, and specs that start Vite in process and drive a page
   and the HMR socket. Then the guide and troubleshooting.
5. **Later, each on its own:** a CSP nonce with `@alxia/secure-headers`,
   and the logger's timing of streams.
