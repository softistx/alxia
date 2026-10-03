# Roadmap

What `@alxia/react-router` gives an app, and what is coming. This page is
a direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/react-router/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

- **A per-request CSP nonce.** `@alxia/secure-headers` and React Router's
  `<Scripts nonce>` sharing one nonce, so a page's policy needs no
  `'unsafe-inline'`.

## Later

- **alxia's sockets under `react-router dev`.** Under the Vite plugin the
  app answers through `app.fetch`, so `ws` routes, `page()` and
  `ctx.server` wait for the build.
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
- **A global `Register` augmentation** sparing `alxiaOf`'s type argument: a
  process may hold more than one app.
- **A runtime dependency.** The package declares none: `@alxia/core` and
  `react-router` are peers.

## Shipped

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
- **One server entry, with Vite.** `@alxia/react-router/vite`'s
  `alxiaServer()`: under `react-router dev` the entry is loaded through
  Vite's SSR runner and answers what Vite does not, with HMR, the entry's
  own edits live and the app's context keys shared; `react-router build`
  makes it the server build, prerendering included, and writes
  `build/server/serve.js`, which listens on `PORT` and `HOST`.
