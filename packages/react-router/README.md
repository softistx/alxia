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
optional peer, for `/vite`; `react` 19 is an optional peer, for `/pwa/react`, `/fetcher` and `/lists`. The six `workbox-*`
packages (`workbox-core`, `workbox-expiration`, `workbox-navigation-preload`,
`workbox-precaching`, `workbox-routing`, `workbox-strategies`) are optional
peers too, for `/pwa/worker` (the [PWA section](#installable-and-offline-pwa) has the install line). `/errors` imports `react-router`, a required peer that is already installed. The package declares no dependency.

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

What alxia's middlewares built for a request reaches a loader, an action or
a middleware in three forms, each the same object, typed by the `Register`
declaration above:

| Form | Use it |
| --- | --- |
| `withAlxia(fn)` | with the generated `Route.LoaderArgs` and `Route.ActionArgs`: `alxia` beside the arguments |
| `alxiaOf(context)` | inside a plain function, or with a type argument where nothing is registered |
| `context.alxia` | with `LoaderFunctionArgs` and `ActionFunctionArgs` from `react-router` |

```ts
// app/routes/home.tsx
import { type AlxiaArgs, withAlxia } from '@alxia/react-router';
import type { Route } from './+types/home';

export const loader = withAlxia(({ alxia }: Route.LoaderArgs & AlxiaArgs) => {
	alxia.log.info('home'); // typed: what configure built
	return { name: alxia.user?.name ?? 'anonymous' };
});
```

`withAlxia` returns a function of React Router's arguments alone, with
`fn`'s return type: `Route.ComponentProps['loaderData']` and
`useLoaderData<typeof loader>` read what `fn` returns. It works for an
action, and for a middleware, whose `next` it passes on.

`alxiaOf(context)`, in a plain function:

```ts
import { alxiaOf } from '@alxia/react-router';

export async function action({ context }: Route.ActionArgs) {
	const { user, log } = alxiaOf(context);
	log.info('saved', { by: user?.name });
	return { ok: true };
}
```

How each is typed:

- with the `Register` declaration above, by that server: reading something
  no middleware derives is a compile error;
- without it, `AlxiaArgs<typeof server>` or `alxiaOf<typeof server>(context)`
  names the server;
- with neither, by the base `@alxia/core`'s own `Register` names
  (`context: typeof base`), when the app has one;
- with none of them, `BaseContext`.

This package's `Register` wins over core's: the server's app is the base
and all `configure` adds after it.

### The shorthand: `context.alxia`

The same object, with no import and no call, where the arguments are
react-router's own types:

```ts
import type { LoaderFunctionArgs } from 'react-router';

export function loader({ context }: LoaderFunctionArgs) {
	const { user, server } = context.alxia;
	return { name: user?.name ?? 'anonymous' };
}
```

With the generated `Route.LoaderArgs` it is there at runtime, but `tsc`
reports `Property 'alxia' does not exist on type
'Readonly<RouterContextProvider>'` (TS2339): react-router's `./internal`
types, which the generated route types read, point at its development
build, a second declaration of `RouterContextProvider` that no package can
augment. Use `withAlxia` there until react-router ships one declaration.
[More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#property-alxia-does-not-exist-on-type-readonlyroutercontextprovider)

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

[More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/typing-the-loaders.md#typing-the-loaders)

## A CSP nonce

With `secureHeaders({ nonce: true })` from `@alxia/secure-headers` in
`configure`, each request's policy names a fresh nonce, and the context
carries it. `@alxia/react-router/entry` reads it with `nonceOf(loadContext)`, and React
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

The template has no `entry.server.tsx`; the package's own is one line:

```ts
// app/entry.server.tsx
export { handleRequest as default, streamTimeout } from '@alxia/react-router/entry';
```

To customise the entry, reveal React Router's and add the nonce yourself
([an entry of your own](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/csp-nonce.md#an-entry-of-your-own)).

`nonceOf` returns `undefined` when no middleware set a nonce, so the entry works
with or without secure-headers: neither package depends on the other. Any
`derive` that returns a string `nonce` works the same.
[More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/csp-nonce.md#a-csp-nonce)

## The document: nonce and boot scripts

`@alxia/react-router/document` renders the CSP nonce in the root, on the
server and in the browser, with `react` as its only import. The nonce comes
from `secureHeaders({ nonce: true })` ([A CSP nonce](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/csp-nonce.md)).
The server render provides it around the router; `useNonce()` reads it there,
and in the browser reads the one the document's scripts carry, so hydration
finds the attribute it rendered. `InlineScript` is an inline script with
that nonce, for a theme's boot script, which must run before the first
paint:

```tsx
// app/root.tsx
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import {
	CspNonceMeta,
	InlineScript,
	useNonce,
} from '@alxia/react-router/document';
import { themeBootScript } from '<your theme library>';

const THEME_BOOT = themeBootScript();

export function Layout({ children }: { children: React.ReactNode }) {
	const nonce = useNonce();
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<meta charSet="utf-8" />
				<InlineScript code={THEME_BOOT} />
				<CspNonceMeta />
				<Meta />
				<Links nonce={nonce} />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}
```

`THEME_BOOT` is your theme library's own boot script. With `/entry`,
`<Scripts>` and `<ScrollRestoration>` take the nonce from `<ServerRouter nonce>`
and need no prop. `<Links>` does not suppress the hydration warning for its
critical-CSS `<style nonce>` in development, so pass it `useNonce()`, as above;
`useNonce()` also serves `InlineScript`, `CspNonceMeta` and any script or style
the app inserts. An entry of your own
wraps the router:

```tsx
// app/entry.server.tsx (inside handleRequest)
import { nonceOf } from '@alxia/react-router';
import { DocumentNonce } from '@alxia/react-router/document';
import { ServerRouter } from 'react-router';

<DocumentNonce nonce={nonceOf(loadContext)}>
	<ServerRouter context={routerContext} url={request.url} />
</DocumentNonce>;
```

> The `InlineScript` code is written unescaped: keep it a constant of the
> app, never user input. It throws a `TypeError` on `</script` or `<!--`
> ([the message](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#typeerror-inlinescript-the-code-contains-script-or----which-ends-or-confuses-the-script-element-escape-it-such-as-script-inside-a-string)).
> A nonced page must never be made `public` by a route's `headers` export: a
> shared cache would hand the same nonce to every visitor.

### The page's language

`createPageLanguage` gives the root the page's language for `<html lang>` and
a route's `meta`, and `textDirection` the `dir` that goes with it. The server
side, negotiating the request's language from a cookie and `Accept-Language`,
is [`@alxia/language`](https://github.com/softistx/alxia/blob/develop/packages/language/README.md):

```ts
// app/server.ts
import { language } from '@alxia/language';
import { createServer } from '@alxia/react-router';

const server = createServer({
	configure: (app) =>
		app.use(language({ supported: ['en', 'fr', 'ar'], fallback: 'en', order: ['cookie', 'header'] })),
});
export default server;
declare module '@alxia/react-router' {
	interface Register { server: typeof server }
}
```

```ts
// app/language.ts: one instance, imported by the root and the routes
import { createPageLanguage } from '@alxia/react-router/document';

export const { pageLanguage, metaLanguage, chooseLanguage, useChosenLanguage } =
	createPageLanguage({ languages: ['en', 'fr', 'ar'], fallback: 'en' });
```

```tsx
// app/root.tsx
import { type AlxiaArgs, withAlxia } from '@alxia/react-router';
import { textDirection } from '@alxia/react-router/document';
import { useRouteLoaderData } from 'react-router';
import { metaLanguage, pageLanguage, useChosenLanguage } from './language';
import type { Route } from './+types/root';

const titles = { en: 'Home', fr: 'Accueil', ar: 'الرئيسية' };

// the root loader returns alxia.language, set by the middleware
export const loader = withAlxia(({ alxia }: Route.LoaderArgs & AlxiaArgs) => ({ language: alxia.language }));

export function Layout({ children }: { children: React.ReactNode }) {
	const data = useRouteLoaderData<typeof loader>('root');
	const language = pageLanguage(data?.language);
	useChosenLanguage(); // re-renders the shell when the menu picks a language
	return (
		<html lang={language} dir={textDirection(language)} suppressHydrationWarning>
			{/* … */}
		</html>
	);
}

export const meta: Route.MetaFunction = ({ matches }) => [
	{ title: titles[metaLanguage(matches)] },
];
```

- `pageLanguage(language)` is the supported language, else the fallback. In
  the browser the one picked with `chooseLanguage(language)` wins, and the
  last one seen stands in when the root's data is gone. On the server it
  remembers nothing: one module serves every request.
- `metaLanguage(matches)` reads `matches[0].loaderData.language`.
- `useChosenLanguage()` is the picked language, or `undefined`; it
  re-renders on a pick, and is `undefined` in the server render so
  hydration matches.
- `textDirection(tag)` is `'rtl'` for `ar`, `fa`, `he`, `ur`, `ps`, `yi`,
  `dv`, `ckb`, `sd` and `ug` (and the legacy `iw` and `ji`), else `'ltr'`, reading the base tag whatever its
  case (`ar-EG`, `AR`). A script subtag is not read: `az-Arab` is `'ltr'`.
- A fallback outside `languages` throws
  ([the message](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#typeerror-createpagelanguage-the-fallback--is-not-one-of-the-languages-got-)).
  An error page keeps the root's data, so it keeps the language, except
  for a URL that matches no route or a root loader that threw: there it
  shows the last language seen in the browser, or the fallback ([why](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#the-error-page-shows-in-the-fallback-language)).

[More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/document.md)

## The entry

`@alxia/react-router/entry` is `entry.server.tsx` for an app on Bun, server
only: it streams the shell, waits for the whole page for a bot and in SPA
mode, answers HEAD with no body, and gives the router the response's CSP
nonce (`nonceOf`) and `DocumentNonce`. It renders with the web stream
renderer, so no `@react-router/node` and no `node:stream`. `react-dom` and
`isbot` (needed only without an `isBot` option) are optional peers, which React Router's templates install.

```tsx
// app/entry.server.tsx
export { handleRequest as default, streamTimeout } from '@alxia/react-router/entry';
```

To change `streamTimeout`, the nonce, the bot check or the error report,
`createEntry({ streamTimeout, nonce, isBot, onError })` returns
`{ handleRequest, streamTimeout }`.

[More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/document.md#the-entry)

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
edit to the server is used from the next connection. An action's
`alxiaOf(context).server.publish` reaches those sockets too
([The server](#the-server-server)).
[More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/beside-the-pages.md#websockets)

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
client })` itself. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/customising-the-server.md#escape-hatches)

## The client's files

In a build, `build/client` is served before `configure`'s middlewares:

| path | `Cache-Control` |
| --- | --- |
| `/assets/*`, the hashed bundles | `public, max-age=31536000, immutable` |
| every other top-level file or folder, the copies of `public/` | `public, max-age=3600` |

A missing asset gets alxia's JSON 404, not a page. In dev, Vite serves
these files.

`react-router build` also writes `.br` and `.gz` copies beside every
compressible file of the client build (JavaScript, CSS, HTML, SVG, JSON,
text, XML, web manifests, source maps, WebAssembly, icons, fonts) of at least 1 kB, and the server sends the one a
browser accepts, with `Content-Encoding` and `Vary: Accept-Encoding`, the
`Cache-Control` above unchanged. `alxia({ precompress: false })` writes none,
`alxia({ precompress: { minSize: 4096 } })` moves the threshold, and
`createServer({ precompressed: false })` (or `reactRouter(app, {
precompressed: false })`) serves the files as they are, behind a proxy that
compresses. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/beside-the-pages.md#compressed)

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
- `/entry` and `/document` inlined, in dev by an alias and in the build, so
  they share the app's `react-router`, even when the package is listed in
  `ssr.external`.

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
[guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/how-it-works.md#built-for-bun)
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
[guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/deploying.md#docker)
has the commented file, and what to copy for a package left external.

## Installable and offline (PWA)

`@alxia/react-router/pwa` holds what an installable app shares and that has
no UI: the service worker's contract, which requests it caches and which
responses it may store, the precache list read from a build, the
registration and update notice, the web app manifest, and the cleaning at
sign-out. It imports nothing, so the worker, a build script, the page and
the server can all import it. The worker itself is `startWorker` in
`/pwa/worker`, its build `buildWorker` in `/pwa/build`, the hooks are in
`/pwa/react` (`react`, an optional peer) and `noCache` in `/pwa/server`; this
package never reads `import.meta.env`, so the app passes `enabled`.

With `app/service-worker.ts` in the app, `react-router build` writes
`build/client/service-worker.js` itself: `alxia()` bundles the file after the
client build, with the precache list written in, and there is no script to
add. It needs Bun (`bun --bun react-router build`, or a `bunfig.toml` with
`[run] bun = true`). `alxia({ worker: 'app/pwa/worker.ts' })` names another file
and `alxia({ worker: false })` builds none.

The worker bundles Workbox, whose six packages are optional peers:

```sh
bun add -d workbox-core workbox-expiration workbox-navigation-preload workbox-precaching workbox-routing workbox-strategies
```

```ts
// file: app/pwa-contract.ts
// Shared by the worker and the page: every cache is named `my-app-<kind>-<version>`.
import { defineWorkerContract } from '@alxia/react-router/pwa';

export const workerContract = defineWorkerContract({ cachePrefix: 'my-app' });
```

```ts
// file: app/service-worker.ts
import { startWorker } from '@alxia/react-router/pwa/worker';
import { workerContract } from './pwa-contract';

startWorker({ contract: workerContract });
```

```tsx
// file: app/root.tsx
import { manifestHref } from '@alxia/react-router/pwa';
import { useServiceWorker } from '@alxia/react-router/pwa/react';
import { Outlet } from 'react-router';

// The browser reads the manifest to offer the install.
export function links() {
	return [{ rel: 'manifest', href: manifestHref('en') }];
}

// A production build only, never under `react-router dev`.
export default function App() {
	useServiceWorker({ enabled: import.meta.env.PROD });
	return <Outlet />;
}
```

```ts
// file: app/server.ts
import { createServer } from '@alxia/react-router';
import {
	MANIFEST_HEADERS,
	MANIFEST_PATH,
	SERVICE_WORKER_URL,
	webAppManifest,
} from '@alxia/react-router/pwa';
import { noCache } from '@alxia/react-router/pwa/server';

// beforeAll runs before the client's files: the worker's script is
// revalidated. The manifest is a route, served with its own headers.
export default createServer({
	beforeAll: (app) => app.use(SERVICE_WORKER_URL, noCache),
	configure: (app) =>
		app.get(MANIFEST_PATH, ({ reply }) => {
			const manifest = webAppManifest({
				name: 'My app',
				description: 'My installable app',
				lang: 'en',
				themeColor: '#1e40af',
				backgroundColor: '#ffffff',
			});
			return reply(200, JSON.stringify(manifest), { headers: MANIFEST_HEADERS });
		}),
});
```

The manifest names four icons (`MINIMAL_2023_ICONS`): put
`pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png` and
`maskable-icon-512x512.png` in `public/`, which `@vite-pwa/assets-generator`'s
`minimal2023Preset` writes from one image. A browser offers the install with
a 192 and a 512.

The worker serves a page load from `public/offline.html` when the network
fails, and the build needs the file:

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

Set `routeDiscovery: { mode: 'initial' }` in `react-router.config.ts`, so a
client navigation offline to a route never visited finds its modules
([more](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#offline-a-client-navigation-to-a-route-never-visited-shows-the-offline-page)):

```ts
import type { Config } from '@react-router/dev/config';

export default { ssr: true, routeDiscovery: { mode: 'initial' } } satisfies Config;
```

An app that built its worker with a script of its own has steps to drop:
[moving from a build script of your own](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/pwa.md#moving-from-a-build-script-of-your-own).

For a build pipeline of your own, `buildWorker` from `/pwa/build` does what
`alxia()` does. It needs Bun and runs after `react-router build`:

```ts
// file: scripts/build-worker.ts
import { buildWorker } from '@alxia/react-router/pwa/build';

await buildWorker({ file: 'app/service-worker.ts' });
```

The [PWA guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/pwa.md)
has the worker's options, the offline page, the manifest route, the update
banner and the rest.

## An API's refusals, worded for the page

`@alxia/react-router/errors` has no UI; its one runtime import is `react-router`, never `@alxia/core`. It
holds the shape of a GraphQL API's refusal, declared structurally (no `@nxgt/graphql-client` at
runtime), the request id an API echoes, the page a request is for, the
catalogue of the API's messages an app keeps, the words of a form's checks,
the provider that fills the catalogue in the browser, the wording of a refusal, the loaders and actions that answer with it, the JSON actions (CSRF check) with their fetcher hook, and what a failed call to the API becomes (`apiCallFailure`):

```ts
import { isApiErrorLike, nextOf, requestIdOf } from '@alxia/react-router/errors';

export function describe(error: unknown, request: Request) {
	return isApiErrorLike(error)
		? { code: error.code, status: error.status, next: nextOf(request.url) }
		: undefined;
}

export const idOf = (response: Response) => requestIdOf(response);
```

The catalogue is an instance made with the app's ICU formatter. A form's checks
read it through `apiCodeResolver`, and the provider fills it from the root's data:

```ts
import {
	ApiMessagesProvider,
	apiCodeResolver,
	createApiMessages,
} from '@alxia/react-router/errors';

type Language = 'en' | 'fr';

export const apiMessages = createApiMessages<Language>({
	format: (message) => message, // the app's ICU formatter goes here
});

export const resolver = apiCodeResolver(apiMessages, {
	translate: (key) => key,
	language: () => 'en',
});

// In the root: <ApiMessagesProvider messages={apiMessages} value={data.catalogue}>…
export const provider = ApiMessagesProvider({
	messages: apiMessages,
	value: { en: {}, fr: {} },
	children: null,
});
```

A failed call is worded in the page's language by `createApiErrors`:

```ts
import { createApiErrors } from '@alxia/react-router/errors';
import { apiMessages } from './api-messages';

export const apiErrors = createApiErrors<'en' | 'fr'>({
	messages: apiMessages,
	unavailable: (language) => (language === 'en' ? 'Unavailable' : 'Indisponible'),
});

// In an action's catch: { message, status }, or undefined (rethrow it).
export const refusal = (error: unknown) => apiErrors.apiRefusal(error, 'en');
```

A loader throws the API's error as a route error, with the call's request id
for the error page; an action answers a refusal as data:

```ts
import { errorRequestId, routeError } from '@alxia/react-router/errors';
import { apiErrors } from './api-errors';

// In a loader's catch: a 401, 403, 404 or 503 ApiError becomes a route error.
export const thrown = (error: unknown) => routeError(error);

// In the root's ErrorBoundary: the reference the user can quote.
export const reference = (error: unknown) => errorRequestId(error);

// A fetcher's action: { ok: true, …value }, or { ok: false, error } with a status.
export const rename = (run: () => Promise<{ title: string }>) =>
	apiErrors.fetcherResult('en', { intent: 'rename' }, run);

// A form's action: { ok: true, value }, or the form's errors with a status.
export const create = (run: () => Promise<{ id: string }>) =>
	apiErrors.submitForm('en', run, (path) =>
		path === 'todo.title' ? 'title' : undefined,
	);
```

JSON actions refuse a post from another site, and read a Standard Schema's input:

```ts
import { jsonActions, useJsonFetcher } from '@alxia/react-router/errors';
import { z } from 'zod';

// Behind a TLS proxy named with createServer({ proxy }), nothing to set; else: origin: () => process.env.APP_ORIGIN
export const { readInput } = jsonActions();

const schema = z.object({ title: z.string().min(1) });

export async function action({ request }: { request: Request }) {
	return readInput(request, schema); // 400 when the input is refused
}

// In the component: const { post, busy } = useJsonFetcher<typeof action>();
```

A call that failed is turned into what a loader throws, and logged with the API's request id, by `apiCallFailure(error, { api, operation: operationName(document), requestId })`
(your own `execute` calls it in its `catch`):

```ts
import { apiCallFailure, operationName } from '@alxia/react-router/errors';
import type { DocumentNode } from 'graphql';

export function failed(error: unknown, document: DocumentNode, requestId?: string, signal?: AbortSignal) {
	return apiCallFailure(error, { api: 'my-api', operation: operationName(document), requestId, signal });
}
// In execute(): catch (error) { throw failed(error, document, requestId, signal); }
```

The API's catalogue is read and kept fresh by `createErrorCatalogue`; the root's
middleware awaits `freshAll()`, its loader returns `clientMessages()` and
`server.ts` calls `warm()`:

```ts
import { createErrorCatalogue } from '@alxia/react-router/errors';
import { apiMessages } from './api-messages';

export const catalogue = createErrorCatalogue<'en' | 'fr'>({
	messages: apiMessages,
	languages: ['en', 'fr'],
	read: async (language) => fetchCatalogue(language), // { version, messages }
	versions: async () => fetchVersions(), // { en: '…', fr: '…' }
	ttlMs: () => Number(process.env.CATALOGUE_TTL_MS ?? 60_000),
	clientCodes: ['validation.errors.required'],
});

declare function fetchCatalogue(
	language: string,
): Promise<{ version: string; messages: { code: string; message: string; params: { name: string; kind: 'TEXT' }[] }[] }>;
declare function fetchVersions(): Promise<{ en: string; fr: string }>;

// The root's middleware: await catalogue.freshAll();
// The root's loader: return { messages: catalogue.clientMessages() };
// server.ts, at startup: catalogue.warm();
```

The [errors guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/errors.md)
has the rest.

## Sessions for a BFF

An app that renders its pages and calls a GraphQL API that signs users in
with `@nxgt/janus` keeps the API's token in its own HttpOnly cookie.
`@alxia/react-router/session` holds that session's server side, built on
`/errors`; `/session/react` holds the page's hooks around it (`useSignOut`, `useLinkParam`,
`useCodeField`); `/session/model` imports nothing and is safe in a component.
`/session` and `/session/model` add no peer; `/session/react` needs `react`, an optional peer.

```ts
// app/session.server.ts
import { sessionCookies, signInFlow } from '@alxia/react-router/session';
import { errors, json } from './errors.server'; // createApiErrors, jsonActions
import { SignOutMutation, execute } from './api.server';

export const cookies = sessionCookies({
	session: 'my-app_session',
	challenge: 'my-app_challenge',
	secure: !import.meta.env.DEV,
});

export const signIn = signInFlow({
	cookies,
	errors,
	json,
	revoke: (token, request) =>
		execute(SignOutMutation, {}, { token, signal: request.signal }),
	attemptsLeft: (count, language) => `${count} tries left`,
});
```

```ts
// app/routes/sign-in.tsx
export async function action({ context, request }: Route.ActionArgs) {
	const { language } = alxiaOf(context);
	json.requireJsonPost(request); // a form posted before hydration goes back
	const input = await json.readInput(request, SignInInput);
	return signIn.signInStep(
		async () => toAnswer((await execute(SignInMutation, input)).signIn),
		{ request, language, next: signIn.nextParam(request), extra: {} },
	);
}
```

A signed-in answer redirects to `next` (kept on the site by `safeNext`) with
the session cookie set; a second factor goes to the code page; a refusal stays
on the form. `stepUpSteps` asks for a code before a sensitive action, and
`authLinks` serves the pages a mail's link opens. The
[session guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/session.md)
has a complete sign-in route and the rest.

## A GraphQL subscription for the browser

`@alxia/react-router/subscription` exposes subscriptions of your API to the
browser through a resource route, without giving it the token or a way to
write its own document. `allow` maps each operation name to the document the
server sends for it; the client names an operation and sends variables, and
its own `query` and `extensions` are ignored. The bearer comes from the
session, both methods refuse a cross-site request, a heartbeat keeps the
stream open, the browser leaving aborts the upstream request, and an upstream
429 is passed on with its `retryAfter`. It speaks GraphQL over SSE in distinct
connections mode, so `graphql-sse` works against it. It imports nothing and adds no peer.

```ts
// app/routes/events.ts
import { alxiaOf } from '@alxia/react-router';
import {
	createSubscriptionProxy,
	type SubscriptionArgs,
} from '@alxia/react-router/subscription';
import { print } from 'graphql';
import type { RouterContextProvider } from 'react-router';
import { RoomEventsDocument } from '../generated/graphql';
import { cookies } from '../session.server';

const events = createSubscriptionProxy({
	endpoint: 'https://api.example.com/graphql',
	allow: { RoomEvents: print(RoomEventsDocument) },
	getToken: (request) => cookies.token(request),
	// the route's context is the second argument: send the trusted client address
	headers: (
		request,
		{ context }: SubscriptionArgs<Readonly<RouterContextProvider>>,
	) => ({
		'x-forwarded-for': context ? alxiaOf(context).ip : null,
		'accept-language': request.headers.get('accept-language'),
	}),
});

export const loader = events.loader; // GET
export const action = events.action; // POST
```

See the [subscription guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/subscriptions.md)
for the rules, the options and the errors.

## A UI library's links through React Router

A design system that renders its links through a component of its own (a
`LinkComponentProvider`) hands it an `href`, while React Router's `Link` takes
`to`. `@alxia/react-router/link` (`react` and `react-router` are its only
imports) exports the adapter, so no app copies it:

```tsx
// app/root.tsx
import { RouterLink } from '@alxia/react-router/link';

<LinkComponentProvider component={RouterLink}>
	<Outlet />
</LinkComponentProvider>
```

## A fetcher's fresh answer

A keyed fetcher outlives its page, so a `useEffect` on its data replays an
earlier visit's answer on remount. `@alxia/react-router/fetcher` (`react` and
`react-router` are its imports) calls your handler once per new answer:

```tsx
import { useJsonFetcher } from '@alxia/react-router/errors';
import { useFetcherAnswer } from '@alxia/react-router/fetcher';

const { fetcher } = useJsonFetcher<typeof action>('save');
const answer = useFetcherAnswer(fetcher, (result) => toast(result.message));
```

A resource route loaded for what is typed (a typeahead, a preview): one load
after a pause, from a minimum length, the previous answer kept (`stale`) until
the new one lands, and a retry:

```tsx
import { useDebouncedFetcher } from '@alxia/react-router/fetcher';

const { data, stale, state, retry } = useDebouncedFetcher<Found>(
	typed,
	(q) => `/suggest?${new URLSearchParams({ q })}`,
	{ minLength: 2, delayMs: 250 },
);
```

See the [fetcher guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/fetcher.md).

## A list whose state is the URL

`@alxia/react-router/lists` (`react` and `react-router` are its only imports; every hook renders on the server)
holds the three hooks a search, filters and a "load more" button need.

```tsx
// app/routes/users.tsx
import { usePagedRows, useSameRouteLoading, useSearchChange } from '@alxia/react-router/lists';
import type { Route } from './+types/users';

const USERS = Array.from({ length: 45 }, (_, i) => `user ${i + 1}`);

// ?q=<search>&after=<cursor>: 20 rows a page, `next` is null on the last one
export function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const q = url.searchParams.get('q') ?? '';
	const start = Number(url.searchParams.get('after') ?? 0);
	const found = USERS.filter((name) => name.includes(q));
	const rows = found.slice(start, start + 20);
	return { rows, next: start + 20 < found.length ? String(start + 20) : null };
}

export default function Users({ loaderData }: Route.ComponentProps) {
	const change = useSearchChange(); // drops ?after on every change
	const reloading = useSameRouteLoading(); // another search of this page: show the skeleton
	const { rows, next, loading, error, loadMore } = usePagedRows(loaderData, (page) => page.rows);
	return (
		<main>
			<input type="search" placeholder="Search" onChange={(event) => change({ q: event.target.value || null })} />
			{reloading ? (
				<p>Loading…</p>
			) : (
				<ul>
					{rows.map((name) => (
						<li key={name}>{name}</li>
					))}
				</ul>
			)}
			{error ? <p role="alert">The next rows could not be loaded.</p> : null}
			{next ? (
				<button type="button" disabled={loading} onClick={loadMore}>
					{error ? 'Retry' : 'Load more'}
				</button>
			) : null}
		</main>
	);
}
```

The loader answers `?after=<cursor>` with the next page. A loader that throws on a cursor request lands on the route's `ErrorBoundary`; wrap the read in `orFailed(after, run)` to keep the rows and offer a retry instead:

```ts
import { orFailed } from '@alxia/react-router/lists';

export function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	// no ?after: a failure throws (ErrorBoundary); with ?after: it answers { failed: true }
	return orFailed(url.searchParams.get('after'), () => listUsers(url.searchParams));
}
```

`usePagedRows` reads `{ failed: true }` as a page without rows, so it sets `error` and keeps the rows. See [troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md). See the
[lists guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/lists.md).

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
- **Under `react-router dev`, `page()` is not served**, and an HTTP
  request's `ctx.server` is the loopback server the sockets are relayed to:
  its `publish` reaches them, its `url` and `requestIP` are not Vite's. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#a-page-is-not-served-under-react-router-dev)
- **An alxia route whose path covers a page takes it**, wherever it is
  declared: `GET /:slug` answers `/about`. Keep alxia's routes under
  `/api`. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#a-page-answers-alxias-json-404-or-405-instead-of-rendering)

## API

| export | |
| --- | --- |
| `createServer(options?)` | the server of `app/server.ts`. `beforeAll`, `configure`, `getLoadContext`, `proxy` (`alxia({ proxy })`'s, `trustProxy(…)` from `@alxia/core`), `build`, `mode`, `client`, `precompressed`, `listen`, `onListen` |
| `ServerOptions<Before, App>` | its options |
| `ReactRouterServer<App>` | what it returns: `create(wiring)` makes the app, `start(app)` listens |
| `ServerWiring` | what `create` takes: `build`, `mode`, `client` |
| `FreshApp` | the app `beforeAll`, or `configure` without it, receives |
| `alxiaOf<App>(context)` | what alxia's middlewares built, in a loader, an action or a middleware. Typed by the registered server, by the type argument (a server or an app), or as `BaseContext`. Its `server` is the `Bun.Server` serving the request |
| `context.alxia` | the same object, on React Router's `RouterContextProvider` (this package augments its type, as `alxiaOf(context)` with no type argument): typed with `LoaderFunctionArgs` and `ActionFunctionArgs` from `react-router`, not yet with the generated `Route.LoaderArgs`: use `withAlxia` there |
| `withAlxia(fn)` | a loader, an action or a middleware given `alxia`, the alxia context, beside React Router's arguments: annotate `Route.LoaderArgs & AlxiaArgs`. Returns a function of the arguments alone, with `fn`'s return type |
| `AlxiaArgs<App>` | what `withAlxia` adds: `{ alxia }`, typed by `Register`, or by the server it names |
| `AlxiaContextOf<App>` | what `alxiaOf<App>(context)` returns: the app's context and the catch-all's `route` |
| `ProviderLike` | what `alxiaOf` and `nonceOf` take: any React Router context provider's `get`, the generated route types' included |
| `Register` | the interface to augment with `server: typeof server` |
| `RegisteredApp` | the app `alxiaOf` reads with no type argument: the registered server's, else the one `@alxia/core`'s `Register` names, else a fresh app |
| `RegisteredOf<R, Core?>` | the app a `Register`-shaped interface names: its server's, `InvalidRegister`, or with no server `Core`, by default core's `RegisteredBase` |
| `InvalidRegister` | what a `Register` naming neither a server nor an app reads as: every key of the app's own a compile error |
| `AppOf<Server>` | the app a server makes |
| `alxiaContext` | the React Router context key `alxiaOf` and `context.alxia` read, set on every request |
| `nonceOf(context)` | the request's CSP nonce, for `entry.server.tsx`: the context's `nonce` when a middleware set one, such as `secureHeaders({ nonce: true })`, else `undefined` |
| `reactRouter(app, options)` | the catch-all and the client's files, for a server of your own. `build`, `mode`, `getLoadContext`, `client`, `precompressed` |
| `ReactRouterOptions<Ctx>` | its options |
| `isReactRouterRoute(route)` | whether this package declared a route, for `matchesSpec`'s `exclude` |

From `@alxia/react-router/vite`:

| export | |
| --- | --- |
| `alxia(options?)` | the Vite plugin, for `react-router dev`, `react-router build` and `vite preview`, building the server for Bun. `entry` is the server file: `app/server.ts` by default, or the default server when there is none. `worker` is the service worker built after `react-router build`: `app/service-worker.ts` by default when it exists, a file, `AlxiaWorkerOptions`, or `false`. `precompress` writes the `.br` and `.gz` copies of the client build: on by default, `false`, or `PrecompressOptions` (`minSize`) |
| `AlxiaOptions`, `AlxiaWorkerOptions`, `PrecompressOptions` | its options, the worker's (`buildWorker()`'s but `root`, `client` and `file`, which is optional) |

From `@alxia/react-router/pwa`:

| export | |
| --- | --- |
| `defineWorkerContract(options)` | the contract of one app's worker from its `cachePrefix` (required), with `cacheVersion` (`v1`), `serviceWorkerUrl` and `offlineUrl`: its `cacheNames`, `obsoleteCaches(names)` and `clearableCaches(names)`. Throws on an empty prefix or one ending with `-`, and on an empty `cacheVersion` or one with a `-` |
| `WorkerContract`, `WorkerContractOptions`, `CacheNames` | its types |
| `SERVICE_WORKER_URL`, `OFFLINE_URL`, `SKIP_WAITING` | `/service-worker.js`, `/offline.html` and the message that applies an update |
| `cachingFor(request, origin, options?)` | `navigation`, `immutable`, `static` or `none` for a request. `options`: `never(path)`, `immutable(path)` (everything under `/assets/` by default), `serviceWorkerUrl`, `contract` (whose `serviceWorkerUrl` is never cached), `manifestPath` |
| `Caching`, `RequestFacts`, `CachingOptions` | its types |
| `isStorable(response)` | whether a response may be stored: a full, same-origin, `public` 200 of a script, style, font or image, not varying on who asks |
| `parseBrowserManifest(source)` | React Router's browser manifest, read from `build/client/assets/manifest-*.js` |
| `precacheList(manifest)` | the hashed scripts and stylesheets every route needs, as Workbox precache entries |
| `assetPrecache(files, include, base?)` | the entries of the files in `build/client/assets` that a regex of yours matches, such as fonts |
| `BrowserManifest`, `PrecacheEntry` | their types |
| `clearAppCaches(contract)` | deletes the caches the worker filled but the offline page; for sign-out. Does nothing without Cache Storage |
| `registerServiceWorker(container, onWaiting, options?)` | registers the worker (`url`, `scope` options) and calls `onWaiting(worker, apply)` for each new version waiting behind a controller; checks for an update when the tab shows again. `apply` activates the worker and reloads once |
| `watchForUpdates(registration, container, onWaiting)`, `createUpdater(container, reload?)`, `afterLoad(run)` | its parts: offering waiting workers, the one update path of a page, and running once the page has loaded |
| `ApplyUpdate`, `RegisterOptions`, `ServiceWorkerContainerLike` | their types |
| `createUpdateNotice(storage, key?)` | the update notice's store (`offer`, `current`, `subscribe`, as `useSyncExternalStore` takes it): hidden for the session by "Later", kept in `storage()`, which may be missing or throw |
| `UpdateNotice`, `UpdateNoticeStore`, `NoticeStorage` | its types. `NoticeStorage` is any object with `getItem(key)` and `setItem(key, value)` |
| `sessionStore`, `UPDATE_LATER_KEY` | `sessionStorage` or nothing, and the default key, `alxia.update-later` |
| `MANIFEST_PATH`, `MANIFEST_HEADERS` | `/manifest.webmanifest`, and the headers to serve it with: cacheable for an hour, varying on `Accept-Language`, a policy that loads nothing |
| `webAppManifest(options)` | the web app manifest's JSON from the app's `name`, `description`, `lang`, `themeColor`, `backgroundColor` and the optional rest; `id`, `start_url` and `scope` are `/` in every language |
| `WebAppManifest`, `WebAppManifestOptions`, `ManifestIcon` | its types |
| `MINIMAL_2023_ICONS` | the four icons `@vite-pwa/assets-generator`'s `minimal2023Preset` writes |
| `manifestHref(language, path?)` | the manifest's URL for a page: `/manifest.webmanifest?lang=fr` |
| `manifestLanguage(url, supported, fallback)` | `?lang=` when it is one of `supported`, else `fallback` |

From `@alxia/react-router/pwa/react` (`react`, an optional peer, is its only package import):

| export | |
| --- | --- |
| `useOnline()` | whether the browser says it is online; online on the server and while hydrating |
| `useServiceWorker(options)` | registers the worker after `load` when `options.enabled` (required; the app passes `import.meta.env.PROD`), in a browser that has one. `url`, `scope`, `notice` (where a waiting version is offered), `onError` (registering failed; dropped by default) |
| `ServiceWorkerOptions` | its options |
| `useUpdateNotice(notice?)` | the `{ reload, later }` to show while a new version waits and "Later" was not asked, else `undefined`; always `undefined` on the server |
| `updateNotice` | the page's one `UpdateNoticeStore`, which `useServiceWorker` offers and `useUpdateNotice` reads by default |

From `@alxia/react-router/pwa/server` (`@alxia/core` is its only package import):

| export | |
| --- | --- |
| `noCache` | a middleware: the response it wraps gets `Cache-Control: no-cache` and the worker's policy. For `use(SERVICE_WORKER_URL, noCache)` in `beforeAll` |
| `revalidated(response, policy?)` | a response with those two headers set, on a copy when its headers are immutable; `policy` is `WORKER_POLICY` by default |
| `WORKER_POLICY` | `default-src 'none'; connect-src 'self'`: the worker runs no other script and fetches this site only |

From `@alxia/react-router/pwa/worker` (the six `workbox-*` packages, optional peers, are its only package imports):

| export | |
| --- | --- |
| `startWorker(options)` | the worker's strategies: the precache route, `NetworkOnly` for a page load with the precached offline page as its fallback, `CacheFirst` for hashed bundles, `StaleWhileRevalidate` for other static files (both storing only what `isStorable` accepts), the obsolete caches swept on `activate`, and `SKIP_WAITING` applied |
| `WorkerOptions` | `contract` (required), `caching`, `assets`, `static`, `navigationPreload`, `precache` |
| `ExpirationOptions` | `{ maxEntries?, maxAgeSeconds? }` |

From `@alxia/react-router/pwa/build` (Bun; Node's built-ins its only imports):

| export | |
| --- | --- |
| `buildWorker(options)` | bundles the worker into `build/client/service-worker.js` with its precache list (the offline page by its content, every route's code, `precacheAssets`), after `react-router build` |
| `BuildWorkerOptions` | `file` (required), `root`, `client`, `contract`, `offline`, `precacheAssets`, `minify` |
| `WorkerBuild` | `{ file, precache, precacheBytes, bytes }` |

From `@alxia/react-router/errors` (`react-router` is its only package import, and never `@alxia/core`):

| export | |
| --- | --- |
| `isApiErrorLike(error)` | whether `error` is an `@nxgt/graphql-client` `ApiError`, like the client's `isApiError`, plus a numeric `status`, which `ApiErrorLike` promises; it holds across two copies of the client |
| `ApiErrorLike`, `ApiErrorEntryLike`, `ApiErrorExtensionsLike`, `ApiErrorParamsLike`, `ApiFieldErrorLike` | the shape of the refusal: `errors`, `code`, `status`, `requestId?`, and each error's `extensions` (`code`, `params`, `fields`, `field`, `minutes`, `retryAfter`) |
| `waitMinutes(extensions)` | the minutes of a throttle's wait: `minutes` (at least one), else `retryAfter` rounded up |
| `retryAfterOf(error)` | the seconds a 429 asks to wait, for a countdown on your own forms: `retryAfter` of the first error's `params`, else of its `extensions`; a finite number from 0 or a decimal string, rounded up, held at a day (86 400); `undefined` when none is usable |
| `attemptsLeftOf(error)` | the tries a refused code leaves, as `@nxgt/janus` counts them: `extensions.attemptsLeft` of the first error, else `params.attemptsLeft`; `undefined` when it is not a whole number from 0 up |
| `REQUEST_ID_HEADER`, `requestIdOf(response)` | `x-request-id`, and the id a response carries, if the API sent one |
| `nextOf(url)` | the path and search of the page a request is for, without React Router's `.data`, `/_.data`, `_routes` and empty `index`; it never starts with two slashes, but an app still validates `next` before redirecting to it |
| `FormErrors` | what a form action answers when the API refused the input: `fieldErrors` by field and a `formError` (`undefined` when every message sits under a field), already translated; `submitForm` answers it |
| `routeError(error, { statuses? }?)`, `RouteErrorOptions` | what a loader throws for the API's error: an `ApiError` of 401, 403, 404 or 503, or such a `Response` carrying a request id, becomes a route error of that status with the `code`, `message` and `requestId`; any other `ApiError` with an id becomes a 500 carrying the id; anything else is returned as it is |
| `errorRequestId(error)`, `RouteErrorData` | the support reference an error page shows: the `requestId` a route error carries, else `undefined`; `RouteErrorData` is the data `routeError` carries (`code?`, `message?`, `requestId?`) |
| `createApiMessages({ format })`, `ApiMessages`, `ApiMessagesOptions` | the catalogue store of an app, an instance (`set`, `add`, `clear` (for tests), `messageOf`, `format`, `apiMessage(code, values, language)`); `format` is the app's ICU formatter, such as `@nxgt/material`'s `formatMessage` |
| `CatalogueMessage`, `CatalogueMessages`, `ParamKind`, `MessageFormat`, `MessageValues` | one API message with the kind of each argument (`TEXT`, `NUMBER`, `DATE`, `PLURAL`, `SELECT`), a language's messages by code, and the formatter's type |
| `apiCodeResolver(messages, { translate, language, codeOf?, isApiCode? })`, `ApiCodeResolver`, `ApiCodeResolverOptions`, `CodeIssueLike` | the `{ translate, codeOf }` a form's `useCodeResolver(schema, resolver)` takes: a check's API code is worded as the API words it, any other key by the app's translator; `CodeIssueLike` is the issue a custom `codeOf` receives |
| `ApiMessagesProvider({ messages, value, children })`, `ApiMessagesProviderProps` | `messages` is the store and `value` the root loader's data; fills the store in the browser from the root's data before the children render; a server render writes nothing. A function with no JSX, so no React import |
| `createApiErrors({ messages, unavailable, refused?, byCode?, reword?, isApiCode? })`, `ApiErrors`, `ApiErrorsOptions`, `FetcherResultOptions` | what a page says of a refusal, in a language: `apiErrorMessage(error, language)` (the catalogue's text of the code, else the API's message; `refused` replaces it for an error with no API code and `byCode` words given codes, such as a query's limits; `reword(text, error, { code, values, language })` words a family of codes once, on the final text of the catalogue, the API or `byCode`, returning `undefined` to keep it), `fieldErrors(error, language)` by input path, `translateCode(code, fallback, language, values?)`, `unavailableMessage(language)` and `apiRefusal(error, language)`; for an action, `fetcherResult(language, about, run, options?)` (`{ ok: true, …about, …value }`, or `{ ok: false, …about, error }` with the refusal's status; `options` is `FetcherResultOptions`: the `route` options plus `reword(error: ApiErrorLike)`, called for an API's own refusal only: the message of this call, or `undefined` to keep the worded one), `fetcherRefusal(error, language, route?)` (the refusal, or the thrown route error) and `submitForm(language, run, fieldOf, route?)` (`{ ok: true, value }`, or a `FormErrors` with the refusal's status); `route` is the `RouteErrorOptions` of the `routeError` they throw through |
| `apiCallFailure(error, { api, operation?, requestId?, signal?, passedThrough?, log? })`, `CallFailureOptions` | what a failed call to the API becomes, for a loader or an action to throw, logged with the request id: an `ApiError` as it is (with `requestId`), a `Response` of its own status for a 401, 403 or 404 without a GraphQL body, a 503 `Response` with no body for an unreachable, slow, garbled or aborted call (the reason is in the log), any other error as it is; the log lines start with `api`, and a `log` that throws never replaces the outcome. It recognises `@nxgt/graphql-client`'s errors by `name`, not `instanceof` |
| `operationName(document)`, `DocumentLike` | the name of the operation a document holds, for the log (else `query`, `mutation` or `subscription`); a structural `{ definitions }`, so `graphql`'s `DocumentNode` fits |
| `createErrorCatalogue({ messages, languages, read, versions, ttlMs, clientCodes, retryMs?, firstReadWaitMs?, log? })`, `ErrorCatalogue`, `ErrorCatalogueOptions`, `CatalogueReply` | keeps the API's error catalogue in the store: `fresh(language, now?)` and `freshAll(now?)` (a cold language is awaited for `firstReadWaitMs`, 1500 by default, and read once however many requests ask; a held one is served, and its version checked in the background once per `ttlMs`, a number or a getter; only a language whose version moved is read again; a failure is retried after `retryMs`, 5000 by default), `warm()` for startup, `clientMessages()` (the `clientCodes` the browser words itself, by language, for the root's loader), and, for tests, `reset()`, `heldVersion(language)`, `settled()` and the `now` parameters. `read` and `versions` are the app's calls to its API |
| `ApiRefusal` | `{ message, status }`: a failed call as a page says it; what `apiRefusal` returns for an API refusal (its status) or an unreachable API (503), else `undefined` |
| `jsonActions({ origin? })`, `JsonActions`, `JsonActionsOptions` | the JSON helpers of the actions, bound to the app's origin (a string, or a getter read at each request; the request's own by default): `readJson(request)` (403 `Cross-site request refused` for another origin or a cross-site fetch, 415 `Expected a JSON body`, 400 `Malformed JSON body`), `requireJsonPost(request)` (a native post goes back to its page) and `readInput(request, schema)` (the body's `input` through a Standard Schema, async allowed; 400 `The form sent an input the API would refuse`) |
| `useJsonFetcher(key?, action?)`, `JsonBody` | a fetcher that posts JSON: `{ fetcher, post(body, to?), busy }`; `to` is the action of one call |
| `StandardSchemaV1` | the Standard Schema v1 type `readInput` takes, declared in `/errors` (type only, so no `@alxia/core`; `readInput`'s output is inferred from the schema's `~standard.types`); a Zod 4, Valibot or ArkType schema fits |

From `@alxia/react-router/session` (`react-router` and `/errors`' files are its only imports):

| export | |
| --- | --- |
| `sessionCookies({ session, challenge?, secure, challengePath?, challengeSeconds? })`, `SessionCookies`, `SessionCookiesOptions`, `SessionCookiesWithoutChallengeOptions`, `SessionCookiesBase`, `ChallengeCookies`, `NoChallengeCookies`, `CookieSession` | the session and, when `challenge` is given, second-factor challenge cookies (without it the result is `SessionCookies<false>`, with no challenge helper on the type), `HttpOnly; SameSite=Lax`, `__Host-` and `__Secure-` when `secure` (required, never read from the environment): `commit(token, expiresAt)`, `read(request)`, `token(request)`, `destroy()`, `refreshed(session, expiresAt)` (a `Set-Cookie` only when the expiry moved), `commitChallenge`, `challengeOf`, `destroyChallenge` (these three: with a second factor), `signInPageHeaders(deadSession)` and `names` (the cookie names as sent, prefixes included); a cookie written by an app's own code in `<expiry ms>.<token>` is read as it is |
| `serializeCookie(name, value, { maxAge, path?, secure })`, `readCookie(request, name)`, `secondsUntil(expiresAt, now?)`, `SerializeOptions` | the bytes `sessionCookies` writes, for the cookies of your own; a name that is not an RFC 6265 token throws a `TypeError` |
| `signInFlow({ cookies, errors, json, revoke, attemptsLeft?, paths?, clear?, unavailable?, codes?, endedParam? })`, `SignInFlow`, `SignInFlowOptions`, `SignInFlowWithoutSecondFactorOptions`, `SignInFlowBase`, `SecondFactorSteps` | the server side of the sign-in pages; `attemptsLeft` and cookies with a `challenge` go together (giving only one is a compile error, and a `TypeError` at runtime), and without them the flow is `SignInFlow<L, C, false>`, with no `readCodeInput`, `codeStep`, `codeRefusal` or `attemptsLeft`. It also exposes what it was built with (`cookies`, `errors`, `json`, `attemptsLeft`, `unavailable(language)`, `clear()`) and `guard(request)`, the check an app's own POST step runs first: `nextParam`, `signInRedirect`, `landing`, `landReplacing` (revokes the session the browser held), `signInStep` (a same-site JSON post only; an API refusal as the form's message and status, an unreachable API as a 503), `readCodeInput`, `codeStep`, `codeRefusal` (with the tries left) (these four and `attemptsLeft`: with a second factor), `revokeSession`, `signOut` (JSON and same-origin only; it clears the challenge cookie too), `viewer` (`null` for a 401, `undefined` when unknown) and `requireViewer` (throws the sign-in redirect); `revoke(token, request, context)` gets the caller context (`C`, inferred from the annotation of `revoke`'s third parameter) that `signOut`, `revokeSession`, `landReplacing` and `signInStep` take as `context` |
| `SignInAnswer`, `SignInFormError`, `SignInStayed`, `SignInCodes` | what a step answers (`signedIn`, `secondFactor` or `other`), a form step's answer when it stays on the page, and the `codes` option (`invalidCode`, `challengeOver`) |
| `stepUpSteps({ signIn, spent, locked?, wording?, codes?, onSignedOut? })`, `StepUpSteps`, `StepUpStepsOptions`, `StepUpSignIn`, `StepUpCall` | a step-up for a route's action, reading the sign-in's `errors`, `json` and `attemptsLeft` (and `signInRedirect` with `onSignedOut`): `signIn` is a `signInFlow(...)` or a hand-written object with those members (`StepUpSignIn`), no cast, and `onSignedOut: 'sign-in'` without `signInRedirect` throws a `TypeError`, each step taking `{ request, language }` and refusing a post that is not a same-site JSON one: `request(run, { request, language })` answers the challenge and how it is confirmed (a throttled mail or any 429 is `error: 'throttled'` with `retryAfter`), `confirm(run, { request, language, via? })` answers `error: 'invalid'` with the tries left (and `locked: true` for an app or recovery code with none left), `expired` or `failed`; `request` and `confirm` answer `throttled` with `retryAfter` on any 429 (on `confirm` the challenge and its tries stay, `locked: false`); and `isStepUpRequired(error)`; and `route(run, { request, language })`, the whole action of one resource route that any page posts `request-step-up` and `confirm-step-up` to (`run.request()`, `run.confirm({ challenge, code })`; `StepUpRun`); with `onSignedOut: 'sign-in'` it throws the sign-in redirect for a signed-out user (an `ApiError` with `codes.unauthenticated`, default `'UNAUTHENTICATED'`; from `request` also a bare 401 response, from `confirm` never), `next` being a same-site `Referer`'s page, else the route's own path, while a wrong code stays a refusal |
| `StepUpCodes`, `StepUpStayed`, `INVALID_CODE`, `CHALLENGE_OVER`, `MAIL_THROTTLED`, `UNAUTHENTICATED`, `STEP_UP_REQUIRED`, `STEP_UP_OVER` | the `codes` option (`invalidCode`, `challengeOver`, `stepUpRequired`, `mailThrottled`, `unauthenticated`), a step's answer that stays on the page, and janus's default codes, which an app can extend |
| `authLinks({ signIn, codes?, wording?, start?, resetDone?, invalidState? })`, `AuthLinks`, `AuthLinksOptions`, `AuthLinksCodes` | the pages a mail's link opens, over the flow's cookies, errors and json: `linkArgs`, `spendToken(run, { request, language, path, states, fields? })`, `answerOf`, `landByLink` (`context?`), `afterReset(request, { context? })` (clears the session, the challenge and the flow's cookies), `requestLink(run, { request, language })` (a wait, whose `codes.mailThrottled` is one code or a list of them, answers `throttled: true` and `retryAfter` when the API gives the seconds; `wording` words every refusal that is not a field's), `statePath` and `ended` |
| `Spent`, `SpendOptions`, `LinkStayed`, `RequestLinkAnswer` | their types |
| `TOKEN_PAGE_HEADERS` | `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow`, for a page whose URL carries a token |

From `@alxia/react-router/session/react` (`react` and `react-router` are its only imports; every hook renders on the server):

| export | |
| --- | --- |
| `useSignOut({ action?, before? })` | `{ signOut, busy }`: posts `{}` as JSON to `action` (default `/sign-out`) after `before()`, whose failure never keeps the user signed in; `busy` until the navigation ends |
| `SIGN_OUT_PATH`, `SignOutOptions`, `signOutAfter(before, submit)` | `/sign-out`, the options, and the step `useSignOut` is built on |
| `useLinkParam(name, { drop?, live? }?)`, `LinkParamOptions` | a mail link's query parameter, read once (`null` when absent or empty); `drop: true` removes it from the address bar with `history.replaceState`; `live: true` follows the URL, for a parameter a redirect adds to the same mounted route |
| `useCodeField(schema, refusal)`, `CodeField`, `CodeSchema` | a one-code field with no form library: `{ code, setCode, ref, error, check() }` over a synchronous Standard Schema; each new `refusal` object clears the refused code and focuses the input |
| `useStepUpReplay({ answer, replay, request, confirm, action?, spendsCode? })`, `StepUpReplayOptions` | a refusal carrying `stepUp` opens the step-up; `request` and `confirm` are your own typed `post`s (a `StepUpChannel`: `post`, settled `answer`, `busy`, `reset?`); once the code is accepted `replay()` sends the refused action again, except an action that `spendsCode` after a second-factor step-up (then `confirmedNotice` is true until `action` changes to a new value, i.e. a new action is posted, or `cancel()`). A `replay()` that posts nothing leaves the dialog confirming: call `cancel()`. A cancel forgets late answers. Returns `{ open, dialogProps, cancel, confirmedNotice, stepUp }` |
| `useStepUp({ request, confirm, onConfirmed })`, `StepUpOptions`, `StepUpChannel` | the step-up under it: `{ phase, via, props, message, busy, start(), submit(code), release() }` |
| `asksStepUp(answer)`, `stepUpDialogPhase(state)`, `StepUpDialogPhase` | whether an answer asks for a step-up, and the dialog's phase (`'asking' \| 'failed' \| 'code' \| 'expired' \| 'confirmed'`) |
| `requestAnswerOf(data)`, `confirmAnswerOf(data)` | narrow the data of `route()`'s union to one intent's answer, to type each channel |
| `dialogPropsOf(stepUp, open, cancel)`, `StepUpDialogProps` | the props a step-up dialog is given: `open`, `phase`, `via` (kept in every phase once a challenge was granted), `props`, `message`, `busy`, `confirming` and the handlers |
| `useOnRefusal(refusal, handler)` | the core under it, for any form library: `handler` runs once per new refusal, not for one present at mount |

```tsx
import { useLinkParam, useSignOut } from '@alxia/react-router/session/react';

const token = useLinkParam('token', { drop: true });
const linked = useLinkParam('state', { live: true }); // follows a redirect to this same route
const { signOut, busy } = useSignOut();
```

From `@alxia/react-router/session/model` (no import at all):

| export | |
| --- | --- |
| `safeNext(value)`, `HOME` | `value` when it is a path of this site (search and hash kept), else `/` (`HOME`): a `//`, a scheme, a backslash, a control character, more than 2000 characters or a dot segment that leaves the site |
| `signInPath(next, { query?, path? }?)` (`path` must be a path of this site with no query or fragment, a `TypeError` otherwise), `secondFactorPath(next)`, `SIGN_IN_PATHS`, `SignInPaths` | the sign-in page's URL coming back to `next`, the second-factor page's, and the default paths `/sign-in` and `/sign-in/second-factor` |
| `TOTP_CODE` | the regular expression of an authenticator app's code: six digits |
| `SecondFactorKind`, `SignInStatus`, `StepUpVia` | `'code' \| 'recovery'`, `'signedIn' \| 'secondFactor'` and `'email' \| 'secondFactor'` |
| `stepUpReducer`, `INITIAL_STEP_UP`, `StepUpState`, `StepUpAction`, `StepUpPhase` | the step-up's state on the page, with no React: `phase`, `via`, `challenge`, `attemptsLeft`, `locked`, `error`, `message` (the last refusal worded), `retryAfter`, `pending`, `resent` |
| `stepUpProps(state)`, `StepUpProps` | what a code form shows (`via`, `attemptsLeft`, `locked`, `error`, `retryAfter`, `pending`, `resent`; never the challenge or the message), for a step-up dialog's props |
| `StepUpRequestAnswer`, `StepUpConfirmAnswer`, `StepUpError` | what `stepUpSteps` answers, which the reducer takes as it is (a throttle carries `retryAfter`); `StepUpError` is `'invalid' \| 'expired' \| 'failed' \| 'throttled'` |

From `@alxia/react-router/document`:

| export | |
| --- | --- |
| `DocumentNonce({ nonce, children })`, `DocumentNonceProps` | the provider of this response's CSP nonce, for the server render: wrap the router with `nonceOf(loadContext)` in `entry.server.tsx` |
| `useNonce()` | the page's CSP nonce: the provider's on the server, the first script or `csp-nonce` meta of the `<head>`'s (else the first `script[nonce]`'s) in the browser (read once and cached), `undefined` when there is none |
| `InlineScript({ code, nonce? })`, `InlineScriptProps` | an inline `<script>` with `nonce ?? useNonce()`; the code is not escaped, so it is a constant of yours, and `</script` or `<!--` in it throws a `TypeError`; no `nonce` attribute when there is no nonce |
| `CspNonceMeta()` | `<meta property="csp-nonce" nonce>`, the nonce for what a UI library adds at runtime |
| `createPageLanguage({ languages, fallback, browser? })` | `PageLanguage`: `pageLanguage`, `metaLanguage`, `chooseLanguage`, `useChosenLanguage`, for `<html lang>`, a route's `meta` and a language menu |
| `PageLanguage`, `PageLanguageOptions` | the types of the instance and of its options |
| `textDirection(language)` | `'ltr'` or `'rtl'` for `<html dir>`, from the base language |

From `@alxia/react-router/entry`:

| export | |
| --- | --- |
| `createEntry({ streamTimeout?, nonce?, isBot?, onError? })`, `EntryOptions`, `Entry` | `/entry`: `{ handleRequest, streamTimeout }` (`Entry`), `entry.server.tsx` for Bun on the web stream renderer |
| `handleRequest`, `streamTimeout`, `HandleRequest` | `/entry`: the default entry (`createEntry()`), its `5_000` and the type of `handleRequest` (assignable to React Router's `ServerEntryModule['default']`) |

From `@alxia/react-router/lists` (`react` and `react-router` are its only imports; every hook renders on the server):

| export | |
| --- | --- |
| `useSearchChange({ resetKeys? })`, `SearchChange`, `SearchChangeOptions` | `(changes: SearchChange) => void`: a record sets a parameter given a string, deletes one given `null` or `undefined`, and deletes `resetKeys` (default `['after']`); a `URLSearchParams` replaces the whole search, and an updater `(prev) => URLSearchParams` computes it (`resetKeys` does not apply to these two); the history entry is replaced and the scroll position kept |
| `useSameRouteLoading()` | `true` while a navigation is loading and its pathname is the current one (another search of the list), `false` for any other page |
| `usePagedRows(firstPage, rowsOf, { cursorParam?, nextOf? }?)`, `PagedRows`, `PagedRowsOptions` | `{ rows, next, loading, error, loadMore }`: appends the pages the same route answers to `?<cursorParam>=<next>` (default `after`, `nextOf` default `page.next`) through `useFetcher`; starts over when `firstPage` is another object; a failure keeps the rows and sets `error` (an answer that is not a page), and data that is not a page is ignored |
| `orFailed(after, run)`, `FAILED`, `isFailedPage(value)`, `FailedPage` | the loader half of `usePagedRows`: `run()`'s answer; an error is rethrown when `after` is empty, and with an `after` it answers `FAILED` (`{ failed: true }`, typed `Promise<T \| FailedPage>`), except a 3xx `Response`, which is rethrown. `isFailedPage` narrows an answer |

From `@alxia/react-router/link` (`react` and `react-router` are its only imports; it renders on the server):

| export | |
| --- | --- |
| `RouterLink`, `RouterLinkProps` | React Router's `Link` as a UI library's link component: takes `href` (or `to`), spreads `className`, `children`, `ref` and every anchor prop onto the `<a>`, keeps `Link`'s own props (`replace`, `prefetch`, `reloadDocument`, ...) |

From `@alxia/react-router/fetcher` (`react` and `react-router` are its imports; it renders on the server):

| export | |
| --- | --- |
| `useFetcherAnswer(fetcher, onAnswer?)`, `AnswerSource` | `onAnswer(answer)` once per answer that arrives while the fetcher is idle and differs from the last one seen (the data present at mount counts as seen); the handler is read from a ref; returns the latest answer handed over, `undefined` before the first |
| `useDebouncedFetcher(value, to, { delayMs?, minLength?, enabled?, key?, keep? }?)`, `DebouncedFetcher`, `DebouncedFetcherOptions`, `DebouncedFetcherState` | a resource route loaded for what is typed: one `fetcher.load` after `delayMs` (250) without a change and from `minLength` (1) trimmed characters; `to` is a URL or `(value) => url`; returns `{ data, stale, state, retry }`: `data` is the answer for the value as it stands, else the previous one with `stale` set; `state` is `'idle' \| 'waiting' \| 'loading' \| 'done'`; `keep(answer)` filters what may stay as the stale answer; `retry()` (stable) asks again at once |

From `@alxia/react-router/subscription` (no import, no peer):

| export | |
| --- | --- |
| `createSubscriptionProxy({ endpoint, allow, getToken, headers?, origin?, heartbeatMs?, fetch? })`, `SubscriptionProxy`, `SubscriptionProxyOptions`, `SubscriptionArgs` | a resource route's `loader` (GET) and `action` (POST) relaying GraphQL subscriptions over SSE (graphql-sse's distinct connections mode). `allow` is `{ [operationName]: document }`: the proxy sends its own document, the client's `query` and `extensions` are ignored and an unknown name is a 403. Both methods refuse a cross-site request (403) and a POST that is not JSON (415); 401 without a token; 400 for a malformed or oversize request (body 64 KiB, query string and variables 16 KiB); the bearer and `headers` upstream (`headers(request, { request, context, params })`: a function gets the route's context, which never leaves it), a heartbeat comment every `heartbeatMs` (15000), the upstream aborted with the client, a pulled relay with a 1 MiB cap per event, an upstream 429 passed on with `Retry-After` and `retryAfter`, 502 for an upstream failure |

The `alxia-react-router` bin, run with `bunx`:

| command | |
| --- | --- |
| `reveal [--force]` | writes the default server to `app/server.ts`, or to `alxia({ entry })`'s file; refuses an existing file without `--force` |

## Documentation

- [Documentation index](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/README.md): every page, and when to read it.
- [Getting started](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/getting-started.md): a new app, the official template or an existing app.
- [How it works](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/how-it-works.md): dev, the build and `vite preview`, and what the build sets for Bun.
- [Customising the server](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/customising-the-server.md): `createServer()`, and the escape hatches.
- [The document](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/document.md): the CSP nonce in the root, `InlineScript` for a theme's boot script with no flash, `CspNonceMeta`, and the entry.
- [Typing the loaders](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/typing-the-loaders.md): `Register`, and the app's own context keys.
- [A CSP nonce](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/csp-nonce.md), [Beside the pages](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/beside-the-pages.md) (middlewares, routes, WebSockets, the client's files), [OpenAPI](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/openapi.md), [Testing](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/testing.md) and [Deploying](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/deploying.md), with Docker.
- [Installable and offline](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/pwa.md): what the subpaths hold, the worker's contract, the worker, what it caches, the offline page, building the worker with `alxia()` or `buildWorker`, the hooks in React, registering the worker and offering an update, serving the worker's script, the web app manifest, and clearing at sign-out.
- [An API's refusals](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/errors.md): what `/errors` holds, recognising an API error, the request id, the page a request is for, the catalogue store, the form checks in the API's words, the provider, wording a refusal, loaders and the error page, actions, JSON actions and CSRF, and keeping the catalogue fresh.
- [A BFF session](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/session.md): redirects that stay on the site, the cookies, the sign-in route, the second factor, the viewer and sign-out, the step-up, and the pages a mail's link opens.
- [A fetcher's fresh answer](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/fetcher.md): `useFetcherAnswer`: a handler called once per new answer of a keyed fetcher, not for the data it held at mount; `useDebouncedFetcher`: a resource route loaded for what is typed.
- [Lists whose state is the URL](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/lists.md): `useSearchChange`, `useSameRouteLoading`, `usePagedRows`: a search that drops the cursor, a skeleton for the same page reloading, a load-more button.
- [Subscriptions for a BFF](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide/subscriptions.md): exposing a GraphQL subscription to the browser through a resource route: the allow-list, the session's bearer, the headers, the heartbeat, abort and rate limits.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md): each message, and the traps that print none.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/roadmap.md): what is coming, and what is not planned.
- [Example](https://github.com/softistx/alxia/tree/develop/examples/react-router): the official template, these four changes, then an `app/server.ts` with a session, an `/api`, secure headers with a nonce and a streamed page.
- [Recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md): [Deploy with Docker](https://github.com/softistx/alxia/blob/develop/docs/recipes/deploying.md), [Health checks and graceful shutdown](https://github.com/softistx/alxia/blob/develop/docs/recipes/health-and-shutdown.md).
