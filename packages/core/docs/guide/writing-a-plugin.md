# Writing a plugin

This page covers the three ways to write a plugin, and when to use each:

| Write | When the plugin | Example |
| --- | --- | --- |
| [an app](#an-app-plugin) | adds context, routes or typed replies | an `auth` that derives `user` |
| [a `Plugin` function](#a-plugin-function) | adds global hooks only, the app's type unchanged | a header on every response |
| [`definePlugin<Requires>()`](#a-plugin-that-needs-an-earlier-one) | reads what an earlier plugin added | a tenant scope that reads `user` |

Whichever you write, a plugin uses the core's public API only, and the app
mounts it with `app.plugin(…)`. The mechanics of `plugin` itself —
prefixes, the order of `onError`, global hooks — are in
[Groups and plugins](groups-and-plugins.md#plugins). A middleware, which
runs on requests, is no plugin: it is made by `defineMiddleware` and given
to `use` ([Middleware](middleware.md#use-for-every-route-after-it)).

## An app plugin

An app is a plugin. What it declares is mounted on the app that mounts it,
and its types come with it:

- its route hooks (`derive`, `decorate`, `wrap`, `onError`, `onRefusal`) apply to the
  routes declared after `plugin`, and what they add is typed on them;
- its routes are mounted under the app's prefix, behind the hooks declared
  before `plugin`;
- its hooks' replies — a 401, a 429 — may answer every route after it.

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
	.plugin(auth)
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

app.plugin(requireRole('admin')).get('/stats', handler);
```

`plugin` reads the app once, when it is called: declare it completely first.

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
	.plugin(poweredBy('alxia')); // global: it applies to `/` too
```

A `Plugin` returns the app it is given: `plugin` throws on `undefined`, a
promise or anything else that is not an app. Add only global hooks here. A `derive` added by a `Plugin` would run, but
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
- The result is an app, given to `plugin` like any other. `plugin` checks the
  app's context against `Requires` at compile time, so the plugin's hooks
  never run without what they read.

```ts
const app = alxia()
	.plugin(auth)   // adds user: User
	.plugin(tenant) // compiles: User has a tenantId
	.get('/tenant', ({ tenant, reply }) => reply(200, tenant)); // tenant: Tenant | null

alxia().plugin(tenant);
// error: the plugin reads "user", which this app's context does not give: add the plugin or middleware that gives it first
```

The order matters, as everywhere in alxia. `alxia().plugin(tenant).plugin(auth)`
is refused too: when `tenant` is mounted, no `user` has been added yet.

An app whose `user` has another type, such as `User | null` from an
optional session, gets the second message:

```text
the plugin reads "user", which this app's context gives with another type
```

[Troubleshooting](../troubleshooting.md#the-plugin-reads--which-this-apps-context-does-not-give-add-the-plugin-or-middleware-that-gives-it-first)
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

app.plugin(auth).plugin(audit<{ user: User }>(({ user }) => user.id));
```

Or infer it from the callback's annotation, so the app writes no type
argument: `RequiresOf<Ctx>` is what the annotation adds to `BaseContext`.
`@alxia/language`'s `resolve` and `@alxia/janus`'s `load` work this way:

```ts
import { type BaseContext, definePlugin, type RequiresOf } from '@alxia/core';

export const audit = <Ctx extends object = BaseContext>(
	who: (ctx: BaseContext & Ctx) => string,
) =>
	definePlugin<RequiresOf<Ctx, 'who'>>()((app) =>
		app.wrap(async (ctx, next) => {
			const response = await next();
			// `plugin` has checked that the app gives what `who` reads.
			console.log((who as (ctx: BaseContext) => string)(ctx), ctx.route, response.status);
			return response;
		}),
	);

app.plugin(auth).plugin(audit(({ user }: BaseContext & { user: User }) => user.id));
app.plugin(audit((ctx) => ctx.ip ?? 'unknown')); // unannotated: requires nothing
```

| `Ctx`, the annotation | `RequiresOf<Ctx>` |
| --- | --- |
| none — `Ctx` defaults to `BaseContext` | `Empty`: any app may use the plugin |
| `BaseContext & { user: User }`, or `{ user: User }` | `{ user: User }` |
| `{ url: string }`, a `BaseContext` key with a type it does not give | `{ url: string }`, so `plugin` refuses it |
| `unknown` or `object` | `Empty`: the callback reads no key without a check of its own |
| `Record<string, unknown>` | `{ [x: string]: unknown }`, a key no app's context gives, so `plugin` refuses it |
| `any`, or `Record<string, any>` | a requirement `plugin` refuses on every app, with [`the plugin's who reads its context as any: annotate what it reads, or leave it unannotated`](../troubleshooting.md#the-plugins--reads-its-context-as-any-annotate-what-it-reads-or-leave-it-unannotated) |

The second type argument names the callback in that message; it is
`'callback'` when omitted. An `any` annotation would otherwise require
nothing, and the check would be off without a word.

A refusal prints the requirement itself, `{ user: User; }`, never
`RequiresOf<…>`.

A key that may be absent is optional: `definePlugin<{ user?: User }>()`
reads `user` as `User | undefined`, and any app may use it, so long as a
`user` it gives is a `User`.

### What the check does not see

- **What is chained on after `definePlugin` returns.** The requirement is
  carried by the value `definePlugin` returns. `tenant.get('/x', …)` is a
  plain app again, and `plugin` no longer checks it. Declare everything inside
  `build`.
- **A context that is a type parameter.** In
  `<C extends { user: User }>(app: Alxia<C>) => app.plugin(tenant)`, TypeScript
  defers the check and refuses the call, even though the bound gives a
  `user`. Type the host with a concrete context, or as `AnyAlxia`, which is
  not checked at all.

`definePlugin()` with no `Requires` builds a plugin any app may use, the
same as `alxia()`.

`ContextOf<typeof tenant>` is `BaseContext`, `Requires` and what the plugin
adds: what a route declared after it reads.

### Register the base, not a key

alxia does not support `declare module '@alxia/core' { interface Context {
user: User } }`. That would type `user` on every route, including those
declared before the plugin that adds it, and at runtime those routes have
no `user`.

What an app registers instead is the chain that builds its context, `base`
([The app's type](types.md#register-and-appcontext)):

```ts
declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}
```

That is sound where the key was not, because nothing reads it unchecked:

- **No route reads it by default.** `alxia()` and `defineMiddleware(fn)`
  still start from `BaseContext`, and a route reads only what was added
  before it.
- **What reads it requires it.** `defineRoutes()` carries the registered
  context as a requirement, like `definePlugin`'s, so `plugin` refuses it
  on an app that does not give it yet; so does `plugin` for
  `contextStorage()`, and `use` for `defineMiddleware<AppContext>()`.
- **It names a real chain.** The type is `typeof base`, what `decorate`,
  `derive`, `use` and `plugin` built, not a key written by hand that no hook has to
  match.

A plugin published for several apps should not read `Register`: each app
registers its own base, and the plugin cannot know it. Name what it reads
with `definePlugin<Requires>()`, as above.

## See also

- [Groups and plugins](groups-and-plugins.md): what `plugin` mounts, and the
  helpers `withHeaders`, `vary` and `check`.
- [Hooks](hooks.md): what each hook does, and its order.
- [The app's type](types.md): `ContextOf`.
