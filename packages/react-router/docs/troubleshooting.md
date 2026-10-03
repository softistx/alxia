# Troubleshooting

Each entry is headed by the text you see: an error thrown at startup or in
a loader, a message React Router or the browser prints, or an error from
`tsc`. Paths, route ids and types in a message are the app's own, written
`…` below. A trap that prints nothing is under [Traps](#traps), by symptom.

**Thrown or printed**

- [`Error: No value found for context`](#error-no-value-found-for-context)
- [`alxiaOf(): this request has no alxia context. …`](#alxiaof-this-request-has-no-alxia-context-)
- [``You made a POST request to "/" but did not provide an `action` for route "root", so there is no way to handle the request.``](#you-made-a-post-request-to--but-did-not-provide-an-action-for-route-root-so-there-is-no-way-to-handle-the-request)
- [`TypeError: reactRouter(): client is …, which is not a directory. …`](#typeerror-reactrouter-client-is--which-is-not-a-directory-)
- [`TypeError: reactRouter(): … cannot be served at a path of its own name; rename it. …`](#typeerror-reactrouter--cannot-be-served-at-a-path-of-its-own-name-rename-it-)
- [`Refused to execute inline script because it violates the following Content Security Policy directive: "default-src 'none'"`](#refused-to-execute-inline-script-because-it-violates-the-following-content-security-policy-directive-default-src-none)

**Types**

- [`Type '…' does not satisfy the constraint 'Alxia<any, any, any, any>'`](#type--does-not-satisfy-the-constraint-alxiaany-any-any-any)
- [`Property '…' does not exist on type 'BaseContext & …'`](#property--does-not-exist-on-type-basecontext--)

**Traps**

- [A loader reads `null` from the app's own key](#a-loader-reads-null-from-the-apps-own-key)
- [A page answers alxia's JSON 404 or 405 instead of rendering](#a-page-answers-alxias-json-404-or-405-instead-of-rendering)
- [A streamed page arrives in one piece](#a-streamed-page-arrives-in-one-piece)
- [The logger times a streamed page at a few milliseconds](#the-logger-times-a-streamed-page-at-a-few-milliseconds)

## Thrown or printed

### `Error: No value found for context`

**When:** a loader, action or middleware calls `context.get(key)` with a
key made by `createContext()` with no default value, in a file under
`app/`, and the server set it in `getLoadContext`.

**Why:** `react-router build` bundles `app/context.ts` into
`build/server/index.js`. The server, which imports `app/context.ts`
itself, holds another `createContext()` object. React Router matches keys
by identity, so the server's `context.set(userContext, user)` sets a key
the loaders never read.

```ts
// server.ts: the trap
import { userContext } from './app/context'; // not the build's copy
reactRouter(app, { build, getLoadContext: ({ user }, context) => context.set(userContext, user) });
```

**Fix:** read alxia's context with `alxiaOf`. Its key, `alxiaContext`,
lives in this package under `node_modules`, which Vite leaves external, so
the build and the server load one module:

```ts
// app/routes/home.tsx
import { alxiaOf } from '@alxia/react-router';
import type { Base } from '../../base';

export function loader({ context }: Route.LoaderArgs) {
	const { user } = alxiaOf<Base>(context);
	return { name: user?.name ?? 'anonymous' };
}
```

A key of your own works when it is exported by a package installed under
`node_modules` (`@acme/session`), not by a file of the app.

### `alxiaOf(): this request has no alxia context. …`

```text
Error: alxiaOf(): this request has no alxia context. Serve the React Router build through reactRouter() from @alxia/react-router.
```

**When:** a loader calls `alxiaOf` and `alxiaContext` was not set.

**Why:** one of two:

- the request did not go through `reactRouter()`: the app runs under
  `react-router dev` or `react-router-serve` alone, or a unit test calls the
  loader with a bare `RouterContextProvider`;
- the server build holds **its own copy** of `@alxia/react-router`. Vite
  leaves a package external only when it resolves under `node_modules` to a
  `.js` file. A package linked from a workspace (`workspace:^`, `bun link`)
  resolves to its folder, outside `node_modules`, and Vite bundles it into
  `build/server/index.js` with a second `alxiaContext` the server never
  sets.

**Fix:** serve the build through `reactRouter()`. In a monorepo, tell Vite
to leave the package external:

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

**When:** at startup, `client` names a path that is missing or a file.

**Why:** the folder is read when `reactRouter()` runs, to declare a route
per top-level entry. A relative path is resolved against the process's
working directory, not the server file.

**Fix:** build first, and pass the folder relative to the server file:

```ts
reactRouter(app, { build, client: new URL('./build/client', import.meta.url) });
```

### `TypeError: reactRouter(): … cannot be served at a path of its own name; rename it. …`

**When:** at startup, with `client` given, a top-level file or folder of
the client build — a copy of `public/` — has a name no route can carry:
`a:b.txt` (a `:` starts a parameter), `*x` (a `*` is a wildcard). The
message ends with the core's refusal, which says which.

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
import { secureHeaders } from '@alxia/secure-headers';

app.use(
	secureHeaders({
		contentSecurityPolicy:
			"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'",
	}),
);
```

or `contentSecurityPolicy: false`. A per-request nonce, shared with
`<Scripts nonce>`, would drop `'unsafe-inline'`; it is on the
[roadmap](roadmap.md).

## Types

### `Type '…' does not satisfy the constraint 'Alxia<any, any, any, any>'`

```text
error TS2344: Type '{ user: string; }' does not satisfy the constraint 'Alxia<any, any, any, any>'.
```

**When:** `alxiaOf<T>()` is given a type that is not an alxia app, such as
the context's own shape.

**Why:** the type argument is the app, and `alxiaOf` reads its context
type from it, as `ContextOf<App>` does.

**Fix:** pass `typeof` the app before the catch-all:

```ts
// base.ts
export const base = alxia().use(session);
export type Base = typeof base;

// app/routes/home.tsx
const { user } = alxiaOf<Base>(context);
```

### `Property '…' does not exist on type 'BaseContext & …'`

```text
error TS2339: Property 'tenant' does not exist on type 'BaseContext & Empty & { user: { name: string; } | null; }'.
```

**When:** a loader reads, through `alxiaOf<Base>`, or `getLoadContext`
destructures, something no hook of the app derives, or one declared after
`reactRouter()`.

**Why:** the type is the app's context at the point of the catch-all, as
for any route: "order is meaning".

**Fix:** derive it before the catch-all, and export the app's type after
that hook:

```ts
export const base = alxia()
	.derive(({ request }) => ({ tenant: request.headers.get('x-tenant') ?? 'default' }));
export type Base = typeof base;
```

## Traps

### A loader reads `null` from the app's own key

The same cause as [`Error: No value found for context`](#error-no-value-found-for-context),
with a key that has a default: `createContext<User | null>(null)`. The
loader silently reads the default. Read the context through `alxiaOf`.

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
const app = alxia()
	.get('/api/posts/:slug', ({ params, reply }) => reply.ok(find(params.slug)))
	.use((app) => reactRouter(app, { build, client: 'build/client' }));
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
