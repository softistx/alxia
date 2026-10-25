# Typing the loaders

## Typing the loaders

Every request through the catch-all sets `alxiaContext`, this package's
key, on React Router's context provider, to what alxia's middlewares built for
that request. Three forms read it, each the same object:

- **`withAlxia(fn)`**, for a route typed by the generated `Route.*Args`:
  `fn` gets `alxia` beside React Router's arguments;
- **`alxiaOf(context)`**, inside a plain function, and with a type argument;
- **`context.alxia`**, where the arguments are typed with `react-router`'s
  own `LoaderFunctionArgs` and `ActionFunctionArgs`
  ([below](#the-shorthand-contextalxia)).

### `withAlxia(fn)`

```ts
// app/routes/account.tsx
import { type AlxiaArgs, withAlxia } from '@alxia/react-router';
import { redirect } from 'react-router';
import type { Route } from './+types/account';

export const loader = withAlxia(({ alxia, params }: Route.LoaderArgs & AlxiaArgs) => {
	if (alxia.user === null) throw redirect('/login');
	return { name: alxia.user.name, tab: params.tab ?? 'profile' };
});
// The page's Route.ComponentProps['loaderData']: { name: string; tab: string }
```

Annotate `fn`'s parameter as the generated arguments and `AlxiaArgs`:
`AlxiaArgs` is `{ alxia }`, typed by `Register`, and `AlxiaArgs<typeof server>`
names a server where nothing is registered. `withAlxia` returns a function of
React Router's arguments alone, with `fn`'s return type, so the generated
`loaderData` and `actionData`, and `useLoaderData<typeof loader>`, read what
`fn` returns. An action is written the same way; a middleware too, and its
`next` is passed on:

```ts
import { type AlxiaArgs, withAlxia } from '@alxia/react-router';
import type { Route } from './+types/admin';

export const middleware: Route.MiddlewareFunction[] = [
	withAlxia(async ({ alxia }: Parameters<Route.MiddlewareFunction>[0] & AlxiaArgs, next) => {
		alxia.log.info('admin');
		return next();
	}),
];
```

Why a wrapper: `context.alxia` cannot be typed under the generated
arguments ([below](#the-shorthand-contextalxia)), and a wrapper that adds a
key is the one form TypeScript infers from the annotation alone. A type
argument, `withAlxia<Route.LoaderArgs>(fn)`, would fix the arguments but
stop TypeScript inferring `fn`'s return type, since it infers no type
argument once one is given: the page's `loaderData` would be lost. On a request that did not come
through alxia it throws what `alxiaOf` throws.

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
compile error, as [the troubleshooting entry](../troubleshooting.md#property--does-not-exist-on-type-basecontext---readonly-registerserver-must-be-typeof-server-the-default-export-of-createserver-never-)
shows. The checks it gives:

```ts
const ctx = alxiaOf(context);
ctx.tenant;     // error: no middleware derives `tenant`
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

### With `@alxia/core`'s `Register`

`@alxia/core` has a `Register` of its own, which names the chain that
builds an app's context, for its route files
([The app's type](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/types.md#register-and-appcontext)).
`alxiaOf(context)` reads it when this package's `Register` names no
server:

```ts
// app/context.ts
import { alxia } from '@alxia/core';

export const base = alxia().derive(({ request }) => ({ user: request.headers.get('x-user') }));

declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}

// app/server.ts
const server = createServer({ configure: (app) => app.plugin(base) });
export default server;
```

`alxiaOf(context).user` is then typed with no declaration in
`@alxia/react-router`. Which one is read, in order:

1. a type argument, `alxiaOf<typeof server>(context)`;
2. this package's `Register`, `server: typeof server`: the whole app the
   pages run behind, `base` and everything `configure` adds after it;
3. `@alxia/core`'s `Register`, `context: typeof base`: only what `base`
   builds;
4. neither: `BaseContext`, the request, its URL, `reply` and the rest of
   what every middleware reads.

Declare this package's `Register` when `configure` adds to the context
after the base, and the loaders read it.

### Why a global augmentation is right here

alxia's core refuses a global augmentation of a context key: a plugin
that added `user` to every route, declared before it or after, would
type `user` on routes that run before the plugin. That is the lie "order
is meaning" forbids. Core's own `Register` names the base that builds
the context instead, and what reads it requires it. `Register` here does
something else: it names the **one** server of the React Router build,
at the point of its catch-all, which is exactly what every loader runs
behind. One build has one server entry, so there is no second app for a
module to be confused with.

If two React Router apps share one TypeScript program (one tsconfig over
both folders of a monorepo), their two declarations conflict, and `tsc`
says so (`Subsequent property declarations must have the same type`).
Give each app its own tsconfig, or use the type argument in both.

### The server: `server`

`alxiaOf(context).server` is core's `ctx.server`, the `Bun.Server` serving
the request, `undefined` with none
([Serving](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/serving.md#the-server-ctxserver)).
It is not `Register`'s `server`, which names what `createServer()` returned
for the types. From an action, its `publish` reaches the app's
[WebSocket](beside-the-pages.md#websockets) subscribers:

```ts
// app/routes/todos.tsx
import { alxiaOf } from '@alxia/react-router';
import type { Route } from './+types/todos';

export async function action({ request, context }: Route.ActionArgs) {
	const title = String((await request.formData()).get('title'));
	// Bun's own publish: the bytes as given, not checked by a socket's `send` schema.
	alxiaOf(context).server?.publish('todos', JSON.stringify({ added: title }));
	return { added: title };
}
```

What it is, by how the app runs:

| | `alxiaOf(context).server` |
| --- | --- |
| `bun build/server/index.js`, `server.start(app)`, `app.listen()` | the server `listen` started |
| `react-router dev`, `vite preview` | the `Bun.Server` on a loopback port that the plugin relays the app's sockets to (Vite's own server is `node:http`, not a `Bun.Server`): `publish` reaches every socket the app opened, its `url` is that port's, and `requestIP` and `timeout` know nothing of the request Vite took, so `ctx.ip` stays `undefined` there |
| Vite in middleware mode, a server of your own calling `app.fetch(request)` alone, `app.request(…)` in a test | `undefined` |

### The shorthand: `context.alxia`

This package augments React Router's `RouterContextProvider` with a
read-only `alxia` property: the object `alxiaOf(context)` returns, with no
import and no call, typed by the same `Register` (core's, then
`BaseContext`, with none of this package's):

```ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

export function loader({ context }: LoaderFunctionArgs) {
	const { user, server } = context.alxia;
	return { name: user?.name ?? 'anonymous', listening: server !== undefined };
}

export async function action({ context }: ActionFunctionArgs) {
	context.alxia.server?.publish('todos', JSON.stringify({ changed: true }));
	return { ok: true };
}
```

**Typed with react-router's own argument types, not yet the generated
ones.** `LoaderFunctionArgs`, `ActionFunctionArgs`, `MiddlewareFunction` and
`RouterContextProvider`, imported from `react-router`, see `alxia`. The
generated `Route.LoaderArgs` does not: the `+types` files import from
`react-router/internal`, whose types (in react-router 8.4 and 8.5) point at its
`dist/development` build, while `react-router` itself points at
`dist/production`. That is a second declaration of `RouterContextProvider`,
which no exported path reaches, so no package can augment it. With
`Route.LoaderArgs`, `context.alxia` works at runtime and `tsc` reports
TS2339 ([Troubleshooting](../troubleshooting.md#property-alxia-does-not-exist-on-type-readonlyroutercontextprovider)):
use `withAlxia` (or `alxiaOf(context)`) there, until react-router ships one declaration.

It is a getter on the provider's prototype that reads `alxiaContext`: it
holds exactly when that key is set, in dev as in production, and on a
provider no catch-all filled it throws what `alxiaOf` throws. It is the
server's alone: a `clientLoader` or a `clientAction` has no alxia context.

### Outside the catch-all

Without the plugin, under a plain `react-router dev`, or in a unit test
that calls a loader with a bare provider, there is no alxia context, and
`alxiaOf` and `context.alxia` throw, saying so. The getter is installed
when `@alxia/react-router` is first imported: a test whose program never
imports it reads `context.alxia` as `undefined`. See
[the troubleshooting entry](../troubleshooting.md#alxiaof-this-request-has-no-alxia-context-).

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
reading something no middleware derives is a compile error. Keep the keys in a
module of their own, such as `app/context.ts`, rather than in
`app/server.ts`: a route imports them, and the server file then stays out
of the client's module graph.

A server of your own, without the plugin, holds another copy of every
key under `app/`: see
[the troubleshooting entry](../troubleshooting.md#error-no-value-found-for-context).
