# Groups and plugins

This page covers splitting an app: route files that read the app's context
with `defineRoutes`, groups that scope hooks and middlewares to some
routes, `use` giving middlewares to the routes after it, an app given to
`use` bringing its routes and typed context, and a function plugin adding
global hooks.

```ts
import { alxia } from '@alxia/core';

const auth = alxia().derive(({ request }) => ({
	user: request.headers.get('x-user') ?? 'anonymous',
}));

const posts = alxia({ prefix: '/posts' }).get('/:id', ({ params, reply }) =>
	reply(200, { id: params.id }),
);

const app = alxia({ prefix: '/api' })
	.use(auth)
	.use(posts)                                       // GET /api/posts/:id
	.get('/me', ({ user, reply }) => reply(200, user)); // GET /api/me, ctx.user typed
```

## Splitting the app across files

Put what builds the context in one file, the base, and register it; each
file of routes then starts from that context with `defineRoutes`, and
imports `@alxia/core` alone:

```ts
// src/context.ts
import { alxia } from '@alxia/core';

export const base = alxia()
	.decorate({ db })
	.derive(async ({ request, reply }) => {
		const user = await session(request);
		return user ? { user } : reply(401, { error: 'unauthorized' as const });
	});

declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}
```

```ts
// src/routes/todos.ts
import { defineRoutes, validate } from '@alxia/core';

export const todos = defineRoutes('/todos')
	.get('/', ({ db, user, reply }) => reply(200, db.todos.of(user.id)))
	.post('/', validate({ body: NewTodo }), ({ db, user, body, reply }) =>
		reply(201, db.todos.add(user.id, body)),
	);
```

```ts
// src/app.ts
import { base } from './context';
import { todos } from './routes/todos';

export const app = base.use(todos); // GET /todos, POST /todos
```

- **`defineRoutes(prefix?)`** is `alxia({ prefix })` at runtime: a plugin,
  mounted by `use` as any app is. Its type starts from the registered
  context, and it carries that context as its requirement through every
  route, `derive` and `use` declared on it.
- **`use` checks the requirement.** Mounting the routes on an app that
  does not give the context — `alxia().use(todos)`, `alxia().use(() =>
  todos)`, `alxia().group(() => todos)`, or `base` before the `derive`
  that adds `user` — is the compile error of
  [a plugin that needs an earlier one](writing-a-plugin.md#a-plugin-that-needs-an-earlier-one).
- **Spec first, the same way.** `defineRoutes().route(operations.listTodos,
  handler)`: an operation's path is already whole, so give no prefix.
- **Register `base`, not `app`.** `app` mounts `todos`, whose type reads
  `Register`: registered, `app` would be typed by itself, `TS7022`
  ([The app's type](types.md#register-and-appcontext)).

Without `Register`, `defineRoutes` starts from `BaseContext` and requires
nothing, and a file of routes can still export an app of its own, as
`posts` above, or a [`definePlugin`](writing-a-plugin.md#a-plugin-that-needs-an-earlier-one)
naming what it reads.

## Prefixes

```ts
alxia({ prefix: '/api' });
```

Prepended to every route declared on the app. It must start with `/` and
not end with one; otherwise `alxia()` throws
`The prefix "api/" must start with "/" and not end with one`. A route at
`/` under a prefix is the prefix itself: `/api`, not `/api/`.

## Groups

```ts
group(prefix, build): Alxia<…>
group(build): Alxia<…>          // a scope, without a prefix
```

`build` receives a child app under the prefix, with every route hook
declared before the group. What it adds — hooks, context, replies — stays
inside; its routes join the app.

```ts
const app = alxia()
	.decorate({ role: 'guest' as string })
	.group('/admin', (admin) =>
		admin
			.derive(({ request, reply }) =>
				request.headers.get('x-admin') === 'yes'
					? { role: 'admin' }
					: reply(403, { error: 'forbidden' as const }),
			)
			.get('/stats', ({ role, reply }) => reply(200, { role })),
	)
	.get('/public', ({ role, reply }) => reply(200, { role }));

// GET /admin/stats → 403, or {"role":"admin"} with x-admin: yes
// GET /public      → {"role":"guest"}: the group's derive does not reach it
```

The types follow: `/admin/stats` may answer the 403, `/public` may not.

### Middlewares in a group

`use(...middlewares)` in a group runs them on the group's routes declared
after it, and types what they add there alone: it is how a subtree's
context is added to. `use(path, ...middlewares)` guards a subtree without
a group, but its middlewares may add nothing
([Middleware: `use(path, …)`](middleware.md#use-with-a-path)).

```ts
import { alxia, defineMiddleware } from '@alxia/core';

const auth = defineMiddleware(({ request, reply }, next) => {
	const id = request.headers.get('x-user');
	return id ? next({ user: { id } }) : reply(401, { error: 'unauthenticated' as const });
});
const noBots = defineMiddleware(({ request, reply }, next) =>
	request.headers.get('user-agent')?.includes('bot') ? reply(403, { error: 'no bots' as const }) : next(),
);

const app = alxia({ prefix: '/api' })
	.use('/admin', noBots) // /api/admin and under: the path is joined to the prefix
	.group('/admin', (admin) =>
		admin.use(auth).get('/me', ({ user, reply }) => reply(200, user)), // noBots, auth, handler
	)
	.get('/public', ({ reply }) => reply(200, 'open')); // neither
```

A path given to `use` in a group is joined to the group's prefix:
`group('/v1', (v1) => v1.use('/admin', guard))` guards `/v1/admin`.

`build` must return the chain it was given — `(admin) => admin.get(…)`.
A group's global hooks (`onRequest`, `onResponse`, …) are the app's: they
apply everywhere, as they would declared outside it.

## Plugins

A plugin is either an **app** or a **function**. `use` reads a function
made by `defineMiddleware` as a middleware
([Middleware: `use`](middleware.md#use-for-every-route-after-it)); any other function is
a plugin.

| | Adds | Type of the app after `use` |
| --- | --- | --- |
| middlewares, `use(auth)`, `use(path, guard)` | middlewares for the routes declared after it | grows by what they add; `use(path, …)` adds nothing |
| an app, `use(otherApp)` | routes, route hooks, context, typed replies, global hooks, its [`bodyLimit()`](routes.md#body-size-bodylimit) | grows: its routes and context are added |
| a function, `use(plugin)` | global hooks | unchanged |

The app's own `bodyLimit()` does not reach an app plugin's routes: they
keep the limit they were declared with ([Routes](routes.md#body-size-bodylimit)).

### An app as a plugin

```ts
use(plugin: Alxia<PluginCtx, PluginPrefix, PluginShortcuts>): Alxia<…>
```

- Its **routes** are mounted under this app's prefix and behind this app's
  route hooks declared so far: `alxia({ prefix: '/api' }).use(posts)`
  serves `posts`' `/posts/:id` at `/api/posts/:id`.
- Its **route hooks and middlewares** then apply to the routes declared on
  this app after `use`: an `auth` plugin can be a `use(auth)` and nothing
  else. A path it gave `use` is joined to this app's prefix, as its routes
  are.
- Its **`onError` hooks** are tried before this app's, for its own routes.
- Its **`onRefusal` hook** answers its own routes' refused requests. Its
  routes without one take this app's, declared before `use`. The plugin's
  hook then replaces this app's for the routes declared after `use`
  ([Hooks](hooks.md#onrefusal)). A plugin's hook of one kind,
  `onRefusal('validation', …)`, answers that kind before this app's hooks
  of that kind, and replaces this app's hook of that kind alone after `use`
  ([One hook per kind](hooks.md#one-hook-per-kind)).
- Its **global hooks**, body parsers and [pages](static-files.md#bun-html-bundles)
  become this app's.

**A plugin is read once, when `use` is called.** A route added to it
afterwards is not mounted: declare it completely first.

```ts
// rate-limit.ts — an app plugin with a typed reply
import { alxia } from '@alxia/core';

const hits = new Map<string, number>();

export const rateLimit = (limit: number) =>
	alxia().derive(({ ip, reply }) => {
		const count = (hits.get(ip ?? '') ?? 0) + 1;
		hits.set(ip ?? '', count);
		return count > limit ? reply(429, { error: 'too_many_requests' as const }) : undefined;
	});

// app.ts
const app = alxia()
	.get('/health', ({ reply }) => reply(200, 'ok'))  // not limited
	.use(rateLimit(100))
	.get('/search', ({ reply }) => reply(200, []));     // may answer 429
```

### A function plugin

```ts
type Plugin = <App extends AnyAlxia>(app: App) => App;
```

A function given the app that returns it, with global hooks added. Its
type is unchanged, so it composes anywhere in the chain:

```ts
import { alxia, type Plugin, withHeaders } from '@alxia/core';

const poweredBy =
	(name: string): Plugin =>
	(app) =>
		app.onResponse((response) =>
			withHeaders(response, (headers) => headers.set('x-powered-by', name)),
		);

const app = alxia()
	.get('/a', ({ reply }) => reply(200, 'a'))
	.use(poweredBy('alxia'));
```

A function plugin must only add **global** hooks: a route hook it added
would not be in the app's type. What adds context or replies is an app
plugin.

### A plugin that needs an earlier one

`definePlugin<Requires>()` builds an app plugin that reads what an earlier
plugin added, such as a `user`. `use` refuses it at compile time on an app
whose context does not give `Requires`. See
[Writing a plugin](writing-a-plugin.md#a-plugin-that-needs-an-earlier-one).

## For plugin authors

Plugins use the core's public API, and five helpers are exported for
them:

| Export | Signature | For |
| --- | --- | --- |
| `withHeaders` | `(response: Response, edit: (headers: Headers) => void) => Response` | editing a response's headers, copying it when they are immutable; an error of `edit` is thrown with the body unread (on a mutable response, headers set before it stay); on immutable headers `edit` runs twice, so keep it free of side effects |
| `vary` | `(headers: Headers, value: string) => void` | adding to `Vary` once, leaving `*` alone; `*` itself replaces every name, and an empty name adds nothing |
| `check` | `(schema: StandardSchemaV1, value: unknown, target: ValidationTarget) => Promise<Checked>` | running a schema as a route does: its output, or its issues |
| `joinPath` | `<Prefix extends string, Path extends string>(prefix: Prefix, path: Path) => JoinPath<Prefix, Path>` | a path under a prefix, as `alxia({ prefix })`, `group` and `use` join them: `/` under `/api` is `/api`, and `''` leaves the path as it is |
| `shapeOf` | `(path: string) => string` | the path with its parameter names erased, as the router compares two paths: `'/pets/:'` for `/pets/:id` and `/pets/:petId` alike. Only a whole `:name` segment is a parameter, and a `:` anywhere else throws. Throws the `TypeError` of [Paths](routes.md#paths) for a path no route may be declared at |

```ts
import { alxia, check, type Plugin, vary, withHeaders } from '@alxia/core';
import { z } from 'zod';

// a compression-style plugin: the response varies by Accept-Encoding
const varyOnEncoding: Plugin = (app) =>
	app.onResponse((response) => withHeaders(response, (headers) => vary(headers, 'Accept-Encoding')));

// a plugin reading a header the way a route would, answering the same 400
const Tenant = z.object({ 'x-tenant': z.string().min(1) });
const tenant = alxia().derive(async ({ request, reply }) => {
	const checked = await check(Tenant, Object.fromEntries(request.headers), 'headers');
	return checked.ok
		? { tenant: (checked.value as z.output<typeof Tenant>)['x-tenant'] }
		: reply(400, { error: 'validation' as const, issues: checked.issues });
});
```

A tool that reads `app.routes` — `@alxia/openapi`'s `matchesSpec` is one — looks a
path up as the core declares and matches it:

```ts
import { alxia, joinPath, shapeOf } from '@alxia/core';

const app = alxia({ prefix: '/api' }).get('/pets/:id', ({ params, reply }) => reply(200, params.id));

// does the app serve GET /pets/:petId, written without the prefix?
const wanted = shapeOf(joinPath('/api', '/pets/:petId'));
app.routes.some((route) => route.method === 'GET' && shapeOf(route.path) === wanted); // true

shapeOf('pets'); // throws: The route path "pets" must start with "/"
```

```ts
type Checked =
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly issues: ValidationIssue[] };
```

`AnyAlxia` types any app, whatever it holds — a function that takes an app
of any shape.

## See also

- [Middleware: which way to use](middleware.md): every way to run code
  around routes, side by side, and the order a request runs them in.
- [Writing a plugin](writing-a-plugin.md): choosing between an app, a
  `Plugin` function and `definePlugin`, with an example of each.
- [Hooks](hooks.md): what each hook does.
- [The app's type](types.md): what `use` adds to the context, `ContextOf`.
