# Writing a plugin

This page covers the three ways to write a plugin, and when to use each:

| Write | When the plugin | Example |
| --- | --- | --- |
| [an app](#an-app-plugin) | adds context, routes or typed replies | an `auth` that derives `user` |
| [a `Plugin` function](#a-plugin-function) | adds global hooks only, the app's type unchanged | a header on every response |
| [`definePlugin<Requires>()`](#a-plugin-that-needs-an-earlier-one) | reads what an earlier plugin added | a tenant scope that reads `user` |

Whichever you write, a plugin uses the core's public API only. The
mechanics of `use` itself — prefixes, the order of `onError`, global
hooks — are in [Groups and plugins](groups-and-plugins.md#plugins).

## An app plugin

An app is a plugin. What it declares is mounted on the app that uses it,
and its types come with it:

- its route hooks (`derive`, `decorate`, `wrap`, `onError`) apply to the
  routes declared after `use`, and what they add is typed on them;
- its routes are mounted under the app's prefix, behind the hooks declared
  before `use`;
- its hooks' replies — a 401, a 429 — are in the type of every route after
  it, so the client reads them.

```ts
// auth.ts
import { alxia } from '@alxia/core';

export interface User {
	readonly id: string;
	readonly tenantId: string;
}

export const auth = alxia().derive(async ({ request, reply }) => {
	const user = await authenticate(request); // your own: User | null
	return user ? { user } : reply(401, { error: 'unauthenticated' as const });
});

// app.ts
const app = alxia()
	.get('/health', ({ reply }) => reply(200, 'ok')) // no user, no 401
	.use(auth)
	.get('/me', ({ user, reply }) => reply(200, user)); // user: User; may answer 401
```

A plugin that takes options is a function that returns an app:

```ts
export const requireRole = (role: string) =>
	alxia().derive(({ request, reply }) =>
		request.headers.get('x-role') === role
			? undefined
			: reply(403, { error: 'forbidden' as const }),
	);

app.use(requireRole('admin')).get('/stats', handler);
```

`use` reads the app once, when it is called: declare it completely first.

## A `Plugin` function

```ts
type Plugin = <App extends AnyAlxia>(app: App) => App;
```

A function given the app, which returns it with global hooks added:
`onRequest`, `onResponse`, `around`, `onStart`, `onStop`, `parser`. The
app's type is unchanged, so it fits anywhere in the chain.

```ts
import { alxia, type Plugin, withHeaders } from '@alxia/core';

export const poweredBy =
	(name: string): Plugin =>
	(app) =>
		app.onResponse((response) =>
			withHeaders(response, (headers) => headers.set('x-powered-by', name)),
		);

const app = alxia()
	.get('/', ({ reply }) => reply(200, 'hi'))
	.use(poweredBy('alxia')); // global: it applies to `/` too
```

Add only global hooks here. A `derive` added by a `Plugin` would run, but
`Plugin` returns the app's type unchanged, so no route could read what it
added. To add context or replies, write an app plugin.

## A plugin that needs an earlier one

A plugin may read what another one adds: a tenant scope reads `user`, a
permission check reads `session`. Built on a plain `alxia()`, its `derive`
could not read `user`, since that app's context has none.
`definePlugin<Requires>()` builds the plugin on an app whose context
already has `Requires`:

```ts
import { definePlugin } from '@alxia/core';

interface Tenant {
	readonly id: string;
	readonly name: string;
}

const tenants = new Map<string, Tenant>();

export const tenant = definePlugin<{ user: { tenantId: string } }>()((app) =>
	app.derive(({ user }) => ({ tenant: tenants.get(user.tenantId) ?? null })),
);
```

```ts
definePlugin<Requires extends object = Empty>(): <Plugin extends AnyAlxia>(
	build: (app: Alxia<Requires>) => Plugin,
) => Plugin & Requiring<Requires>
```

- `Requires` lists the context keys the plugin reads, each with the
  narrowest type it needs. `{ tenantId: string }` accepts any `user` that
  has a `tenantId`.
- `build` receives an app whose context has `Requires`, and returns the
  plugin: `derive` and the rest, routes, replies, as in any app plugin.
  `build` runs once, when the function `definePlugin<…>()` returns is
  called: for a factory such as `tenantOf` below, once per call of the
  factory.
- The result is an app, given to `use` like any other. `use` checks the
  app's context against `Requires` at compile time, so the plugin's hooks
  never run without what they read.

```ts
const app = alxia()
	.use(auth)   // adds user: User
	.use(tenant) // compiles: User has a tenantId
	.get('/tenant', ({ tenant, reply }) => reply(200, tenant)); // tenant: Tenant | null

alxia().use(tenant);
// error: the plugin reads "user", which this app's context does not give: use the plugin that adds it first
```

The order matters, as everywhere in alxia. `alxia().use(tenant).use(auth)`
is refused too: when `tenant` is used, no `user` has been added yet.

An app whose `user` has another type, such as `User | null` from an
optional session, gets the second message:

```text
the plugin reads "user", which this app's context gives with another type
```

[Troubleshooting](../troubleshooting.md#the-plugin-reads--which-this-apps-context-does-not-give-use-the-plugin-that-adds-it-first)
shows both errors in full.

A plugin that takes options is a function around `definePlugin`:

```ts
export const tenantOf = (tenants: Map<string, Tenant>) =>
	definePlugin<{ user: { tenantId: string } }>()((app) =>
		app.derive(({ user }) => ({ tenant: tenants.get(user.tenantId) ?? null })),
	);
```

When the plugin calls back into code the app writes, let the app name the
requirement. `@alxia/rate-limit`'s `key` works this way:

```ts
import { type BaseContext, definePlugin, type Empty } from '@alxia/core';

export const audit = <Requires extends object = Empty>(
	who: (ctx: BaseContext & Requires) => string,
) =>
	definePlugin<Requires>()((app) =>
		app.wrap(async (ctx, next) => {
			const response = await next();
			console.log(who(ctx), ctx.route, response.status);
			return response;
		}),
	);

app.use(auth).use(audit<{ user: User }>(({ user }) => user.id));
```

A key that may be absent is optional: `definePlugin<{ user?: User }>()`
reads `user` as `User | undefined`, and any app may use it, so long as a
`user` it gives is a `User`.

### What the check does not see

- **What is chained on after `definePlugin` returns.** The requirement is
  carried by the value `definePlugin` returns. `tenant.get('/x', …)` is a
  plain app again, and `use` no longer checks it. Declare everything inside
  `build`.
- **A context that is a type parameter.** In
  `<C extends { user: User }>(app: Alxia<C>) => app.use(tenant)`, TypeScript
  defers the check and refuses the call, even though the bound gives a
  `user`. Type the host with a concrete context, or as `AnyAlxia`, which is
  not checked at all.

`definePlugin()` with no `Requires` builds a plugin any app may use, the
same as `alxia()`.

`ContextOf<typeof tenant>` is `BaseContext`, `Requires` and what the plugin
adds: what a route declared after it reads.

### Not global augmentation

alxia does not support `declare module '@alxia/core' { interface Context {
user: User } }`. That would type `user` on every route, including those
declared before the plugin that adds it, and at runtime those routes have
no `user`. `definePlugin` keeps the rule that a route reads only what a
hook declared before it added.

## See also

- [Groups and plugins](groups-and-plugins.md): what `use` mounts, and the
  helpers `withHeaders`, `vary` and `check`.
- [Hooks](hooks.md): what each hook does, and its order.
- [The app's type](types.md): `ContextOf` and `RoutesOf`.
