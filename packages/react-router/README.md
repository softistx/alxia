# @alxia/react-router

[alxia](https://www.npmjs.com/package/@alxia/core) as the HTTP server of a
[React Router](https://reactrouter.com) framework app, server rendered,
under Bun. One Vite plugin and no server file: the pages are served by
alxia in `react-router dev` and from the build. When you want more,
`app/server.ts` adds the app's middlewares — logger, compression, sessions,
guards — and an `/api` beside the pages, and each loader reads what those
middlewares built, typed.

## Quick start

### A new app

```sh
bun create @alxia my-app --template react-router
cd my-app
bun dev
```

[`@alxia/create`](https://www.npmjs.com/package/@alxia/create) writes React
Router's official template with everything below already done: this
package and `@alxia/core` installed, `alxia()` in `vite.config.ts`, the
`bunfig.toml`, `start` on Bun, Biome, and a `Dockerfile` that builds on
`oven/bun` and runs `build/` alone on Alpine. Its dependencies are
moved to the newest releases alxia accepts.

### An existing React Router app

Start from the official template, `bunx create-react-router@latest`, or your
own app, and make four changes.

**1. Install** alxia and this package:

```sh
bun add @alxia/core @alxia/react-router
```

**2. Add the plugin** to `vite.config.ts`. It can go anywhere in `plugins`:

```diff
+import { alxia } from "@alxia/react-router/vite";
 import { reactRouter } from "@react-router/dev/vite";
 import tailwindcss from "@tailwindcss/vite";
 import { defineConfig } from "vite";

 export default defineConfig({
-  plugins: [tailwindcss(), reactRouter()],
+  plugins: [tailwindcss(), reactRouter(), alxia()],
   resolve: {
     tsconfigPaths: true,
   },
 });
```

**3. Run the scripts on Bun**, with a `bunfig.toml`:

```toml
# bunfig.toml, beside package.json
[run]
bun = true
```

The `react-router` CLI starts with `#!/usr/bin/env node`. Where a node is
installed, `bun run dev` would run it on Node, and alxia's server needs
Bun. `bun = true` makes `bun run` start it on Bun. Without it, the dev
server stops at startup with
[`alxia-react-router: react-router dev is running on Node, …`](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#alxia-react-router--is-running-on-node-and-alxias-server-runs-on-bun-).

**4. Start with Bun**, in `package.json`:

```diff
-    "start": "react-router-serve ./build/server/index.js",
+    "start": "NODE_ENV=production bun build/server/index.js",
```

With the `bunfig.toml` in place, the template's `dev`, `build` and
`typecheck` scripts are unchanged. alxia's dev helps follow React Router's
mode, on under `react-router dev`; `bun create @alxia` writes
`NODE_ENV=development react-router dev` as `dev`, so that the app's own
`Bun.env` reads agree:

- **`bun run dev`**: every request Vite does not answer itself (pages,
  data, `/api`, an upgrade to a `ws` route) reaches alxia, with HMR.
- **`bun run build`** writes `build/server/index.js`, a server you can run.
- **`bun run start`** serves the pages and the client build. It listens on
  `PORT` (3000) and `HOST` (`0.0.0.0`), and shuts down gracefully on
  `SIGTERM`: the requests in flight finish, then the `onStop` hooks run.

After a build, `bunx --bun vite preview` serves that built server through
Vite's preview server, as `bun run start` would: the pages, `/api`, the
client's files and the app's middlewares. So does React Router's prerendering.

`@alxia/core` and `react-router` 8 are peers, and `vite` 7 or 8 is an
optional peer, for `/vite`. The package declares no dependency.

Its `typescript` peer is 6 or 7. The template's TypeScript 5.9 typechecks,
but `bun add` warns about it; `bun add -d typescript@^6` silences the
warning.

## Customising: `app/server.ts`

Start from the default server, written out:

```sh
bunx alxia-react-router reveal
```

It writes `app/server.ts` (or the file `alxia({ entry })` names):
`createServer()` with `beforeAll`, `configure` and `getLoadContext`
commented, and the `Register` declaration. It refuses to overwrite a file
already there; `--force` overwrites it. Run it from the app's root, once
`@alxia/react-router` is installed.

The examples use `@alxia/logger` (`bun add @alxia/logger`); any middleware
works the same way (`use` the observers first). The Vite plugin picks the file up in dev and in the build:

```ts
// app/server.ts
import { logger } from '@alxia/logger';
import { createServer } from '@alxia/react-router';

const server = createServer({
	configure: (app) =>
		app
			.use(logger())
			.get('/api/health', ({ reply }) => reply.ok({ ok: true }))
			.derive(({ request }) => {
				const name = request.headers.get('x-user');
				return { user: name === null ? null : { name } };
			}),
});

export default server;

// What alxiaOf(context) reads in the loaders.
declare module '@alxia/react-router' {
	interface Register {
		server: typeof server;
	}
}
```

`configure` receives the alxia app and returns it, so what it builds is
typed. The plugin wires React Router's build, the mode and the client
folder.

A request runs through `beforeAll`, then the client's files, then
`configure`, then the pages. So a guard in `configure` does not block the
login page's JavaScript.

## Reading the context in a loader

```ts
// app/routes/home.tsx
import { alxiaOf } from '@alxia/react-router';
import type { Route } from './+types/home';

export function loader({ context }: Route.LoaderArgs) {
	const { user, log } = alxiaOf(context); // typed: what configure built
	log.info('home');
	return { name: user?.name ?? 'anonymous' };
}
```

How `alxiaOf(context)` is typed:

- with the `Register` declaration above, by that server: reading something
  no middleware derives is a compile error;
- without it, `alxiaOf<typeof server>(context)` names the server;
- with neither, by the base `@alxia/core`'s own `Register` names
  (`context: typeof base`), when the app has one;
- with none of them, `alxiaOf(context)` is `BaseContext`.

This package's `Register` wins over core's: the server's app is the base
and all `configure` adds after it.

### The server: `server`

`alxiaOf(context).server` is the `Bun.Server` serving the request, core's
`ctx.server`: its `publish` reaches the app's [WebSocket](#websockets)
subscribers from an action.

```ts
export async function action({ context }: Route.ActionArgs) {
	alxiaOf(context).server?.publish('todos', JSON.stringify({ changed: true }));
	return { ok: true };
}
```

It is the listening server behind `bun build/server/index.js`. Under
`react-router dev` and `vite preview`, Vite's server is `node:http`, so it is
the `Bun.Server` the app's sockets are relayed to, on a loopback port:
`publish` reaches them, but its `url` is that port's, not Vite's, and its
`requestIP` and `timeout` know nothing of a request Vite took. Through
`app.request(…)`, as in a test, it is `undefined`.
It is not `Register`'s `server`, which names what `createServer()` returned
for the types.

[More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#typing-the-loaders)

## A CSP nonce

With `secureHeaders({ nonce: true })` from `@alxia/secure-headers` in
`configure`, each request's policy names a fresh nonce, and the context
carries it. `nonceOf(loadContext)` reads it in `entry.server.tsx`, and React
Router puts it on every script it renders, so `script-src` needs no
`'unsafe-inline'`:

```ts
// app/server.ts
configure: (app) =>
	app.use(
		secureHeaders({
			nonce: true,
			contentSecurityPolicy:
				"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'",
		}),
	),
```

The template has no `entry.server.tsx`; reveal React Router's, then add
three lines:

```sh
bunx react-router reveal entry.server
```

```diff
 // app/entry.server.tsx, as reveal writes it
 import { PassThrough } from "node:stream";

+import { nonceOf } from "@alxia/react-router";
 import type { EntryContext, RouterContextProvider } from "react-router";
 …
     const { pipe, abort } = renderToPipeableStream(
-      <ServerRouter context={routerContext} url={request.url} />,
+      <ServerRouter context={routerContext} url={request.url} nonce={nonceOf(loadContext)} />,
       {
+        nonce: nonceOf(loadContext),
         [readyOption]() {
```

`nonceOf` returns `undefined` when no middleware set a nonce, so the entry works
with or without secure-headers: neither package depends on the other. Any
`derive` that returns a string `nonce` works the same.
[More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#a-csp-nonce)

## WebSockets

A `ws` route in `configure` connects under `react-router dev`, under
`vite preview` and from the build alike, with nothing else to write:

```ts
// app/server.ts
import { createServer } from '@alxia/react-router';

export default createServer({
	configure: (app) =>
		app
			.derive(({ request }) => ({ user: request.headers.get('x-user') }))
			.ws('/api/echo', {}, {
				open: (socket) => socket.send({ hello: socket.data.user ?? 'anonymous' }),
				message: (socket, message) => socket.send({ echo: String(message) }),
			}),
});
```

In dev, the plugin hands each upgrade Vite does not claim (its HMR, its
`server.proxy`) to the app, run by `Bun.serve` as `listen` runs it: the
middlewares before the route, a refusal's status, `socket.data`, `publish`. An
edit to the server is used from the next connection.
[More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#websockets)

## Options

```ts
// app/server.ts
import { trustProxy } from '@alxia/core';
import { logger } from '@alxia/logger';
import { createServer } from '@alxia/react-router';
import { greetingContext } from './context'; // createContext<string>('unset'), in app/context.ts

export default createServer({
	beforeAll: (app) => app.use(logger()), // runs before the client's files too
	configure: (app) => app.get('/api/health', ({ reply }) => reply.ok({ ok: true })),
	getLoadContext: (_ctx, context) => context.set(greetingContext, 'hello'),
	proxy: trustProxy({ trusted: ['10.0.0.0/8'] }), // behind a TLS proxy: request.url is the public URL
	listen: { idleTimeout: 30 }, // its port and hostname, if given, win over PORT and HOST
	onListen: (server) => console.log(`up on ${server.url}`),
});
```

`proxy` is `alxia({ proxy })`'s option: behind the proxies it names,
`ctx.ip` is the client's and React Router's `request.url` the URL the
client asked for, `https://` and the public host, so a loader can build an
absolute link from it; from any other connection the forwarded headers are
ignored. A server of your own gives `alxia({ proxy })` the same option. [More](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/serving.md#behind-a-proxy-proxy)

`build`, `mode` and `client` override what the plugin wires;
`client: false` serves no client files, so you can serve them yourself.
A server of your own, with no plugin, calls `reactRouter(app, { build,
client })` itself. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#escape-hatches)

## The client's files

In a build, `build/client` is served before `configure`'s middlewares:

| path | `Cache-Control` |
| --- | --- |
| `/assets/*`, the hashed bundles | `public, max-age=31536000, immutable` |
| every other top-level file or folder, the copies of `public/` | `public, max-age=3600` |

A missing asset gets alxia's JSON 404, not a page. In dev, Vite serves
these files.

## Leaving the pages out of `matchesSpec`

An API under `/api`, spec first, is checked against its OpenAPI document
by [`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi)'s
`matchesSpec` (`bun add -d @alxia/openapi`), which reads `app.routes`. The
catch-all and the client's files are routes too, and no operation of the
document: left alone, they only come back as `extra`, and `strict: true`
makes them fail:

```ts
// app/server.test.ts
import { test } from 'bun:test';
import { matchesSpec } from '@alxia/openapi';
import { isReactRouterRoute } from '@alxia/react-router';
import type { ServerBuild } from 'react-router';
import { operations } from './generated/alxia';
import server from './server';

test('the API routes every operation of openapi.yaml, and nothing else', async () => {
	const build: ServerBuild = await import(new URL('../build/server/index.js', import.meta.url).href);
	const app = server.create({ build });
	matchesSpec(app, operations, { strict: true, exclude: isReactRouterRoute });
});
```

`isReactRouterRoute` is true for each route this package declared, so
`matchesSpec` checks your own routes alone, under `strict`.

## Built for Bun

The server build runs on Bun, so the plugin builds it for Bun, with
nothing to configure. In Vite's `ssr` environment, in dev and in the
build, it adds:

- the `bun` export condition, to `resolve.conditions` and
  `resolve.externalConditions`: a package that exports a `bun` variant is
  bundled, and loaded in dev, as that variant;
- `bun` and `bun:*` to `resolve.builtins`: Bun's own modules stay imports
  of `build/server/index.js`;
- `build.target: 'esnext'`, where Vite's default targets browsers;
- in the build only, `resolve.noExternal: true`: every package is bundled
  into `build/server/index.js`, so `build/` runs with no `node_modules`.

```ts
// app/server.ts: Bun's modules, bundled as they are
import { createServer } from '@alxia/react-router';
import { Database } from 'bun:sqlite';

const db = new Database(':memory:');

export default createServer({
	configure: (app) =>
		app.get('/api/sqlite', ({ reply }) =>
			reply.ok(db.query('select sqlite_version() as version').get()),
		),
});
```

What the app sets wins: its own conditions and builtins are kept, `bun` is
added beside them, and a `build.target` it set is left as it is.
`ssr.target` stays `node`, and no polyfill is added; an app that sets
`ssr.target: 'webworker'` itself gets none of this, only Vite's defaults.
A package that cannot be bundled, a native addon, stays external when the
app names it, and every package does with `ssr.external: true`:

```ts
// vite.config.ts: sharp imported from node_modules at runtime
export default defineConfig({
	ssr: { external: ['sharp'] },
	plugins: [reactRouter(), alxia()],
});
```

The
[guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#built-for-bun)
has each option and why.

## Docker

A multi-stage `Dockerfile` on Bun's official images, built on Debian's
and run on Alpine's, as `@alxia/create`'s
`react-router` template ships it. For an app from `create-react-router`,
it replaces the template's, which runs on Node. The build is
self-contained, so the image holds `build/` alone, no `node_modules`:

```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* bunfig.toml* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
USER bun
EXPOSE 3000
CMD ["bun", "--no-install", "build/server/index.js"]
```

```sh
docker build -t my-app .
docker run -p 3000:3000 my-app
```

Keep the template's `.dockerignore`, and commit `bun.lock`. The server
runs as the non-root `bun` user, on `PORT` (3000). The
[guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#docker)
has the commented file, and what to copy for a package left external.

## Traps

- **A context key made in `app/` reaches the loaders only through the
  plugin**, which builds the server with the routes. A server of your own,
  without the plugin, holds another copy of the key: read alxia's context
  with `alxiaOf`. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#error-no-value-found-for-context)
- **Bun's user agent is a bot to `isbot`**, so a test client gets the
  finished page, never a stream. Send a browser's `user-agent`. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#a-streamed-page-arrives-in-one-piece)
- **An index route's action is `POST /?index`**; `POST /` gets React
  Router's 405. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#you-made-a-post-request-to--but-did-not-provide-an-action-for-route-root-so-there-is-no-way-to-handle-the-request)
- **`@alxia/secure-headers`' default policy blocks the page's scripts**
  and forms: give the pages a policy of their own, with `nonce: true` and
  `nonceOf` in `entry.server.tsx` rather than `'unsafe-inline'`. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#refused-to-execute-inline-script-because-it-violates-the-following-content-security-policy-directive-default-src-none)
- **Under `react-router dev`, `page()` and an HTTP request's
  `ctx.server` are absent**: requests arrive through `app.fetch`. A
  socket's upgrade has its server. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#ctxserver-is-undefined-under-react-router-dev)
- **An alxia route whose path covers a page takes it**, wherever it is
  declared: `GET /:slug` answers `/about`. Keep alxia's routes under
  `/api`. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#a-page-answers-alxias-json-404-or-405-instead-of-rendering)

## API

| export | |
| --- | --- |
| `createServer(options?)` | the server of `app/server.ts`. `beforeAll`, `configure`, `getLoadContext`, `proxy` (`alxia({ proxy })`'s, `trustProxy(…)` from `@alxia/core`), `build`, `mode`, `client`, `listen`, `onListen` |
| `ServerOptions<Before, App>` | its options |
| `ReactRouterServer<App>` | what it returns: `create(wiring)` makes the app, `start(app)` listens |
| `ServerWiring` | what `create` takes: `build`, `mode`, `client` |
| `FreshApp` | the app `beforeAll`, or `configure` without it, receives |
| `alxiaOf<App>(context)` | what alxia's middlewares built, in a loader, an action or a middleware. Typed by the registered server, by the type argument (a server or an app), or as `BaseContext`. Its `server` is the `Bun.Server` serving the request |
| `Register` | the interface to augment with `server: typeof server` |
| `RegisteredApp` | the app `alxiaOf` reads with no type argument: the registered server's, else the one `@alxia/core`'s `Register` names, else a fresh app |
| `RegisteredOf<R, Core?>` | the app a `Register`-shaped interface names: its server's, `InvalidRegister`, or with no server `Core`, by default core's `RegisteredBase` |
| `InvalidRegister` | what a `Register` naming neither a server nor an app reads as: every key of the app's own a compile error |
| `AppOf<Server>` | the app a server makes |
| `alxiaContext` | the React Router context key `alxiaOf` reads, set on every request |
| `nonceOf(context)` | the request's CSP nonce, for `entry.server.tsx`: the context's `nonce` when a middleware set one, such as `secureHeaders({ nonce: true })`, else `undefined` |
| `reactRouter(app, options)` | the catch-all and the client's files, for a server of your own. `build`, `mode`, `getLoadContext`, `client` |
| `ReactRouterOptions<Ctx>` | its options |
| `isReactRouterRoute(route)` | whether this package declared a route, for `matchesSpec`'s `exclude` |

From `@alxia/react-router/vite`:

| export | |
| --- | --- |
| `alxia(options?)` | the Vite plugin, for `react-router dev`, `react-router build` and `vite preview`, building the server for Bun. `entry` is the server file: `app/server.ts` by default, or the default server when there is none |
| `AlxiaOptions` | its options |

The `alxia-react-router` bin, run with `bunx`:

| command | |
| --- | --- |
| `reveal [--force]` | writes the default server to `app/server.ts`, or to `alxia({ entry })`'s file; refuses an existing file without `--force` |

## Documentation

- [Guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md): the setup, how dev, the build and `vite preview` work, what the build sets for Bun, customising the server, typing the loaders, the app's own keys, a CSP nonce, escape hatches, WebSockets, the client's files, OpenAPI, testing and deploying, with Docker.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md): each message, and the traps that print none.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/roadmap.md): what is coming, and what is not planned.
- [Example](https://github.com/softistx/alxia/tree/develop/examples/react-router): the official template, these four changes, then an `app/server.ts` with a session, an `/api`, secure headers with a nonce and a streamed page.
- [Recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md): [Deploy with Docker](https://github.com/softistx/alxia/blob/develop/docs/recipes/deploying.md), [Health checks and graceful shutdown](https://github.com/softistx/alxia/blob/develop/docs/recipes/health-and-shutdown.md).
