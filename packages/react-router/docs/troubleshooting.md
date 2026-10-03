# Troubleshooting

Each entry is headed by the text you see: an error thrown at startup or in
a loader, a message React Router or the browser prints, or an error from
`tsc`. Paths, route ids and types in a message are the app's own, written
`…` below. A trap that prints nothing is under [Traps](#traps), by symptom.

**Thrown or printed**

- [`alxiaOf(): this request has no alxia context. …`](#alxiaof-this-request-has-no-alxia-context-)
- [`Error: No value found for context`](#error-no-value-found-for-context)
- [`alxia-react-router: … must export createServer() from @alxia/react-router as its default export: …`](#alxia-react-router--must-export-createserver-from-alxiareact-router-as-its-default-export-)
- [`alxia-react-router: the entry … does not exist. …`](#alxia-react-router-the-entry--does-not-exist-)
- [`alxia-react-router: React Router's Vite plugin is not in this config. …`](#alxia-react-router-react-routers-vite-plugin-is-not-in-this-config-)
- [`alxia-react-router: serverBundles splits React Router's server build in several, and alxia serves one. …`](#alxia-react-router-serverbundles-splits-react-routers-server-build-in-several-and-alxia-serves-one-)
- [`alxia-react-router: Vite's ssr environment does not run modules in this process, so the server cannot be loaded.`](#alxia-react-router-vites-ssr-environment-does-not-run-modules-in-this-process-so-the-server-cannot-be-loaded)
- [`The React Router Vite plugin requires the use of a Vite config file`](#the-react-router-vite-plugin-requires-the-use-of-a-vite-config-file)
- [`No route matches URL "/assets/…"`](#no-route-matches-url-assets)
- [``You made a POST request to "/" but did not provide an `action` for route "root", so there is no way to handle the request.``](#you-made-a-post-request-to--but-did-not-provide-an-action-for-route-root-so-there-is-no-way-to-handle-the-request)
- [`TypeError: reactRouter(): client is …, which is not a directory. …`](#typeerror-reactrouter-client-is--which-is-not-a-directory-)
- [`TypeError: reactRouter(): … cannot be served at a path of its own name; rename it. …`](#typeerror-reactrouter--cannot-be-served-at-a-path-of-its-own-name-rename-it-)
- [`Refused to execute inline script because it violates the following Content Security Policy directive: "default-src 'none'"`](#refused-to-execute-inline-script-because-it-violates-the-following-content-security-policy-directive-default-src-none)
- [`alxia-react-router: … already exists, and reveal leaves it as it is. Run alxia-react-router reveal --force to overwrite it.`](#alxia-react-router--already-exists-and-reveal-leaves-it-as-it-is-run-alxia-react-router-reveal---force-to-overwrite-it)
- [`alxia-react-router: no vite.config.ts in …. Run reveal from the app's root, beside vite.config.ts.`](#alxia-react-router-no-viteconfigts-in--run-reveal-from-the-apps-root-beside-viteconfigts)
- [`alxia-react-router: … gives alxia() an entry reveal cannot read. …`](#alxia-react-router--gives-alxia-an-entry-reveal-cannot-read-)
- [`alxia-react-router: … computes appDirectory, which reveal cannot read. …`](#alxia-react-router--computes-appdirectory-which-reveal-cannot-read-)
- [`alxia-react-router: unknown command ….`](#alxia-react-router-unknown-command-)
- [`alxia-react-router: unknown option … for reveal.`](#alxia-react-router-unknown-option--for-reveal)
- [`error: GET https://registry.npmjs.org/alxia-react-router - 404`](#error-get-httpsregistrynpmjsorgalxia-react-router---404)
- [`warn: incorrect peer dependency "typescript@5.9.3"`](#warn-incorrect-peer-dependency-typescript593)

**Types**

- [`Property '…' does not exist on type 'BaseContext & …'`](#property--does-not-exist-on-type-basecontext--)
- [`Type '…' does not satisfy the constraint 'AnyAlxia | ReactRouterServer<AnyAlxia>'`](#type--does-not-satisfy-the-constraint-anyalxia--reactrouterserveranyalxia)
- [`Type '(app: …) => void' is not assignable to type '(app: …) => AnyAlxia'`](#type-app---void-is-not-assignable-to-type-app---anyalxia)
- [`Property '…' does not exist on type 'BaseContext & { readonly 'Register.server must be typeof server, the default export of createServer()': never; }'`](#property--does-not-exist-on-type-basecontext---readonly-registerserver-must-be-typeof-server-the-default-export-of-createserver-never-)
- [`Subsequent property declarations must have the same type. Property 'server' must be of type …`](#subsequent-property-declarations-must-have-the-same-type-property-server-must-be-of-type-)

**Traps**

- [`bun build/server/index.js` exits at once, printing nothing](#bun-buildserverindexjs-exits-at-once-printing-nothing)
- [A loader reads `null` from the app's own key](#a-loader-reads-null-from-the-apps-own-key)
- [A page answers alxia's JSON 404 or 405 instead of rendering](#a-page-answers-alxias-json-404-or-405-instead-of-rendering)
- [A streamed page arrives in one piece](#a-streamed-page-arrives-in-one-piece)
- [The logger times a streamed page at a few milliseconds](#the-logger-times-a-streamed-page-at-a-few-milliseconds)
- [A WebSocket route does not connect under `react-router dev`](#a-websocket-route-does-not-connect-under-react-router-dev)

## Thrown or printed

### `alxiaOf(): this request has no alxia context. …`

```text
Error: alxiaOf(): this request has no alxia context. Serve the React Router app through alxia: add alxia() from @alxia/react-router/vite to vite.config.ts's plugins, or, with a server of your own, serve the build through reactRouter() from @alxia/react-router.
```

**When:** a loader calls `alxiaOf` and `alxiaContext` was not set.

**Why:** one of three:

- the request did not go through alxia: `vite.config.ts` has no `alxia()`,
  the build runs under `react-router-serve`, or a unit test calls the
  loader with a bare `RouterContextProvider`;
- a server of your own, without the plugin, serves the build without
  `reactRouter()`;
- a server of your own, without the plugin, in a monorepo: the server
  build holds **its own copy** of `@alxia/react-router`. Vite leaves a
  package external only when it resolves under `node_modules` to a `.js`
  file. A package linked from a workspace (`workspace:^`, `bun link`)
  resolves to its folder, outside `node_modules`, and Vite bundles it into
  `build/server/index.js` with a second `alxiaContext` the server never
  sets.

**Fix:** add `alxia()` to `vite.config.ts`, as in the
[setup](guide.md#setup). With a server of your own in a monorepo, tell
Vite to leave the package external:

```ts
// vite.config.ts
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	ssr: { external: ['@alxia/react-router'] },
	plugins: [reactRouter()],
});
```

`grep '@alxia/react-router' build/server/index.js` should show an
`import … from "@alxia/react-router"` line, not the package's code. In a
unit test, set the key yourself:

```ts
import { alxiaContext } from '@alxia/react-router';
import { RouterContextProvider } from 'react-router';

const context = new RouterContextProvider();
context.set(alxiaContext, { user: { name: 'Ada' } });
await loader({ context, request: new Request('http://localhost/'), params: {} } as never);
```

### `Error: No value found for context`

**When:** a loader, action or middleware calls `context.get(key)` with a
key made by `createContext()` with no default value, in a file under
`app/`, and a server of your own, without the plugin, set it in
`getLoadContext`.

**Why:** `react-router build` bundles `app/context.ts` into
`build/server/index.js`. A server outside the build, which imports
`app/context.ts` itself, holds another `createContext()` object. React
Router matches keys by identity, so that server's
`context.set(userContext, user)` sets a key the loaders never read.

```ts
// server.ts, without the plugin: the trap
import { userContext } from './app/context'; // not the build's copy
reactRouter(app, { build, getLoadContext: ({ user }, context) => context.set(userContext, user) });
```

**Fix:** serve the app with the plugin, `alxia()` in `vite.config.ts`: the
server is then built with the routes, and `app/context.ts` is one module
for both, in dev and in the build. See
[the app's own context keys](guide.md#the-apps-own-context-keys).

Without the plugin, read alxia's context with `alxiaOf`: its key,
`alxiaContext`, lives in this package under `node_modules`, which Vite
leaves external, so the build and the server load one module. A key
exported by a package installed under `node_modules` (`@acme/session`)
works for the same reason.

### `alxia-react-router: … must export createServer() from @alxia/react-router as its default export: …`

```text
TypeError: alxia-react-router: app/server.ts must export createServer() from @alxia/react-router as its default export: export default createServer({ … }).
```

Under `react-router dev`, Vite's error page shows it, and the request is a
500. In a build, `bun build/server/index.js` throws it at startup.

**When:** the server file has no default export, or its default is not
what `createServer()` returns: an alxia app, a named `export const server`,
or the options object itself.

**Why:** the plugin makes the app with the default export's `create`, and
listens with its `start`.

**Fix:** export the server as the default:

```ts
// app/server.ts
import { createServer } from '@alxia/react-router';

const server = createServer({ configure: (app) => app });
export default server;
```

An alxia app of your own, with `reactRouter()` on it, is served without the
plugin: see [a server of your own](guide.md#a-server-of-your-own-without-the-plugin).

### `alxia-react-router: the entry … does not exist. …`

```text
Error: alxia-react-router: the entry server/main.ts does not exist. Create it, or leave entry out to use app/server.ts, or the default server without it.
```

**When:** `alxia({ entry })` names a file that is not there, relative to
Vite's root. Under `react-router dev` each request is a 500 saying so;
`react-router build` fails.

**Why:** a missing `app/server.ts` falls back to the default server, but an
`entry` you named is taken as meant.

**Fix:** correct the path, or leave `entry` out.

### `alxia-react-router: React Router's Vite plugin is not in this config. …`

```text
Error: alxia-react-router: React Router's Vite plugin is not in this config. Add reactRouter() from @react-router/dev/vite beside alxia() in vite.config.ts.
```

**When:** Vite starts, for `react-router dev`, `react-router build` or
`vite`, with `alxia()` and no `reactRouter()`.

**Why:** the plugin reads React Router's config (the app directory, the
build directory, the server build's file name) from React Router's own
plugin.

**Fix:** list both, in any order:

```ts
// vite.config.ts
import { alxia } from '@alxia/react-router/vite';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [reactRouter(), alxia()] });
```

### `alxia-react-router: serverBundles splits React Router's server build in several, and alxia serves one. …`

```text
Error: alxia-react-router: serverBundles splits React Router's server build in several, and alxia serves one. Remove serverBundles from react-router.config.ts.
```

**When:** `react-router.config.ts` sets `serverBundles`.

**Why:** the plugin builds one server, `build/server/index.js`, with React
Router's build inside it. Server bundles make several, each its own
`index.js`.

**Fix:** remove `serverBundles`. One alxia server serves every route.

### `alxia-react-router: Vite's ssr environment does not run modules in this process, so the server cannot be loaded.`

**When:** under `react-router dev`, Vite's `ssr` environment is not a
runnable one: another plugin replaced it with an environment that runs
elsewhere, such as a worker runtime.

**Why:** the plugin loads the server with the `ssr` environment's module
runner, in Vite's own process, where Bun runs the app. The check reads the
environment's `runner` itself, so an app whose Vite is another copy than
the one this package was tested with passes it.

**Fix:** drop the plugin that replaces the `ssr` environment. alxia runs
under Bun, not in a worker runtime.

### `The React Router Vite plugin requires the use of a Vite config file`

React Router's Vite plugin throws it.

**When:** a script or a test starts Vite with `createServer({
configFile: false, plugins: [alxia(), reactRouter()] })`.

**Why:** React Router's plugin reads its options from a config file, and
refuses inline ones.

**Fix:** write the config to a file, and point `configFile` at it:

```ts
import { createServer } from 'vite';

const server = await createServer({
	root,
	configFile: `${root}/vite.config.ts`,
	server: { port: 0 },
});
await server.listen();
```

### `No route matches URL "/assets/…"`

React Router's 404 page answers every file under `/assets`.

**When:** in a build, the server runs in `development`: `createServer({
mode: 'development' })`, or a server of your own with `reactRouter(app, {
mode: 'development' })`.

**Why:** in `development` the client's files are left to Vite's dev
server, so nothing serves `build/client`, and the catch-all gets the
assets. Under the plugin the mode follows the command, `production` in a
build, whatever `NODE_ENV` says; only an explicit `mode` changes it.

**Fix:** leave `mode` out, or set it from where the server runs:

```ts
// server.ts, without the plugin
reactRouter(app, { build, client: 'build/client', mode: 'production' });
```

### ``You made a POST request to "/" but did not provide an `action` for route "root", so there is no way to handle the request.``

React Router prints it, and answers `405`.

**When:** a `POST /` to an app whose index route has the action.

**Why:** a `POST /` is the root route's. The index route's action is
`POST /?index`; React Router's own `<Form>` adds `?index` when it posts
from an index route. This is React Router's behaviour, not alxia's.

**Fix:** post to `/?index`, as `<Form method="post">` does, or in a test:

```ts
await app.request('/?index', { method: 'POST', body: new URLSearchParams({ step: '2' }) });
```

The single-fetch form is `POST /_.data?index`.

### `TypeError: reactRouter(): client is …, which is not a directory. …`

```text
TypeError: reactRouter(): client is build/clinet, which is not a directory. Pass the client build, build/client by default.
```

**When:** at startup, `client` — `createServer`'s, `create`'s or
`reactRouter`'s — names a path that is missing or a file.

**Why:** the folder is read when the app is made, to declare a route per
top-level entry. A relative path is resolved against the process's
working directory, not the server file. Under the plugin, with no
`client` option, the folder is `build/client` resolved against the built
file, and is found wherever the process starts.

**Fix:** build first, leave `client` to the plugin, or pass the folder
relative to the file that names it:

```ts
reactRouter(app, { build, client: new URL('./build/client', import.meta.url) });
```

### `TypeError: reactRouter(): … cannot be served at a path of its own name; rename it. …`

**When:** at startup, a top-level file or folder of the client build — a
copy of `public/` — has a name no route can carry: `a:b.txt` (a `:` starts
a parameter), `*x` (a `*` is a wildcard). The message ends with the core's
refusal, which says which.

A name a URL only encodes is fine: `my file.pdf` is served at
`/my%20file.pdf`, `café.png` at `/caf%C3%A9.png`, as a browser asks for
them.

**Fix:** rename the file in `public/`, or move it into a folder: a file
inside a folder is served by that folder's `static` route, whatever its
name.

### `Refused to execute inline script because it violates the following Content Security Policy directive: "default-src 'none'"`

The browser's console prints it; the page renders on the server, then
never hydrates, and a `<Form>` does not post (`form-action 'none'`).

**When:** `@alxia/secure-headers` is used with its default policy.

**Why:** the default, `default-src 'none'; base-uri 'none'; form-action
'none'; frame-ancestors 'none'`, suits an API. A page loads its bundles
from `/assets`, runs React Router's inline scripts, and posts forms.

**Fix:** give the app a policy that allows the page's own scripts:

```ts
// app/server.ts
import { createServer } from '@alxia/react-router';
import { secureHeaders } from '@alxia/secure-headers';

export default createServer({
	configure: (app) =>
		app.use(
			secureHeaders({
				contentSecurityPolicy:
					"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'",
			}),
		),
});
```

or `contentSecurityPolicy: false`. A per-request nonce, shared with
`<Scripts nonce>`, would drop `'unsafe-inline'`; it is on the
[roadmap](roadmap.md).

### `alxia-react-router: … already exists, and reveal leaves it as it is. Run alxia-react-router reveal --force to overwrite it.`

```text
alxia-react-router: app/server.ts already exists, and reveal leaves it as it is. Run alxia-react-router reveal --force to overwrite it.
```

**When:** `bunx alxia-react-router reveal` finds a server file where it
would write one: `app/server.ts`, or the file `alxia({ entry })` names. It
exits 1 and writes nothing.

**Why:** that file is the app's server, customised or not; reveal never
replaces it unasked.

**Fix:** keep it, or overwrite it with the default server, its options
commented:

```sh
bunx alxia-react-router reveal --force
```

### `alxia-react-router: no vite.config.ts in …. Run reveal from the app's root, beside vite.config.ts.`

**When:** `bunx alxia-react-router reveal` runs in a folder with no
`vite.config.ts` (nor `.mts`, `.cts`, `.js`, `.mjs` or `.cjs`): a
subfolder of the app, or another project.

**Why:** reveal reads where to write from the app's `vite.config.ts`,
`alxia({ entry })`, and writes relative to it.

**Fix:** `cd` to the folder that holds `vite.config.ts`, and run it there.

### `alxia-react-router: … gives alxia() an entry reveal cannot read. …`

```text
alxia-react-router: vite.config.ts gives alxia() an entry reveal cannot read. Write it as a string literal, alxia({ entry: 'app/server.ts' }), and run reveal again.
```

**When:** `vite.config.ts` passes `alxia()` an `entry` that is not a string
literal: a constant, a template with `${…}`, a call. Reveal exits 1 and
writes nothing.

**Why:** reveal reads the config as text, cheaply, and does not run it.
Guessing `app/server.ts` would write a file the plugin does not load.

**Fix:** write the path as a literal, run reveal, then compute it again if
you need to:

```ts
// vite.config.ts
import { alxia } from '@alxia/react-router/vite';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [reactRouter(), alxia({ entry: 'server/main.ts' })] });
```

### `alxia-react-router: … computes appDirectory, which reveal cannot read. …`

```text
alxia-react-router: react-router.config.ts computes appDirectory, which reveal cannot read. Write it as a string literal, appDirectory: 'app', and run reveal again.
```

**When:** `react-router.config.ts` sets `appDirectory` to something other
than a string literal, and `vite.config.ts` names no `entry`. Reveal exits
1 and writes nothing.

**Why:** the same as above: reveal does not run the config, and `app/`
might not be the folder the plugin reads.

**Fix:** write `appDirectory` as a literal for the time of the reveal, or
name the file in `vite.config.ts`, `alxia({ entry: 'src/server.ts' })`.

### `alxia-react-router: unknown command ….`

**When:** the bin is given a command other than `reveal`, such as
`bunx alxia-react-router reveal-server`. It prints its usage and exits 1.

**Fix:** `bunx alxia-react-router reveal`, or `--help` for the usage.

### `alxia-react-router: unknown option … for reveal.`

**When:** `reveal` is given an option other than `--force` or `--help`,
such as react-router-hono-server's `reveal file` or `reveal folder`. It
prints its usage and exits 1.

**Fix:** `bunx alxia-react-router reveal` writes the one server file the
plugin reads. For a server in a folder of its own, name it first,
`alxia({ entry: 'app/server/index.ts' })`, then run `reveal`: it writes
there.

### `error: GET https://registry.npmjs.org/alxia-react-router - 404`

**When:** `bunx alxia-react-router reveal` runs in a project where
`@alxia/react-router` is not installed.

**Why:** `bunx` looks for the bin in `node_modules/.bin`, then for an npm
package of the bin's name. The bin is `@alxia/react-router`'s, and no
package is named `alxia-react-router`.

**Fix:** install the package, then run the bin:

```sh
bun add @alxia/core @alxia/react-router
bunx alxia-react-router reveal
```

### `warn: incorrect peer dependency "typescript@5.9.3"`

`bun add @alxia/core @alxia/react-router` prints it in the official
template.

**Why:** the template ships TypeScript 5.9, and alxia's packages declare
`typescript` 6 or 7 as a peer: their declarations are tested with those.
The template's own code, with a server file and typed loaders, typechecks
under 5.9 too.

**Fix:** none is needed to run. To silence it, and typecheck with what
alxia is tested on:

```sh
bun add -d typescript@^6
```

## Types

### `Property '…' does not exist on type 'BaseContext & …'`

```text
error TS2339: Property 'tenant' does not exist on type 'BaseContext & Empty & { requestId: string; log: RequestLog; } & { user: { name: string; } | null; }'.
```

**When:** a loader reads, through `alxiaOf`, or `getLoadContext`
destructures, something no hook of the server derives. With the type
`'BaseContext & Empty'` alone, `alxiaOf(context)` has no server to read:
`app/server.ts` has no `Register` declaration, or there is no
`app/server.ts`.

**Why:** the type is the app's context at the point of the catch-all, as
for any route: "order is meaning".

**Fix:** derive it in `configure`, and register the server once:

```ts
// app/server.ts
import { createServer } from '@alxia/react-router';

const server = createServer({
	configure: (app) =>
		app.derive(({ request }) => ({ tenant: request.headers.get('x-tenant') ?? 'default' })),
});
export default server;

declare module '@alxia/react-router' {
	interface Register {
		server: typeof server;
	}
}
```

### `Type '…' does not satisfy the constraint 'AnyAlxia | ReactRouterServer<AnyAlxia>'`

```text
error TS2344: Type '{ user: string; }' does not satisfy the constraint 'AnyAlxia | ReactRouterServer<AnyAlxia>'.
```

**When:** `alxiaOf<T>()` is given a type that is neither a server nor an
alxia app, such as the context's own shape.

**Why:** the type argument is what the context is read from, as
`ContextOf<App>` reads an app.

**Fix:** pass the server's type, or register it and pass nothing:

```ts
// app/server.ts
export type Server = typeof server;

// app/routes/home.tsx
import type { Server } from '../server';
const { user } = alxiaOf<Server>(context);
```

### `Type '(app: …) => void' is not assignable to type '(app: …) => AnyAlxia'`

```text
error TS2322: Type '(app: FreshApp) => void' is not assignable to type '(app: FreshApp) => AnyAlxia'.
  Type 'void' is not assignable to type 'AnyAlxia'.
```

**When:** `configure` or `beforeAll` has a body that declares on `app` and
returns nothing.

**Why:** each returns the app it built: that return is how its types reach
the loaders and `getLoadContext`.

**Fix:** return the chain:

```ts
createServer({
	configure: (app) => app.get('/api/health', ({ reply }) => reply.ok({ ok: true })),
});
```

### `Property '…' does not exist on type 'BaseContext & { readonly 'Register.server must be typeof server, the default export of createServer()': never; }'`

```text
error TS2339: Property 'user' does not exist on type 'BaseContext & { readonly 'Register.server must be typeof server, the default export of createServer()': never; }'.
```

**When:** every `alxiaOf(context)` read fails with it: `Register`'s
`server` names something that is neither a server nor an alxia app, most
often the module rather than its default export,
`server: typeof import('./server')`.

**Why:** a wrong registration types the context as one marker key, so
that each read is a compile error rather than `never`, which would let
anything through.

**Fix:** name the default export's type:

```ts
// app/server.ts
const server = createServer({ configure: (app) => app });
export default server;

declare module '@alxia/react-router' {
	interface Register {
		server: typeof server;
	}
}
```

### `Subsequent property declarations must have the same type. Property 'server' must be of type …`

```text
error TS2717: Subsequent property declarations must have the same type.  Property 'server' must be of type 'ReactRouterServer<…>', but here has type 'ReactRouterServer<…>'.
```

**When:** two files of one TypeScript program declare `Register`'s
`server`: two React Router apps under one tsconfig, or a copy of the
declaration left in a second file.

**Why:** a program has one `Register`, and it names one server: the one
whose catch-all every loader of the build runs behind.

**Fix:** keep one declaration per app, beside its server. Give each app of
a monorepo its own tsconfig, or drop `Register` and pass the type
argument, `alxiaOf<Server>(context)`.

## Traps

### `bun build/server/index.js` exits at once, printing nothing

**Why:** the build was made without the plugin, so `build/server/index.js`
is React Router's plain server build: a module of exports, which listens
on nothing. Or it was imported, not run: the server listens only when it
is the process's entry point.

**Fix:** add `alxia()` to `vite.config.ts` and build again; the start line
`alxia listening on <url>` then comes up. Run the file itself,
`bun build/server/index.js`, not through another module's `import`.

### A loader reads `null` from the app's own key

The same cause as [`Error: No value found for context`](#error-no-value-found-for-context),
with a key that has a default: `createContext<User | null>(null)`. The
loader silently reads the default. Serve the app with the plugin, or read
the context through `alxiaOf`.

### A page answers alxia's JSON 404 or 405 instead of rendering

`{"error":"not_found"}` or `{"error":"method_not_allowed"}` where a page
was expected.

**Why:** an alxia route's path covers the page's, and the core ranks it
first wherever it was declared: segment by segment, a literal beats a
parameter, which beats the catch-all's `/*`. Then the path is chosen
before the method. So:

- `GET /:slug` takes `/about`, and every other one-segment page;
- `POST /account` alone makes `GET /account` a 405, not the page;
- a folder of `public/`, `public/blog/`, becomes `static('/blog', …)`, and
  `/blog/first-post` is its 404.

**Fix:** keep alxia's routes under a prefix the pages do not use, and
`public/`'s folders apart from the page paths:

```ts
createServer({
	configure: (app) =>
		app.get('/api/posts/:slug', ({ params, reply }) => reply.ok({ slug: params.slug })),
});
```

### A streamed page arrives in one piece

The shell and its `<Suspense>` fallback should come first, and the
deferred value later. If the whole page comes at once:

- **The client is a bot to `isbot`.** React Router's entry waits for
  `allReady` before it answers a bot, and `isbot('Bun/1.4.2')` is `true`:
  Bun's `fetch`, `curl` and most test clients get the finished page. Send a
  browser's user agent:

  ```ts
  const BROWSER = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  await fetch(url, { headers: { 'user-agent': BROWSER } });
  ```

- **A compressor holds the stream.** One that does not flush after each
  chunk sends the page when it ends. `@alxia/compress` flushes a body with
  no `Content-Length` as it comes, so the cause is elsewhere: a proxy or a
  CDN in front of the server that buffers to compress. Compare with
  `accept-encoding: identity`, then without the proxy.

### The logger times a streamed page at a few milliseconds

`@alxia/logger` writes its entry when the response's headers leave, so a
page that streams for 800 ms is logged at its first byte. The duration is
the server's time to first byte, not the page's.

### A WebSocket route does not connect under `react-router dev`

The same route connects from `bun build/server/index.js`.

**Why:** under `@alxia/react-router/vite`, Vite owns the dev server, and
the app gets requests through `app.fetch`, as in a test. An upgrade goes
to Vite's server, which keeps its own socket for HMR: alxia's `ws`
routes, `page()` and `ctx.server` are not there in dev.

**Fix:** test sockets against the build (`bun run build && bun run
start`), or serve the build with
[a server of your own](guide.md#a-server-of-your-own-without-the-plugin)
while working on them.
