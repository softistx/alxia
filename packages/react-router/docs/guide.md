# Guide

`@alxia/react-router` serves a React Router **framework-mode** app with
server rendering from an alxia app, under Bun. This page walks an app
author through it: the setup, the server entry, loaders reading alxia's
context, the hooks around the pages, the client's files, OpenAPI, and
testing.

- [Setup](#setup)
- [The server entry](#the-server-entry)
- [The build option](#the-build-option)
- [Loaders reading the context](#loaders-reading-the-context)
- [The app's own context keys](#the-apps-own-context-keys)
- [Hooks around the pages](#hooks-around-the-pages)
- [Routes beside the pages](#routes-beside-the-pages)
- [The client's files](#the-clients-files)
- [OpenAPI](#openapi)
- [Testing](#testing)

## Setup

Start from any React Router 8 framework app with `ssr: true`, the default:

```ts
// react-router.config.ts
import type { Config } from '@react-router/dev/config';

export default { ssr: true } satisfies Config;
```

Add alxia and this package beside it:

```sh
bun add @alxia/react-router @alxia/core react-router
```

React Router 8 is required: its loaders receive a `RouterContextProvider`,
which is what alxia's context is set on. `@react-router/dev`, Vite, React
and `isbot` stay the app's own dependencies.

The build runs under Bun, with or without Node installed:

```sh
bunx --bun react-router build   # build/client and build/server/index.js
```

React Router's default `entry.server` streams under Bun. Write your own
only if you want `renderToReadableStream`, the web-stream renderer:

```tsx
// app/entry.server.tsx
import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { type EntryContext, ServerRouter } from 'react-router';

export const streamTimeout = 5_000;

export default async function handleRequest(
	request: Request,
	status: number,
	headers: Headers,
	routerContext: EntryContext,
) {
	const body = await renderToReadableStream(
		<ServerRouter context={routerContext} url={request.url} />,
		{ signal: AbortSignal.timeout(streamTimeout + 1_000), onError: console.error },
	);
	const agent = request.headers.get('user-agent');
	if ((agent !== null && isbot(agent)) || routerContext.isSpaMode) await body.allReady;
	headers.set('Content-Type', 'text/html');
	return new Response(body, { headers, status });
}
```

## The server entry

The server is a file of the app's, outside `app/`, that builds the alxia
app and hands it React Router's server build:

```ts
// server.ts
import { alxia } from '@alxia/core';
import { compress } from '@alxia/compress';
import { logger } from '@alxia/logger';
import { reactRouter } from '@alxia/react-router';
import type { ServerBuild } from 'react-router';

export const base = alxia()
	.use(logger())
	.use(compress())
	.get('/api/health', ({ reply }) => reply.ok({ ok: true }))
	.derive(({ cookies }) => {
		const name = cookies.get('user');
		return { user: name === null ? null : { name } };
	});

/** What the loaders read: the app before the catch-all. */
export type Base = typeof base;

const app = base.use((app) =>
	reactRouter(app, {
		build: () => import('./build/server/index.js') as Promise<ServerBuild>,
		client: 'build/client',
	}),
);

app.listen({ port: Number(process.env.PORT ?? 3000), hostname: process.env.HOST ?? '0.0.0.0' });
```

```jsonc
// package.json
"scripts": {
	"build": "bunx --bun react-router build",
	"start": "bun server.ts"
}
```

`reactRouter(app, options)` goes through `use`, as `@alxia/graphql`'s
`graphql(app, …)` does: that is how it knows the app's context type. It
declares the catch-all, `GET`, `POST`, `PUT`, `PATCH` and `DELETE` at `/*`,
behind every hook declared before it, and the client's files when `client`
is given. It returns the same app: declare nothing after it that the pages
should see.

What React Router answers comes back as it sent it: documents, single-fetch
data (`/_.data`, `/login.data`), lazy route discovery (`/__manifest`),
redirects with every `Set-Cookie` they carry, and the error pages, a 404 or
a 500 rendered by the app's `ErrorBoundary`.

A `HEAD` is handed to React Router as a `GET`: React Router answers a
`HEAD` of its own with the status and no headers at all, not even
`Content-Type`. The core then drops the body, so a `HEAD` carries the
headers the `GET` would.

The catch-all adds nothing to the app's route table: `RoutesOf<typeof app>`
and the typed client never show `/*`. Pages and single-fetch data are not
something a typed client calls; what it does call, your `/api`, is typed as
always.

## The build option

| `build` | when |
| --- | --- |
| a `ServerBuild`, `import * as build from './build/server/index.js'` | the module is loaded once, at startup |
| a function returning one, `() => import('./build/server/index.js')` | loaded on the first request in `production`, and again after a failed load; on **every** request in `development` |

`mode` is React Router's server mode, `production` by default. Pass
`development` only where something rebuilds the server build while the
process runs — a dev server — since each request then asks the function
for the build again, and React Router sends its errors' stacks.

## Loaders reading the context

Every request through the catch-all sets `alxiaContext`, this package's
key, on React Router's context provider, to what alxia's hooks built for
that request. `alxiaOf<App>(context)` reads it, typed:

```ts
// app/routes/account.tsx
import { alxiaOf } from '@alxia/react-router';
import { data, redirect } from 'react-router';
import type { Base } from '../../server';
import type { Route } from './+types/account';

export function loader({ context }: Route.LoaderArgs) {
	const { user, log, requestId } = alxiaOf<Base>(context);
	if (user === null) throw redirect('/login');
	log.info('account');
	return { name: user.name, requestId };
}

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = alxiaOf<Base>(context);
	const form = await request.formData();
	if (user === null) return data({ error: 'signed out' }, { status: 401 });
	return { saved: form.get('name'), by: user.name };
}
```

The type argument is the app **before** the catch-all, `Base`, exported
beside the server. Import it with `import type`: nothing is bundled, and
the route never imports the server at runtime. The checks it gives:

```ts
const ctx = alxiaOf<Base>(context);
ctx.tenant;              // error: no hook derives `tenant`
ctx.user.name;           // error: `user` may be null
alxiaOf<{ user: string }>(context); // error: the type argument must be an alxia app
```

There is no global `Register` augmentation to spare the type argument: a
process may hold more than one app, and a module cannot know which one
serves it.

Outside the catch-all — under `react-router dev` alone, or a unit test that
calls a loader with a bare provider — there is no alxia context, and
`alxiaOf` throws, saying so.

## The app's own context keys

React Router 8 passes data to loaders through keys made by
`createContext<T>()`, and matches a key by object identity. A key exported
from a file in `app/` is **copied into React Router's server build**:

```ts
// app/context.ts
import { createContext } from 'react-router';
export const userContext = createContext<{ name: string } | null>(null);
```

A `server.ts` that imports `app/context.ts` itself holds a different
object, so a `context.set(userContext, user)` there is never seen: the
loader reads the key's default, or fails with `Error: No value found for
context` when it has none. Read alxia's context through `alxiaOf` instead,
whose key lives in this package and is one object whichever way the server
was built. See [the troubleshooting entry](troubleshooting.md#error-no-value-found-for-context).

`getLoadContext(ctx, context)` is for keys that do reach the build — one
exported by a package installed under `node_modules`, which Vite leaves
external — and runs before React Router, on every request:

```ts
import { sessionContext } from '@acme/session'; // a package: one object for the build and the server

base.use((app) =>
	reactRouter(app, {
		build,
		getLoadContext: ({ user }, context) => context.set(sessionContext, user),
	}),
);
```

`ctx` is the app's context at the point of `use`: reading something no
hook before it derives, or one derived after the catch-all, is a compile
error.

## Hooks around the pages

Every hook declared before `reactRouter()` runs around each page, as
around any route:

- **`@alxia/logger`** writes one entry per request and sets `x-request-id`.
  It times a streamed page by its first byte: `onResponse` runs when the
  headers leave.
- **`@alxia/compress`** compresses documents and data. Check that a page
  streamed behind `<Await>` still sends its shell first with compression
  on: a compressor that holds the stream until it ends sends it in one
  piece. See [the troubleshooting entry](troubleshooting.md#a-streamed-page-arrives-in-one-piece).
- **`@alxia/secure-headers`**' default policy, `default-src 'none'`, blocks
  every script of the page, React Router's inline ones included, and its
  `form-action 'none'` blocks a `<Form>`'s post. Give the pages a policy of
  their own: see [the troubleshooting entry](troubleshooting.md#refused-to-execute-inline-script-because-it-violates-the-following-content-security-policy-directive-default-src-none).
- **A guard** — `@alxia/jwt`'s `bearer`, `@alxia/janus`' session — before
  the catch-all guards every page and its data alike.

## Routes beside the pages

Declare alxia's own routes **before** `reactRouter()`:

```ts
const app = alxia()
	.get('/api/health', ({ reply }) => reply.ok({ ok: true }))
	.post('/api/orders', { body: Order }, ({ body, reply }) => reply.ok(save(body)))
	.use((app) => reactRouter(app, { build, client: 'build/client' }));
```

They answer first, with their own schemas, replies and typed client. A
route declared after the catch-all is reached through `listen`, whose
router prefers the longer path, but `app.fetch` and `app.request`, which
tests and dev servers use, rank by declaration, so React Router answers it
there. Keep them before it.

alxia's WebSocket routes, `page()` and `ctx.server` work under `listen`, as
in any alxia app.

## The client's files

`client` is the folder `react-router build` wrote, `build/client`, as a
path or a `file:` URL. It is read at startup, and each top-level entry
becomes a route before the catch-all:

| entry | route | `Cache-Control` |
| --- | --- | --- |
| `assets/`, the hashed bundles | `static('/assets', …)` | `public, max-age=31536000, immutable` |
| another folder, such as `images/` from `public/images/` | `static('/images', …)` | `public, max-age=3600` |
| a file, such as `robots.txt` or `favicon.ico` | `file('/robots.txt', …)` | `public, max-age=3600` |

They are the core's `static` and `file` routes: ETags, `Last-Modified`,
304s and ranges included. A missing file under one of those folders is
alxia's JSON 404, `{ "error": "not_found" }`, not a page, so a folder of
`public/` shadows any page path under the same name. Dotfiles are skipped.
A path that is not a directory is refused at startup:

```text
TypeError: reactRouter(): client is build/clinet, which is not a directory. Pass the client build, build/client by default.
```

In `development` the option is ignored: the dev server serves them.

To serve them with other headers, leave `client` out and declare them
yourself before the catch-all:

```ts
alxia()
	.static('/assets', 'build/client/assets', { cacheControl: 'public, max-age=31536000, immutable', precompressed: ['br'] })
	.file('/robots.txt', 'build/client/robots.txt')
	.use((app) => reactRouter(app, { build }));
```

## OpenAPI

`@alxia/openapi` documents every route of `app.routes`, and the catch-all
and the client's files are routes. Leave them out with
`isReactRouterRoute`, which is true for each route `reactRouter()`
declared:

```ts
import { docs } from '@alxia/openapi';
import { isReactRouterRoute } from '@alxia/react-router';

app.use(docs(app, { info: { title: 'Shop', version: '1.0.0' }, exclude: isReactRouterRoute }));
```

Combine it with your own: `exclude: (route) => isReactRouterRoute(route) ||
route.path === '/api/health'`.

## Testing

`app.request` drives the pages in process, after a `react-router build`.
Keep the app before the catch-all in a module of its own, `base.ts`, so a
test imports it without starting the server:

```ts
import { expect, test } from 'bun:test';
import { reactRouter } from '@alxia/react-router';
import type { ServerBuild } from 'react-router';
import { base } from './base';

const BROWSER = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const build = (await import('./build/server/index.js')) as ServerBuild;
const app = base.use((app) => reactRouter(app, { build }));

test('the account page needs a user', async () => {
	const response = await app.request('/account', { headers: { 'user-agent': BROWSER }, redirect: 'manual' });
	expect(response.status).toBe(302);
});
```

Send a browser's user agent. `isbot('Bun/1.4.2')` is true, and React
Router's entry waits for the whole page before it answers a bot, so a test
with Bun's own user agent never sees a page stream. An index route's action
is `POST /?index`, not `POST /`.
