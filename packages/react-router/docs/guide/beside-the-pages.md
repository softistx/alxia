# Beside the pages

This page covers what runs around and beside the pages: the middlewares
before the catch-all, routes of the app's own, WebSockets in dev, in preview
and in the build, and the client's files.

## Middlewares around the pages

Every middleware declared before the catch-all runs around each page, as around
any route, and `use` observers go first so they wrap everything:

- **`@alxia/logger`** writes one entry per request and sets
  `x-request-id`. It times a streamed page by its first byte, since
  the response is settled when its headers leave. Every request is logged,
  404s and errors included.
- **`@alxia/compress`** compresses documents and data, and flushes a
  streamed page as React writes it: the shell and its `<Suspense>`
  fallback still arrive first, in zstd, Brotli or gzip. See [the troubleshooting entry](../troubleshooting.md#a-streamed-page-arrives-in-one-piece).
- **`@alxia/secure-headers`**' default policy, `default-src 'none'`, blocks
  every script of the page, React Router's inline ones included, and its
  `form-action 'none'` blocks a `<Form>`'s post. Give the pages a policy of
  their own: see [the troubleshooting entry](../troubleshooting.md#refused-to-execute-inline-script-because-it-violates-the-following-content-security-policy-directive-default-src-none).
  With `nonce: true`, the scripts need no `'unsafe-inline'`:
  [A CSP nonce](csp-nonce.md#a-csp-nonce).
- **A guard** — `@alxia/jwt`'s `bearer`, `@alxia/janus`' session — in
  `configure` guards every page and its data alike; in `beforeAll`, the
  client's files too. On the app, a guard also answers a request no route
  matches with its 401.

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

Each answers with its own middlewares and replies. The core ranks
paths as `Bun.serve` does, through `listen`, `app.fetch` and
`app.request` alike: segment by segment, a literal beats a parameter,
which beats the catch-all's wildcard. Two consequences:

- **The path is chosen before the method.** With only `POST /api/orders`,
  a `GET /api/orders` is alxia's 405, not a page.
- **A route whose path covers pages takes them.** `GET /:slug` answers
  every one-segment path, `/about` included, before React Router sees it.
  Put alxia's routes under a prefix of their own, `/api`.

Pages and single-fetch data are not something a generated client calls:
leave the catch-all out of `matchesSpec`'s check with `isReactRouterRoute`
([OpenAPI](openapi.md#openapi)); what a client does call, your `/api`, is what the
OpenAPI document declares.

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

The upgrade runs the middlewares declared before the route, and the route's
validation, as any request does. A middleware's reply refuses it: the client
gets the 401 and its body, and no socket opens. `socket.data` holds the
validated request and what each middleware derived, typed. See
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
own, started on the first upgrade or the first request and given
`app.fetch` and `app.websocket`, as `listen` gives them. So in dev:

- **The same middlewares, refusals and handlers run** as from the build:
  `open`, `message`, `close`, `drain`, the `message` and `send` schemas,
  `subscribe` and `publish`.
- **An edit to `app/server.ts`, or to a module it imports, is used from
  the next connection.** The edit makes a new app, and the next upgrade
  starts a new `Bun.serve` for it. A socket opened before the edit keeps
  the handlers it opened with until it closes.
- **A `publish` reaches the sockets opened since the same edit**: the
  sockets opened before it are on the previous server. Reload the pages
  after an edit to reconnect them.
- **A loader's or an action's `alxiaOf(context).server` is that loopback
  server**, the one the sockets are on, so its `publish` reaches them as
  from the build: see [The server](typing-the-loaders.md#the-server-server).
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
  [A server of your own](customising-the-server.md#a-server-of-your-own-without-the-plugin).

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
[the troubleshooting entries](../troubleshooting.md#typeerror-reactrouter-client-is--which-is-not-a-directory-).

### Compressed

`react-router build` writes a `.br` and a `.gz` copy beside each
compressible file of `build/client` (JavaScript, CSS, HTML, SVG, JSON,
text, XML, WebAssembly, source maps, fonts) of at least 1 kB, and the
server sends the copy a browser's `Accept-Encoding` asks for, with
`Content-Encoding`, `Vary: Accept-Encoding` and the same `Cache-Control`.
The files are read from disk as they are, never compressed on a request.
Files at the top of `build/client`, such as a large `sprite.svg`, get it
too. A file with no copy, or a client that accepts none, gets the file.

```ts
// vite.config.ts: the threshold, or no copies at all
alxia({ precompress: { minSize: 4096 } });
alxia({ precompress: false });
```

```ts
// app/server.ts: serve the files as they are, such as behind a proxy that compresses
export default createServer({ precompressed: false });
```
