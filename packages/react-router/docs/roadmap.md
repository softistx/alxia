# Roadmap

What `@alxia/react-router` gives an app, and what is coming. This page is
a direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/react-router/CHANGELOG.md).

## Now

Nothing in progress.

## Next

Nothing scheduled yet.

## Later

- **`context.alxia` typed under `Route.LoaderArgs`.** Once react-router's
  `./internal` types and its main entry share one `RouterContextProvider`
  declaration, the generated route types see the shorthand too; today
  they read `alxiaOf(context)`.
- **`page()` under `react-router dev`.** An HTTP request reaches the app
  through `app.fetch`, so a Bun HTML bundle waits for the build.
- **The logger's duration of a streamed page**, to its last byte rather
  than its first.
- **A React Router `basename`**, the app served under a path.
- **One file**, `bun build --compile`, holding the server and the build.

## Not planned

- **React Router 7.** Its loaders' context is a `RouterContextProvider`
  only behind `future.v8_middleware`, and the line is in maintenance.
- **Node or Cloudflare.** alxia is a Bun framework; React Router's own
  adapters serve those runtimes.
- **The pages in the OpenAPI document.** Documents and single-fetch data
  are not something a generated client calls, so `isReactRouterRoute`
  leaves the catch-all out of `matchesSpec`'s check.
- **A runtime dependency.** The package declares none: `@alxia/core` and
  `react-router` are peers.
- **A `react-router-serve` of its own.** `bun build/server/index.js` is the
  server; there is no separate command to serve a build.
- **A `reveal folder` target.** react-router-hono-server's `reveal folder`
  writes `app/server/index.ts`. Here the plugin reads `app/server.ts` or
  the file `alxia({ entry })` names, and `reveal` writes that file:
  `alxia({ entry: 'app/server/index.ts' })` gives the folder form.
- **Several runtimes from one plugin.** react-router-hono-server picks Node,
  Bun, Deno or Cloudflare with a `runtime` option; alxia is Bun's.

## Shipped

### Next

- **`context.alxia`.** The object `alxiaOf(context)` returns, on React
  Router's provider with no import, typed by `Register` with
  `LoaderFunctionArgs` and `ActionFunctionArgs` from `react-router`;
  `alxiaOf(context)` stays the form for the generated `Route.LoaderArgs`.
- **`ctx.server` in dev.** Under `react-router dev` and `vite preview`, a
  loader's `alxiaOf(context).server` is the server the app's sockets are
  relayed to, so an action's `publish` reaches them as from the build.

### 0.7.0

- **The public URL behind a proxy.** `createServer({ proxy: trustProxy({ trusted }) })`,
  or `alxia({ proxy })` for a server of your own: React Router's
  `request.url` is the URL the client asked for, the scheme and host the
  trusted proxy said, and `ctx.ip` the client's; a direct client's
  forwarded headers are ignored.

### 0.6.0

- **Middlewares around the pages.** `beforeAll` and `configure` take
  `use(logger())`, `use(secureHeaders())` and the other middlewares of
  alxia 0.4, which run on the pages, the client's files declared after
  them, and every request no route matches; the request hooks they replaced,
  deprecated in 0.4, were removed in 0.5.
- **One graceful shutdown.** `start` relies on `@alxia/core`'s `listen`,
  which handles `SIGINT` and `SIGTERM` itself, before `onListen` as
  before: the requests in flight drain within `shutdownTimeout`
  (`listen: { shutdownTimeout }`), readiness turns 503, the `onStop`
  hooks run, then the process exits.

### 0.5.0

- **Loaders typed by core's `Register`.** `alxiaOf(context)` reads the base
  `@alxia/core`'s `Register` names when this package's names no server, so
  an app that registers its context once types its loaders too. This
  package's `Register` still wins when both are declared.

### 0.4.0

- **A self-contained build.** `react-router build` bundles every package
  into `build/server/index.js`, React, React Router and alxia included,
  so `build/` runs with no `node_modules` and a Docker image copies it
  alone. Never in dev; `ssr.external` keeps a package external, and
  `ssr.external: true` every package.

### 0.3.0

- **The server is built for Bun.** `alxia()` adds the `bun` export
  condition to the `ssr` environment's conditions and external
  conditions, keeps `bun` and `bun:*` external whichever runtime runs
  Vite, and targets `esnext`, in dev and in the build, with nothing to
  configure. A package's `bun` variant is the one bundled, and what the
  app sets is kept.
- **A Docker image on Bun.** The guide's Deploying has a multi-stage
  `Dockerfile` on `oven/bun:1`, running `bun build/server/index.js` as a
  non-root user.

### 0.2.0

- **A per-request CSP nonce.** `nonceOf(loadContext)` reads the nonce that
  `@alxia/secure-headers`' `nonce: true`, or a `derive` of the app's own,
  put on the context, so `entry.server.tsx` hands it to `<ServerRouter
  nonce>` and React in three lines. Every script of the page carries the
  nonce of its own response's policy, which needs no `'unsafe-inline'`.
  Neither package depends on the other.

### 0.1.0

- **React Router as a catch-all.** `reactRouter(app, { build })` serves
  documents, single-fetch data, actions, redirects with every cookie, lazy
  route discovery and the error pages, behind every middleware declared
  before it, streamed as React renders them.
- **The context, typed.** `alxiaOf<App>(context)` reads what alxia's middlewares
  built in any loader, action or middleware, through a key that is one
  object however the server was built; `getLoadContext` sets the app's own
  keys.
- **The client's files.** `client` serves `assets/` immutable and the
  copies of `public/` with an hour's cache, through the core's `static` and
  `file`.
- **`HEAD` with headers.** A `HEAD` is answered as its `GET`, less the
  body.
- **OpenAPI.** `isReactRouterRoute` leaves the catch-all and the client's
  files out of a check of `app.routes` against the document, such as
  `@alxia/openapi`'s `matchesSpec`.
- **Zero config, with Vite.** `@alxia/react-router/vite`'s `alxia()`,
  anywhere in `plugins`, is all an app from the official template needs.
  Without `app/server.ts` a default server serves the pages; with it,
  `createServer({ beforeAll, configure, getLoadContext, … })` customises
  the app, and the plugin wires React Router's build, the mode and the
  client folder. Under `react-router dev` the server is loaded through
  Vite's SSR runner, with HMR, its own edits live and the app's context keys
  shared. `react-router build` makes `build/server/index.js` the server,
  prerendering included: run, it listens on `PORT` and `HOST` and stops on
  `SIGTERM`; imported, it starts nothing.
- **`vite preview` serves the built server.** After `react-router build`,
  `bunx --bun vite preview` hands every request to `build/server/index.js`,
  as `bun run start` would answer it: the pages, `/api`, the client's files
  and the app's middlewares. React Router's prerendering runs on the same
  server, so a prerendered page's loader reads `alxiaOf`.
- **`bunx alxia-react-router reveal`.** The package's bin writes the
  default server into the app, `app/server.ts` or `alxia({ entry })`'s
  file: `createServer()` with `beforeAll`, `configure` and
  `getLoadContext` commented, and the `Register` declaration. It refuses
  to overwrite a file already there unless given `--force`, and runs under
  Bun with no Node.
- **WebSockets in dev and preview.** An alxia `ws` route connects under
  `react-router dev` and `vite preview` as from the build, with nothing to
  configure: the plugin relays each upgrade Vite does not claim (HMR, its
  proxy) to a `Bun.serve` of the app, so its middlewares, refusals,
  `socket.data` and handlers run as `listen` runs them, and in dev an edit
  to the server is used from the next connection.
- **Loaders typed with no type argument.** A `Register` declaration beside
  the server types `alxiaOf(context)`; `alxiaOf<typeof server>` and an app
  still work, and with neither it is `BaseContext`.
