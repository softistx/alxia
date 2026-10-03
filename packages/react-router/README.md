# @alxia/react-router

[alxia](https://www.npmjs.com/package/@alxia/core) as the HTTP server of a
[React Router](https://reactrouter.com) framework app, server rendered,
under Bun. One Vite plugin and no server file: the pages are served by
alxia in `react-router dev` and from the build. When you want more,
`app/server.ts` adds the app's hooks — logger, compression, sessions,
guards — and an `/api` beside the pages, and each loader reads what those
hooks built, typed.

## Quick start

Start from the official template, `bunx create-react-router@latest`, and
make three changes.

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

**3. Start with Bun**, in `package.json`:

```diff
-    "start": "react-router-serve ./build/server/index.js",
+    "start": "bun build/server/index.js",
```

The template's `dev`, `build` and `typecheck` scripts are unchanged. They
run through `bun run`, with no Node installed:

- **`bun run dev`**: every request Vite does not answer itself (pages,
  data, `/api`) reaches alxia, with HMR.
- **`bun run build`** writes `build/server/index.js`, a server you can run.
- **`bun run start`** serves the pages and the client build. It listens on
  `PORT` (3000) and `HOST` (`0.0.0.0`), and stops on `SIGTERM`.

`@alxia/core` and `react-router` 8 are peers, and `vite` 7 or 8 is an
optional peer, for `/vite`. The package declares no dependency.

Its `typescript` peer is 6 or 7. The template's TypeScript 5.9 typechecks,
but `bun add` warns about it; `bun add -d typescript@^6` silences the
warning.

## Customising: `app/server.ts`

The examples use `@alxia/logger` (`bun add @alxia/logger`); any plugin
works the same way. The plugin picks the file up in dev and in the build:

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
  no hook derives is a compile error;
- without it, `alxiaOf<typeof server>(context)` names the server;
- with neither, `alxiaOf(context)` is `BaseContext`.

[More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#typing-the-loaders)

## Options

```ts
// app/server.ts
import { logger } from '@alxia/logger';
import { createServer } from '@alxia/react-router';
import { greetingContext } from './context'; // createContext<string>('unset'), in app/context.ts

export default createServer({
	beforeAll: (app) => app.use(logger()), // runs before the client's files too
	configure: (app) => app.get('/api/health', ({ reply }) => reply.ok({ ok: true })),
	getLoadContext: (_ctx, context) => context.set(greetingContext, 'hello'),
	listen: { idleTimeout: 30 }, // its port and hostname, if given, win over PORT and HOST
	onListen: (server) => console.log(`up on ${server.url}`),
});
```

`build`, `mode` and `client` override what the plugin wires;
`client: false` serves no client files, so you can serve them yourself.
A server of your own, with no plugin, calls `reactRouter(app, { build,
client })` itself. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#escape-hatches)

## The client's files

In a build, `build/client` is served before `configure`'s hooks:

| path | `Cache-Control` |
| --- | --- |
| `/assets/*`, the hashed bundles | `public, max-age=31536000, immutable` |
| every other top-level file or folder, the copies of `public/` | `public, max-age=3600` |

A missing asset gets alxia's JSON 404, not a page. In dev, Vite serves
these files.

## Leaving the pages out of OpenAPI

The examples use `@alxia/openapi` (`bun add @alxia/openapi`):

```ts
// app/server.ts
import { docs } from '@alxia/openapi';
import { createServer, isReactRouterRoute } from '@alxia/react-router';

export default createServer({
	configure: (app) =>
		app.use(docs(app, { info: { title: 'Shop', version: '1.0.0' }, exclude: isReactRouterRoute })),
});
```

The catch-all adds nothing to the app's route table, so the typed client
never shows it. `isReactRouterRoute` names the catch-all and the client
files, so `@alxia/openapi` can leave them out.

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
  and forms: give the pages a policy of their own. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#refused-to-execute-inline-script-because-it-violates-the-following-content-security-policy-directive-default-src-none)
- **Under `react-router dev`, alxia's `ws` routes, `page()` and
  `ctx.server` are absent**: requests arrive through `app.fetch`. Try
  sockets against the build. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#a-websocket-route-does-not-connect-under-react-router-dev)
- **An alxia route whose path covers a page takes it**, wherever it is
  declared: `GET /:slug` answers `/about`. Keep alxia's routes under
  `/api`. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#a-page-answers-alxias-json-404-or-405-instead-of-rendering)

## API

| export | |
| --- | --- |
| `createServer(options?)` | the server of `app/server.ts`. `beforeAll`, `configure`, `getLoadContext`, `build`, `mode`, `client`, `listen`, `onListen` |
| `ServerOptions<Before, App>` | its options |
| `ReactRouterServer<App>` | what it returns: `create(wiring)` makes the app, `start(app)` listens |
| `ServerWiring` | what `create` takes: `build`, `mode`, `client` |
| `FreshApp` | the app `beforeAll`, or `configure` without it, receives |
| `alxiaOf<App>(context)` | what alxia's hooks built, in a loader, an action or a middleware. Typed by the registered server, by the type argument (a server or an app), or as `BaseContext` |
| `Register` | the interface to augment with `server: typeof server` |
| `RegisteredApp` | the app `alxiaOf` reads with no type argument |
| `RegisteredOf<R>` | the app a `Register`-shaped interface names: its server's, a fresh app, or `InvalidRegister` |
| `InvalidRegister` | what a `Register` naming neither a server nor an app reads as: every key of the app's own a compile error |
| `AppOf<Server>` | the app a server makes |
| `alxiaContext` | the React Router context key `alxiaOf` reads, set on every request |
| `reactRouter(app, options)` | the catch-all and the client's files, for a server of your own. `build`, `mode`, `getLoadContext`, `client` |
| `ReactRouterOptions<Ctx>` | its options |
| `isReactRouterRoute(route)` | whether this package declared a route, for OpenAPI's `exclude` |

From `@alxia/react-router/vite`:

| export | |
| --- | --- |
| `alxia(options?)` | the Vite plugin. `entry` is the server file: `app/server.ts` by default, or the default server when there is none |
| `AlxiaOptions` | its options |

## Documentation

- [Guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md): the setup, how dev and the build work, customising the server, typing the loaders, the app's own keys, escape hatches, the client's files, OpenAPI, testing and deploying.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md): each message, and the traps that print none.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/roadmap.md): what is coming, and what is not planned.
