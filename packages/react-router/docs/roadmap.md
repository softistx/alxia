# Roadmap

What `@alxia/react-router` gives an app, and what is coming. This page is
a direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/react-router/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

Nothing scheduled yet.

## Later

- **`ctx.server` under `react-router dev`.** An HTTP request reaches the
  app through `app.fetch`, so `ctx.server` and `page()` wait for the build;
  a socket's upgrade already has its server.
- **The logger's duration of a streamed page**, to its last byte rather
  than its first.
- **A React Router `basename`**, the app served under a path.
- **One file**, `bun build --compile`, holding the server and the build.

## Not planned

- **React Router 7.** Its loaders' context is a `RouterContextProvider`
  only behind `future.v8_middleware`, and the line is in maintenance.
- **Node or Cloudflare.** alxia is a Bun framework; React Router's own
  adapters serve those runtimes.
- **The pages in the route table.** Documents and single-fetch data are not
  something the typed client calls, so the catch-all stays out of
  `RoutesOf`.
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

### Next release

- **A per-request CSP nonce.** `nonceOf(loadContext)` reads the nonce that
  `@alxia/secure-headers`' `nonce: true`, or a `derive` of the app's own,
  put on the context, so `entry.server.tsx` hands it to `<ServerRouter
  nonce>` and React in three lines. Every script of the page carries the
  nonce of its own response's policy, which needs no `'unsafe-inline'`.
  Neither package depends on the other.

### 0.1.0

- **React Router as a catch-all.** `reactRouter(app, { build })` serves
  documents, single-fetch data, actions, redirects with every cookie, lazy
  route discovery and the error pages, behind every hook declared before
  it, streamed as React renders them.
- **The context, typed.** `alxiaOf<App>(context)` reads what alxia's hooks
  built in any loader, action or middleware, through a key that is one
  object however the server was built; `getLoadContext` sets the app's own
  keys.
- **The client's files.** `client` serves `assets/` immutable and the
  copies of `public/` with an hour's cache, through the core's `static` and
  `file`.
- **`HEAD` with headers.** A `HEAD` is answered as its `GET`, less the
  body.
- **OpenAPI.** `isReactRouterRoute` leaves the catch-all and the client's
  files out of `@alxia/openapi`'s document.
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
  and the app's hooks. React Router's prerendering runs on the same
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
  proxy) to a `Bun.serve` of the app, so its hooks, refusals,
  `socket.data` and handlers run as `listen` runs them, and in dev an edit
  to the server is used from the next connection.
- **Loaders typed with no type argument.** A `Register` declaration beside
  the server types `alxiaOf(context)`; `alxiaOf<typeof server>` and an app
  still work, and with neither it is `BaseContext`.
