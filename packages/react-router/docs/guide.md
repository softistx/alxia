# Guide

`@alxia/react-router` serves a React Router **framework-mode** app with
server rendering from an alxia app, under Bun. This page walks an app
author through it: the setup, what happens in dev, in a build and under
`vite preview`,
customising the server, typing the loaders, the app's own context keys,
the escape hatches, WebSockets, the client's files, OpenAPI, testing and
deploying.

- [Setup](#setup)
- [How it works](#how-it-works)
- [Customising the server](#customising-the-server)
- [Typing the loaders](#typing-the-loaders)
- [The app's own context keys](#the-apps-own-context-keys)
- [Escape hatches](#escape-hatches)
- [Hooks around the pages](#hooks-around-the-pages)
- [Routes beside the pages](#routes-beside-the-pages)
- [WebSockets](#websockets)
- [The client's files](#the-clients-files)
- [OpenAPI](#openapi)
- [Testing](#testing)
- [Deploying](#deploying)

## Setup

Start from React Router's official template:

```sh
bunx create-react-router@latest my-app
cd my-app
```

Then make three changes.

**1. Install** alxia and this package:

```sh
bun add @alxia/core @alxia/react-router
```

**2. Add `alxia()`** to the plugins in `vite.config.ts`:

```ts
// vite.config.ts
import { alxia } from '@alxia/react-router/vite';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), reactRouter(), alxia()],
	resolve: {
		tsconfigPaths: true,
	},
});
```

The order does not matter. The plugin always runs before React Router's:
React Router's build reads its server input from it, and its dev
middleware must come after alxia's.

**3. Start with Bun**, in `package.json`:

```jsonc
"scripts": {
	"build": "react-router build",
	"dev": "react-router dev",
	"start": "bun build/server/index.js",
	"typecheck": "react-router typegen && tsc"
}
```

Only `start` changes. With no Node installed, `bun run` runs
`react-router`'s scripts under Bun, so `bun run dev`, `bun run build` and
`bun run typecheck` work as they are; `bunx --bun` is not needed. The
template's `@react-router/serve` is no longer used, and you can remove it.

What the template keeps:

- `@react-router/node`, which React Router's default `entry.server`
  renders with: it streams under Bun.
- Vite 7 or 8 (the template ships 8).
- Its `typescript` 5.9. This package's peer asks for 6 or 7, so `bun add`
  warns, but the template's code typechecks with 5.9.
  `bun add -d typescript@^6` silences the warning.

React Router 8 is required: its loaders receive a `RouterContextProvider`,
and alxia's context is set on it.

## How it works

With no `app/server.ts`, the plugin serves the app with
`createServer()`, from this package, with no options: a fresh alxia app,
the client's files, and the pages as a catch-all behind it.

### In dev

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
  module graph. See [The app's own context keys](#the-apps-own-context-keys).
- **Errors** go to Vite's error page, with the stack mapped to the source.
- **alxia's `ws` routes connect**: an upgrade Vite's HMR does not claim
  goes to the app, as from the build. See [WebSockets](#websockets).

HTTP requests reach the app through `app.fetch`, as in a test, not
through `listen`. So `page()` and an HTTP request's `ctx.server` are
absent in dev; see [the troubleshooting entry](troubleshooting.md#ctxserver-is-undefined-under-react-router-dev).

### In a build

`react-router build` builds the client as usual. It builds the server
from `app/server.ts`, or from the default server, with React Router's
server build inside it, into one file:

- **`build/server/index.js`'s default export is the alxia app.** Beside it
  are React Router's own exports, so the file is a server build too, and
  React Router's `prerender` reads it. The server file's other exports
  stay out of it.
- **Run, it listens**: `bun build/server/index.js` listens on `PORT`
  (3000 by default) and `HOST` (`0.0.0.0`). It prints
  `alxia listening on <url>`. On `SIGINT` or `SIGTERM` it stops the app,
  runs its `onStop` hooks, and exits.
- **Imported, it starts nothing**: prerendering, a test or another server
  can import it safely, since it listens only when it is the process's
  entry point (`import.meta.main`).
- **The mode follows the command**: `development` under `react-router dev`,
  `production` in a build, whatever `NODE_ENV` says.
- **The client folder is resolved against the built file**: `../client`,
  from React Router's `buildDirectory`, so it is found wherever the
  process starts.

```sh
bun run build
PORT=8080 bun run start
```

React Router's `serverBundles` split the server build in several, and
alxia serves one: the plugin refuses them. With `ssr: false`, a
single-page app, the plugin does nothing.

### Under `vite preview`

After a build, Vite's preview server serves the built server:

```sh
bun run build
bunx --bun vite preview
```

`--bun` runs Vite under Bun even where Node is installed, since Vite's bin
asks for Node: the built server runs inside Vite's process, and it needs
Bun's APIs. With no Node installed, a `"preview": "vite preview"` script
run with `bun run preview` works too, as the template's other scripts do.

The plugin loads `build/server/index.js` on the first request and hands
every request to its default export, the alxia app, before Vite's own
files. So the preview answers as `bun run start` does: the pages and their
data, `/api`, `build/client` with the cache headers of
[the client's files](#the-clients-files), and every hook of `beforeAll`
and `configure`. Requests, their bodies and every `Set-Cookie` pass
through whole, and pages stream.

What differs from `bun run start`:

- **Vite listens**, on `preview.port` (4173), `preview.host` and
  `preview.https`. `listen`, `onListen`, `PORT` and `HOST` are not read.
- **Requests arrive through `app.fetch`**, as under `react-router dev`:
  `page()` and an HTTP request's `ctx.server` are absent. alxia's `ws`
  routes connect, relayed to a `Bun.serve` of the built app as in dev
  ([WebSockets](#websockets)); an upgrade `preview.proxy` relays stays
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
and `configure`'s hooks run around it.

## Customising the server

Write `app/server.ts`, with `createServer()` as its default export, or let
the package's bin write it for you.

### Revealing the default server

From the app's root, once `@alxia/react-router` is installed:

```sh
bunx alxia-react-router reveal
```

```text
alxia-react-router: wrote app/server.ts, the server alxia() runs by default.
Next: uncomment configure in app/server.ts to add the app's hooks and /api; bun run dev picks it up.
```

The file is the server the plugin runs without one, `createServer()`, so
the app answers as before. It holds `beforeAll`, `configure` and
`getLoadContext`, commented, each of which compiles once uncommented
(`getLoadContext`'s key is yours to make, below), and the `Register`
declaration that types the loaders:

```ts
// app/server.ts, as reveal writes it, less its comments
import { createServer } from '@alxia/react-router';
// import { userAgentContext } from './context';

const server = createServer({
	// beforeAll: (app) => app,
	// configure: (app) => app.get('/api/health', ({ reply }) => reply.ok({ ok: true })),
	// getLoadContext: (ctx, context) => {
	// 	context.set(userAgentContext, ctx.request.headers.get('user-agent'));
	// },
});

export default server;

declare module '@alxia/react-router' {
	interface Register {
		server: typeof server;
	}
}
```

`getLoadContext`'s example sets a key of the app's own, imported from
`app/context.ts`. Make it there before uncommenting both lines:

```ts
// app/context.ts
import { createContext } from 'react-router';

export const userAgentContext = createContext<string | null>(null);
```

- **Where it writes**: the `entry` that `alxia({ entry: '…' })` names in
  `vite.config.ts`, or `server.ts` in React Router's `appDirectory`
  (`app/` unless `react-router.config.ts` names another). It reads both as
  string literals, past comments. A computed one is refused, since
  reveal would write a file the plugin does not load: give it as a
  literal.
- **It never overwrites**: a file already there is left as it is, and the
  command exits 1. `bunx alxia-react-router reveal --force` overwrites it.
- **Bun only**: the bin starts with `#!/usr/bin/env bun`, so no Node is
  needed.

React Router's own rendering entries, `app/entry.server.tsx` and
`app/entry.client.tsx`, are revealed by React Router:
`bunx react-router reveal`.

### By hand

The example uses `@alxia/logger` and `@alxia/compress`
(`bun add @alxia/logger @alxia/compress`); any plugin works the same way.

```ts
// app/server.ts
import { compress } from '@alxia/compress';
import { logger } from '@alxia/logger';
import { createServer } from '@alxia/react-router';

const server = createServer({
	configure: (app) =>
		app
			.use(logger())
			.use(compress())
			.get('/api/health', ({ reply }) => reply.ok({ ok: true }))
			.derive(({ request }) => {
				const name = request.headers.get('x-user');
				return { user: name === null ? null : { name } };
			}),
});

export default server;

declare module '@alxia/react-router' {
	interface Register {
		server: typeof server;
	}
}
```

Every option is optional:

| option | what it does |
| --- | --- |
| `configure(app)` | the app the pages run behind: its plugins, hooks and `/api`. It returns the app, and what it builds is what the loaders read |
| `beforeAll(app)` | runs first, on a new app. What it declares applies to the client's files too: a rate limit, a guard on everything, a logger that should see every asset. It returns the app, which `configure` then receives |
| `getLoadContext(ctx, context)` | sets the app's own keys on React Router's provider, `ctx` typed by `configure`'s app |
| `build`, `mode`, `client` | override what the plugin wires; see [Escape hatches](#escape-hatches) |
| `listen` | `listen`'s options for `bun build/server/index.js`: `port`, `hostname`, `idleTimeout`, `maxRequestBodySize`, `tls`. A `port` or `hostname` given here wins over `PORT` and `HOST` |
| `onListen(server)` | called once the built server listens, in place of the `alxia listening on …` line |

A request goes through four layers, in order:

1. what `beforeAll` declared;
2. the client's files, `build/client`, in a build;
3. what `configure` declared;
4. the pages: `GET`, `POST`, `PUT`, `PATCH` and `DELETE` at `/*`.

Hooks apply to the routes declared after them, so a session or a guard in
`configure` runs around every page and its data, but not around the
JavaScript of the login page. Global hooks (`onRequest`, `@alxia/cors`,
`@alxia/compress`, `@alxia/secure-headers`) apply everywhere, wherever
they are declared.

```ts
// app/server.ts: a guard on everything, the assets included
import { createServer } from '@alxia/react-router';

export default createServer({
	beforeAll: (app) =>
		app.derive(({ request, reply }) =>
			request.headers.get('authorization') === `Bearer ${process.env['TOKEN']}`
				? {}
				: reply(401, { error: 'unauthorized' }),
		),
});
```

`configure` and `beforeAll` must return the app; one that returns nothing
is a compile error. A plugin that needs something an earlier one
derived is typed by the app it is given, as anywhere in alxia.

## Typing the loaders

Every request through the catch-all sets `alxiaContext`, this package's
key, on React Router's context provider, to what alxia's hooks built for
that request. `alxiaOf(context)` reads it.

### With `Register`: no type argument

The `declare module` block in `app/server.ts` names the server once:

```ts
declare module '@alxia/react-router' {
	interface Register {
		server: typeof server;
	}
}
```

Every loader, action and middleware then reads it typed, with no import:

```ts
// app/routes/account.tsx
import { alxiaOf } from '@alxia/react-router';
import { data, redirect } from 'react-router';
import type { Route } from './+types/account';

export function loader({ context }: Route.LoaderArgs) {
	const { user, log, requestId } = alxiaOf(context);
	if (user === null) throw redirect('/login');
	log.info('account');
	return { name: user.name, requestId };
}

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = alxiaOf(context);
	const form = await request.formData();
	if (user === null) return data({ error: 'signed out' }, { status: 401 });
	return { saved: form.get('name'), by: user.name };
}
```

Name `typeof server`, the default export's type, not the module's
(`typeof import('./server')`): a wrong registration makes every read a
compile error, as [the troubleshooting entry](troubleshooting.md#property--does-not-exist-on-type-basecontext---readonly-registerserver-must-be-typeof-server-the-default-export-of-createserver-never-)
shows. The checks it gives:

```ts
const ctx = alxiaOf(context);
ctx.tenant;     // error: no hook derives `tenant`
ctx.user.name;  // error: `user` may be null
```

### Without `Register`: the type argument

Pass the server's type, imported with `import type`, so nothing is
bundled and the route never imports the server at runtime:

```ts
// app/server.ts
const server = createServer({ configure: (app) => app.use(logger()) });
export default server;
export type Server = typeof server;
```

```ts
// app/routes/home.tsx
import { alxiaOf } from '@alxia/react-router';
import type { Server } from '../server';
import type { Route } from './+types/home';

export function loader({ context }: Route.LoaderArgs) {
	const { log } = alxiaOf<Server>(context);
	log.info('home');
	return null;
}
```

The type argument may also be an alxia app, the app *before* the
catch-all, for a server of your own. Anything else is a compile error.
With neither `Register` nor a type argument, `alxiaOf(context)` is
`BaseContext`: the request, its URL, `reply` and the rest of what every
hook reads.

### Why a global augmentation is right here

alxia's core refuses global augmentation of its context: a plugin that
added `user` to every route, declared before it or after, would type
`user` on routes that run before the plugin. That is the lie "order is
meaning" forbids. `Register` here does something else: it names the
**one** server of the React Router build, at the point of its catch-all,
which is exactly what every loader runs behind. One build has one server
entry, so there is no second app for a module to be confused with.

If two React Router apps share one TypeScript program (one tsconfig over
both folders of a monorepo), their two declarations conflict, and `tsc`
says so (`Subsequent property declarations must have the same type`).
Give each app its own tsconfig, or use the type argument in both.

### Outside the catch-all

Without the plugin, under a plain `react-router dev`, or in a unit test
that calls a loader with a bare provider, there is no alxia context, and
`alxiaOf` throws, saying so: see
[the troubleshooting entry](troubleshooting.md#alxiaof-this-request-has-no-alxia-context-).

## The app's own context keys

React Router 8 passes data to loaders through keys made by
`createContext<T>()`, and matches a key by object identity. Under the
plugin, the server is built and loaded with the routes, so a key in
`app/` is one object for both:

```ts
// app/context.ts
import { createContext } from 'react-router';

export const greetingContext = createContext<string>('unset');
```

```ts
// app/server.ts
import { createServer } from '@alxia/react-router';
import { greetingContext } from './context';

export default createServer({
	getLoadContext: (_ctx, context) => context.set(greetingContext, 'hello'),
});
```

```ts
// app/routes/home.tsx
import { greetingContext } from '../context';
import type { Route } from './+types/home';

export function loader({ context }: Route.LoaderArgs) {
	return { greeting: context.get(greetingContext) };
}
```

`getLoadContext` runs before React Router, on every request, with
`alxiaContext` already set. Its `ctx` is typed by `configure`'s app:
reading something no hook derives is a compile error. Keep the keys in a
module of their own, such as `app/context.ts`, rather than in
`app/server.ts`: a route imports them, and the server file then stays out
of the client's module graph.

A server of your own, without the plugin, holds another copy of every
key under `app/`: see
[the troubleshooting entry](troubleshooting.md#error-no-value-found-for-context).

## Escape hatches

### Another server file

`alxia({ entry })` names the server file, relative to Vite's root, in
place of `app/server.ts`:

```ts
// vite.config.ts
import { alxia } from '@alxia/react-router/vite';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [reactRouter(), alxia({ entry: 'server/main.ts' })],
});
```

A missing `entry` is an error, where a missing `app/server.ts` falls back
to the default server.

### Overriding the wiring

`build`, `mode` and `client` override what the plugin passes:

```ts
// app/server.ts: the client's files with headers of your own
import { createServer } from '@alxia/react-router';

export default createServer({
	client: false,
	beforeAll: (app) =>
		app.static('/assets', 'build/client/assets', {
			cacheControl: 'public, max-age=31536000, immutable',
			precompressed: ['br'],
		}),
});
```

- **`client: false`** serves none of `build/client`: declare the files
  yourself, in `beforeAll` or `configure`. A relative path there is
  resolved against the process's working directory, the project's when it
  runs `bun run start`.
- **`client`**, a path or a `file:` URL, serves another folder in its
  place.
- **`mode`** forces React Router's server mode. `development` makes React
  Router send its errors' stacks, and asks `build` for the build on every
  request.
- **`build`**, a `ServerBuild` or a function returning one, replaces React
  Router's build: rarely wanted.

### A server of your own, without the plugin

`reactRouter(app, options)` is the catch-all itself, for a server that
imports the build. Without the plugin, the dev server is React Router's
own, and the loaders get no alxia context in dev.

```ts
// server.ts, beside build/
import { alxia } from '@alxia/core';
import { logger } from '@alxia/logger';
import { reactRouter } from '@alxia/react-router';
import type { ServerBuild } from 'react-router';

export const base = alxia()
	.use(logger())
	.get('/api/health', ({ reply }) => reply.ok({ ok: true }));

/** What the loaders read: alxiaOf<Base>(context). */
export type Base = typeof base;

const app = base.use((app) =>
	reactRouter(app, {
		build: () =>
			import(new URL('./build/server/index.js', import.meta.url).href) as Promise<ServerBuild>,
		client: new URL('./build/client', import.meta.url),
	}),
);

app.listen({ port: Number(process.env['PORT'] ?? 3000) });
```

```sh
bun run build && bun server.ts
```

| option | |
| --- | --- |
| `build` | a `ServerBuild`, loaded at startup; or a function returning one, called on the first request in `production`, again after a failed load, and on **every** request in `development` |
| `mode` | React Router's server mode, `production` by default |
| `getLoadContext(ctx, context)` | as `createServer`'s |
| `client` | the client build's folder, a path or a `file:` URL, served before the catch-all in `production` |

`reactRouter()` goes through `use`, as `@alxia/graphql`'s `graphql(app, …)`
does: that is how it knows the app's context type. A `HEAD` is handed to
React Router as a `GET`, since React Router answers a `HEAD` of its own
with no headers at all; the core then drops the body. In a monorepo where
this package is linked rather than installed, add
`ssr: { external: ['@alxia/react-router'] }` to `vite.config.ts`: see
[the troubleshooting entry](troubleshooting.md#alxiaof-this-request-has-no-alxia-context-).

## Hooks around the pages

Every hook declared before the catch-all runs around each page, as around
any route:

- **`@alxia/logger`** writes one entry per request and sets
  `x-request-id`. It times a streamed page by its first byte, since
  `onResponse` runs when the headers leave.
- **`@alxia/compress`** compresses documents and data, and flushes a
  streamed page as React writes it: the shell and its `<Suspense>`
  fallback still arrive first, in zstd, Brotli or gzip. See [the troubleshooting entry](troubleshooting.md#a-streamed-page-arrives-in-one-piece).
- **`@alxia/secure-headers`**' default policy, `default-src 'none'`, blocks
  every script of the page, React Router's inline ones included, and its
  `form-action 'none'` blocks a `<Form>`'s post. Give the pages a policy of
  their own: see [the troubleshooting entry](troubleshooting.md#refused-to-execute-inline-script-because-it-violates-the-following-content-security-policy-directive-default-src-none).
- **A guard** — `@alxia/jwt`'s `bearer`, `@alxia/janus`' session — in
  `configure` guards every page and its data alike; in `beforeAll`, the
  client's files too.

## Routes beside the pages

alxia's own routes answer their paths wherever they are declared:

```ts
// app/server.ts
import { createServer } from '@alxia/react-router';

export default createServer({
	configure: (app) =>
		app
			.get('/api/health', ({ reply }) => reply.ok({ ok: true }))
			.get('/api/orders/:id', ({ params, reply }) => reply.ok({ id: params.id })),
});
```

Each answers with its own schemas, replies and typed client. The core ranks
paths as `Bun.serve` does, through `listen`, `app.fetch` and
`app.request` alike: segment by segment, a literal beats a parameter,
which beats the catch-all's wildcard. Two consequences:

- **The path is chosen before the method.** With only `POST /api/orders`,
  a `GET /api/orders` is alxia's 405, not a page.
- **A route whose path covers pages takes them.** `GET /:slug` answers
  every one-segment path, `/about` included, before React Router sees it.
  Put alxia's routes under a prefix of their own, `/api`.

The catch-all adds nothing to the app's route table: `RoutesOf` and the
typed client never show `/*`. Pages and single-fetch data are not
something a typed client calls; what it does call, your `/api`, is typed
as always.

What React Router answers comes back as it sent it: documents,
single-fetch data (`/_.data`, `/login.data`), lazy route discovery
(`/__manifest`), redirects with every `Set-Cookie` they carry, and the
error pages, a 404 or a 500 rendered by the app's `ErrorBoundary`.

## WebSockets

A `ws` route declared in `configure` (or `beforeAll`) is a socket under
`react-router dev`, under `vite preview` and from
`bun build/server/index.js` alike. There is
nothing to add: no option, no package, no second server to start.

```ts
// app/server.ts
import { createServer } from '@alxia/react-router';

export default createServer({
	configure: (app) =>
		app
			.derive(({ request }) => {
				const name = request.headers.get('x-user');
				return { user: name === null ? null : { name } };
			})
			.ws('/api/echo', {}, {
				open: (socket) => socket.send({ hello: socket.data.user?.name ?? 'anonymous' }),
				message: (socket, message) => socket.send({ echo: String(message) }),
			})
			.group((guarded) =>
				guarded
					.derive(({ user, reply }) =>
						user === null ? reply(401, { error: 'unauthenticated' as const }) : { user },
					)
					.ws('/api/rooms/:room', {}, {
						open: (socket) => socket.subscribe(socket.data.params.room),
						message: (socket, message) =>
							socket.publish(socket.data.params.room, {
								from: socket.data.user.name,
								text: String(message),
							}),
					}),
			),
});
```

The upgrade runs the hooks declared before the route, and the route's
validation, as any request does. A hook's reply refuses it: the client
gets the 401 and its body, and no socket opens. `socket.data` holds the
validated request and what each hook derived, typed. See
[`@alxia/core`'s WebSockets](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/websockets.md)
for the schemas and the rest of the socket.

The guard sits in a `group` so it refuses the sockets alone: declared on
`app` itself, it would apply to every route after it, the pages'
catch-all included.

### Under `react-router dev`

Vite's dev server is a `node:http` server, and an alxia socket is
`Bun.serve`'s upgrade. The plugin listens for Vite's `upgrade` event and
leaves Vite's own socket alone: an upgrade asking for the `vite-hmr` or
`vite-ping` subprotocol is Vite's, and HMR works as before. Any other
upgrade, except one Vite's `server.proxy` relays itself (an entry with
`ws: true` or a `ws:` target, matched as Vite matches it), is relayed,
byte for byte, to a `Bun.serve` of the app on a loopback port of its
own, started on the first upgrade and given
`app.fetch` and `app.websocket`, as `listen` gives them. So in dev:

- **The same hooks, refusals and handlers run** as from the build:
  `open`, `message`, `close`, `drain`, the `message` and `send` schemas,
  `subscribe` and `publish`.
- **An edit to `app/server.ts`, or to a module it imports, is used from
  the next connection.** The edit makes a new app, and the next upgrade
  starts a new `Bun.serve` for it. A socket opened before the edit keeps
  the handlers it opened with until it closes.
- **A `publish` reaches the sockets opened since the same edit**: the
  sockets opened before it are on the previous server. Reload the pages
  after an edit to reconnect them.
- **A socket's `ctx.ip` is the loopback address**, the relay's. The
  browser is local in dev, so that is usually its address anyway.
- **An upgrade to a path with no `ws` route** gets what the build answers
  it too, never a socket: alxia's 404 where nothing matches, the page
  where the catch-all does.
- **Another plugin that listens for upgrades** competes with the relay
  on the paths it shares with it: give its socket a path under a
  `server.proxy` entry with `ws: true` or a `ws:` target, or outside the
  app's.
- **With Vite in middleware mode**, there is no `node:http` server of
  Vite's to listen on: serve the app yourself, as in
  [A server of your own](#a-server-of-your-own-without-the-plugin).

Under `vite preview` the same relay runs, to a `Bun.serve` of the built
app, loaded once. Under `bun build/server/index.js`, nothing of this runs:
`listen` serves the sockets itself, as any alxia app's.

## The client's files

In a build, each top-level entry of `build/client` becomes a route, after
`beforeAll` and before `configure`:

| entry | route | `Cache-Control` |
| --- | --- | --- |
| `assets/`, the hashed bundles | `static('/assets', …)` | `public, max-age=31536000, immutable` |
| another folder, such as `images/` from `public/images/` | `static('/images', …)` | `public, max-age=3600` |
| a file, such as `robots.txt` or `favicon.ico` | `file('/robots.txt', …)` | `public, max-age=3600` |

They are the core's `static` and `file` routes, so ETags,
`Last-Modified`, 304s and ranges are included. A missing file under one
of those folders gets alxia's JSON 404, `{ "error": "not_found" }`, not a
page, so a folder of `public/` shadows any page path under the same name.
Dotfiles are skipped. In dev, Vite serves them.

A folder that is not one, or a file whose name no route can carry, is
refused when the server starts: see
[the troubleshooting entries](troubleshooting.md#typeerror-reactrouter-client-is--which-is-not-a-directory-).

## OpenAPI

`@alxia/openapi` documents every route of `app.routes`, and the catch-all
and the client's files are routes. Leave them out with
`isReactRouterRoute`, which is true for each route this package declared:

```ts
// app/server.ts
import { docs } from '@alxia/openapi';
import { createServer, isReactRouterRoute } from '@alxia/react-router';

export default createServer({
	configure: (app) =>
		app
			.get('/api/health', ({ reply }) => reply.ok({ ok: true }))
			.use(docs(app, { info: { title: 'Shop', version: '1.0.0' }, exclude: isReactRouterRoute })),
});
```

Combine it with your own: `exclude: (route) => isReactRouterRoute(route) ||
route.path === '/api/health'`.

## Testing

`server.create(wiring)` makes the app in process, from a build: import
the server, and pass it React Router's build, which
`build/server/index.js` holds. The test needs Bun's types:
`bun add -d @types/bun`, and `"bun"` in the tsconfig's `types`.

```ts
// app/server.test.ts
import { expect, test } from 'bun:test';
import type { ServerBuild } from 'react-router';
import server from './server';

const BROWSER = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

test('the home page renders', async () => {
	// After `bun run build`: React Router's build is inside the server build.
	const build: ServerBuild = await import(new URL('../build/server/index.js', import.meta.url).href);
	const app = server.create({ build, client: new URL('../build/client', import.meta.url) });
	const response = await app.request('/', { headers: { 'user-agent': BROWSER } });
	expect(response.status).toBe(200);
});
```

Or drive the built app itself, the default export of
`build/server/index.js`: importing it starts no server. Or run it, as
[the example's spec](https://github.com/softistx/alxia/blob/develop/examples/react-router/app/server.spec.ts)
does: `bun build/server/index.js` with `PORT=0`, then read the URL from
its `alxia listening on <url>` line.

Send a browser's user agent. `isbot('Bun/1.4.2')` is true, and React
Router's entry waits for the whole page before it answers a bot, so a test
with Bun's own user agent never sees a page stream. An index route's action
is `POST /?index`, not `POST /`.

## Deploying

Run `bun run build`, then `bun build/server/index.js` beside the project's
production `node_modules`: the build imports `react`, `react-router` and
alxia from them, as any React Router server build does. The template's
`Dockerfile` no longer works once `start` runs Bun: it is based on a Node
image with no Bun, and copies a `package-lock.json` a Bun app does not
have. Base it on an `oven/bun` image instead, install with
`bun install --production`, and make its command
`bun build/server/index.js`.

`PORT` and `HOST` set where the server listens. The platform's `SIGTERM`
stops it once the requests in flight are answered, and runs the app's
`onStop` hooks.
