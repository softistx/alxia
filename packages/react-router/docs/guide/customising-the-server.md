# Customising the server

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
Next: uncomment configure in app/server.ts to add the app's middlewares and /api; bun run dev picks it up.
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
(`bun add @alxia/logger @alxia/compress`); any middleware works the same way.

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
| `configure(app)` | the app the pages run behind: its middlewares and `/api`. It returns the app, and what it builds is what the loaders read |
| `beforeAll(app)` | runs first, on a new app. What it declares applies to the client's files too: a rate limit, a guard on everything, a logger that should see every asset. It returns the app, which `configure` then receives |
| `getLoadContext(ctx, context)` | sets the app's own keys on React Router's provider, `ctx` typed by `configure`'s app |
| `build`, `mode`, `client` | override what the plugin wires; see [Escape hatches](#escape-hatches) |
| `listen` | `listen`'s options for `bun build/server/index.js`: `port`, `hostname`, `idleTimeout`, `maxRequestBodySize`, `tls`, `onListen`. A `port` or `hostname` given here wins over `PORT` and `HOST`; an `onListen` here, told `@alxia/core`'s `ListenInfo` — `url`, `routes`, `table`, `dev` — wins over the option below |
| `onListen(server)` | called once the built server listens and its `SIGINT` and `SIGTERM` handlers are in place, in place of the `alxia listening on …` line (and, in dev, of the route table); a signal sent from then on runs the `onStop` hooks |

A request goes through four layers, in order:

1. what `beforeAll` declared;
2. the client's files, `build/client`, in a build;
3. what `configure` declared;
4. the pages: `GET`, `POST`, `PUT`, `PATCH` and `DELETE` at `/*`.

A middleware given to `use` runs on every route declared after it, and on a
request no route matches. So a session or a guard in `configure` runs around
every page and its data, and not around what is declared before it: the
client's files, which sit between `beforeAll` and `configure`. What must see
every request, the client's files included, goes in `beforeAll`: the logger,
`@alxia/cors`, `@alxia/compress`, `@alxia/secure-headers`. A guard on the app
answers a request no route matches too: an anonymous request to a missing path
gets the 401, not the 404. Scope it with a path, `use('/app', guard)`
(a guard that adds nothing to the context: `bearer` and `session` add `user`),
to guard only some pages.

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
is a compile error. A middleware that needs something an earlier one
derived is typed by the app it is given, as anywhere in alxia.

### Behind a proxy

A proxy or a load balancer that terminates TLS asks the server over plain
HTTP, at an address of its own, so React Router's `request.url` reads
`http://10.0.0.5:3000/…`. Name the proxies with `proxy`, `@alxia/core`'s
`trustProxy`:

```ts
// app/server.ts
import { trustProxy } from '@alxia/core';
import { createServer } from '@alxia/react-router';

export default createServer({
	proxy: trustProxy({ trusted: ['10.0.0.0/8'], untrusted: 'refuse' }),
});
```

```tsx
// app/routes/login.tsx
import type { LoaderFunctionArgs } from 'react-router';

export function loader({ request }: LoaderFunctionArgs) {
	// https://example.com/auth/callback behind the proxy
	return { callback: new URL('/auth/callback', request.url).href };
}
```

Every request through the catch-all is handed to React Router at
`originalUrl(ctx)`: the scheme and host the trusted proxy wrote in
`X-Forwarded-Proto` and `X-Forwarded-Host` (or `Forwarded`, with
`header: 'forwarded'`), each checked, and the request's own for any it did
not. A direct client's forwarded headers are ignored, or, with
`untrusted: 'refuse'`, answered 403 before the pages. `ctx.url` and what
alxia's middlewares read stay the request as it reached the server. With a
server of your own, give `alxia({ proxy })` the same option. See
[Behind a proxy](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/serving.md#behind-a-proxy-proxy)
for what is believed and what is valid.

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

const app = base.plugin((app) =>
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

`reactRouter()` goes through `app.plugin`, as `@alxia/graphql`'s `graphql(app, …)`
does: that is how it knows the app's context type. A `HEAD` is handed to
React Router as a `GET`, since React Router answers a `HEAD` of its own
with no headers at all; the core then drops the body. In a monorepo where
this package is linked rather than installed, add
`ssr: { external: ['@alxia/react-router'] }` to `vite.config.ts`: see
[the troubleshooting entry](../troubleshooting.md#alxiaof-this-request-has-no-alxia-context-).
