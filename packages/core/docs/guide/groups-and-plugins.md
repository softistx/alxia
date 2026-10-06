# Groups and plugins

This page covers splitting an app: route files that read the app's context
with `defineRoutes`, several apps built on one base with `fork()`, groups
that scope middlewares to some routes, `use` giving middlewares to the app,
an app given to `plugin` bringing its routes and typed context, and a
function plugin, given to `plugin` too, adding lifecycle hooks. What other
packages call plugins — a logger, CORS, a bearer check — are middlewares,
given to `use`.

```ts
import { alxia } from '@alxia/core';

const auth = alxia().derive(({ request }) => ({
	user: request.headers.get('x-user') ?? 'anonymous',
}));

const posts = alxia({ prefix: '/posts' }).get('/:id', ({ params, reply }) =>
	reply(200, { id: params.id }),
);

const app = alxia({ prefix: '/api' })
	.plugin(auth)
	.plugin(posts)                                    // GET /api/posts/:id
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

export const app = base.plugin(todos); // GET /todos, POST /todos
```

- **`defineRoutes(prefix?)`** is `alxia({ prefix })` at runtime: a plugin,
  mounted by `plugin` as any app is. Its type starts from the registered
  context, and it carries that context as its requirement through every
  route, `derive`, `use` and `plugin` declared on it. Given a prefix, it
  is a group once mounted: its `use()` middlewares run on its routes and on
  the requests no route matches under its prefix, never on `/public` after
  it — `defineRoutes('/todos').use(requireAdmin)` guards `/todos` alone.
- **`plugin` checks the requirement.** Mounting the routes on an app that
  does not give the context — `alxia().plugin(todos)`, `alxia().plugin(() =>
  todos)`, `alxia().group(() => todos)`, or `base` before the `derive`
  that adds `user` — is the compile error of
  [a plugin that needs an earlier one](writing-a-plugin.md#a-plugin-that-needs-an-earlier-one).
- **Spec first, the same way.** `defineRoutes().route(operations.listTodos,
  handler)`: an operation's path is already whole, so give no prefix.
- **Register `base`, not `app`.** `app` mounts `todos`, whose type reads
  `Register`: registered, `app` would be typed by itself, `TS7022`
  ([The app's type](types.md#register-and-appcontext)).

### Several apps on one base: `fork()`

Every method of an app declares on that app and returns it: `use`,
`derive`, `decorate`, `plugin`, `group`, a route, a lifecycle hook. So
`base.use(x).plugin(todos)` is `base` with `x` and the routes added, not a
new app. Built on twice — the real app and a spec's, or two variants — the
base gets both builds, and the second `plugin(todos)` throws
[`GET /todos is declared twice`](../troubleshooting.md#get--is-declared-twice).

Build each app on `base.fork()`: a copy of the base — its routes, its
middlewares and `derive`s in force, its lifecycle hooks and parsers, its
options — typed as the base is, so `Register`'s `typeof base` and
`defineRoutes` read it unchanged. What a fork declares next is its own: a
route, a middleware, a plugin or an `onStop` added to one fork is not on
the base nor on another fork, and each app runs the base's `onStart` and
`onStop` once, as its own: `onStop` is given that app's server, or
`undefined` for a fork that never listened, so a hook the forks share can
tell them apart ([Hooks](hooks.md#onstart-and-onstop)).

```ts
// src/app.ts
import { base } from './context';
import { todos } from './routes/todos';

export const app = base.fork().plugin(todos);
```

```ts
// src/todos.spec.ts
import { expect, test } from 'bun:test';
import { defineMiddleware } from '@alxia/core';
import { base } from './context';
import { todos } from './routes/todos';

const fakeSession = defineMiddleware((_ctx, next) => next({ user: { id: 'ada' } }));
const testApp = base.fork().use(fakeSession).plugin(todos); // app is untouched

test('lists the todos', async () => {
	expect((await testApp.request('/todos')).status).toBe(200);
});
```

An app built once needs no fork: `export const app = base.plugin(todos)`
is the app. A fork copies what the base holds when it is called; what the
base declares after it does not reach the fork. Forking an app of 50 routes
takes about as long as declaring them. The app a group's build is given
is not forked: it shares the app's lifecycle hooks, so `fork()` there
throws; fork the app the group is declared on.

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

`build` receives a child app under the prefix, with every middleware,
`derive` and `decorate` declared before the group. What it adds —
middlewares, context — stays inside; its routes join the app.

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

The types follow: `/admin/stats` reads `role` as the group's derive gives it,
`/public` as `decorate` does.

### Middlewares in a group

`use(...middlewares)` in a group runs them on the group's routes declared
after it, and types what they add there alone: it is how a subtree's
context is added to. They stay under the group's prefix: they run on its
routes and on a request no route matches under it, before its 404 or 405 —
a guarded group answers `DELETE /admin/secret` with its 401, not a 405
whose `Allow` tells what is there — and never on a route declared after
the group, nor on a request outside it. A group without a prefix of its
own adds none to a 404, and still guards the 405 or 426 at its routes'
paths: `DELETE /secret` on its guarded `GET /secret` is its guard's 401
([Middleware: which chain a 405 runs](middleware.md#which-chain-a-405-runs)).
`use(path, ...middlewares)` guards a subtree without
a group, on the app it also answers a missing path under it, and its
middlewares may add nothing
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
A group's lifecycle hooks (`onStart`, `onStop`) and body parsers are the
app's: they apply everywhere, as they would declared outside it.

## Plugins

A plugin is either an **app** or a **function**, mounted by
`app.plugin(…)`. Middlewares go to `use`
([Middleware: `use`](middleware.md#use-for-every-request-after-it)), the
packages' included: `app.use(logger())`.

| | Adds | Type of the app after it |
| --- | --- | --- |
| middlewares, `use(auth)`, `use(path, guard)` | middlewares for every request: the routes declared after it, and a request no route matches | grows by what they add; `use(path, …)` adds nothing |
| an app, `plugin(otherApp)` | routes, middlewares, context, its [`bodyLimit()`](routes.md#body-size-bodylimit) | grows by its context; unchanged for an app with a prefix of its own, whose middlewares stay under it |
| a function, `plugin(fn)` | lifecycle hooks, parsers | unchanged |

`plugin` throws where it is called when a function given to it returns
anything but an app (a promise it returned is left handled), and for more
than one argument, or a value that is neither an app nor a function: a
middleware goes to `use`. `use` throws, in turn, when it is given an app
([Troubleshooting](../troubleshooting.md#building-the-app)). Both were
accepted, deprecated, in 0.4 ([Upgrading](../upgrading.md#050)).

The app's own `bodyLimit()` does not reach an app plugin's routes: they
keep the limit they were declared with ([Routes](routes.md#body-size-bodylimit)).

### An app as a plugin

```ts
plugin(plugin: Alxia<PluginCtx, PluginPrefix>): Alxia<…>
```

- Its **routes** are mounted under this app's prefix and behind this app's
  middlewares declared so far: `alxia({ prefix: '/api' }).plugin(posts)`
  serves `posts`' `/posts/:id` at `/api/posts/:id`.
- Its **`derive`s and middlewares**, when it has no prefix of its own,
  then apply to the routes declared on this app after `plugin`: an `auth`
  plugin can be a `plugin(auth)` and nothing else. They become this app's,
  so they also run on a request no route matches — an `auth` that answers
  401 answers it to a missing path too.
- **With a prefix of its own**, `alxia({ prefix: '/todos' })` or
  `defineRoutes('/todos')`, it is a group once mounted: its `derive`s and
  middlewares run on its routes and on the requests no route matches under
  its prefix, never on the routes declared after `plugin`, and add nothing
  to their context.
- A path it gave `use` moves under this app's prefix, as its routes do:
  `alxia({ prefix: '/api' }).plugin(alxia().use('/admin', guard).get('/:section/panel', …))`
  guards `/api/admin/panel`, and so does the same plugin in
  `group('/api', (api) => api.plugin(…))`.
- An error its routes throw that none of its middlewares catches goes on
  to this app's middlewares around them, then to the route boundary: an
  `HttpError` with its status and body, anything else a 500. A middleware
  that catches a refusal, given before the `validate`, answers it in its
  own format ([Routes](routes.md#refusals-in-your-own-format)).
- Its lifecycle hooks, body parsers and [pages](static-files.md#bun-html-bundles)
  become this app's.

**A plugin is read once, when `plugin` is called.** A route added to it
afterwards is not mounted: declare it completely first.

```ts
// rate-limit.ts — an app plugin that answers 429
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
	.plugin(rateLimit(100))
	.get('/search', ({ reply }) => reply(200, []));     // 429 past the limit
```

### A function plugin

```ts
type Plugin = <App extends AnyAlxia>(app: App) => App;
```

A function given the app that returns it, with lifecycle hooks (`onStart`,
`onStop`) or a body parser added. Its type is unchanged, so it composes
anywhere in the chain. It must return
the app: `plugin` throws on `undefined`, a promise or anything else.

```ts
plugin<Result extends AnyAlxia>(plugin: (app: App) => Result): Result
```


```ts
import { alxia, type Plugin } from '@alxia/core';

const closing =
	(pool: { end(): Promise<void> }): Plugin =>
	(app) =>
		app.onStop(() => pool.end());

const app = alxia()
	.get('/a', ({ reply }) => reply(200, 'a'))
	.plugin(closing(pool)); // closed when the app stops
```

A function plugin must only add what the app's type does not carry:
lifecycle hooks and parsers. A middleware needs no plugin — a `(ctx, next)`
function, typed with `defineMiddleware` when it is shared: export it, and
give it to `use`: its place in the order is then yours to choose. What adds context or routes is an app plugin.

### A plugin that needs an earlier one

`definePlugin<Requires>()` builds an app plugin that reads what an earlier
plugin added, such as a `user`. `plugin` refuses it at compile time on an app
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
| `joinPath` | `<Prefix extends string, Path extends string>(prefix: Prefix, path: Path) => JoinPath<Prefix, Path>` | a path under a prefix, as `alxia({ prefix })`, `group`, `use` and `plugin` join them: `/` under `/api` is `/api`, and `''` leaves the path as it is |
| `shapeOf` | `(path: string) => string` | the path with its parameter names erased, as the router compares two paths: `'/pets/:'` for `/pets/:id` and `/pets/:petId` alike. Only a whole `:name` segment is a parameter, and a `:` anywhere else throws. Throws the `TypeError` of [Paths](routes.md#paths) for a path no route may be declared at |

```ts
import { alxia, check, defineMiddleware, settle, vary, withHeaders } from '@alxia/core';
import { z } from 'zod';

// a compression-style middleware: every response varies by Accept-Encoding
const varyOnEncoding = defineMiddleware(async (ctx, next) =>
	withHeaders(await settle(ctx, next()), (headers) => vary(headers, 'Accept-Encoding')),
);

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
- [Hooks](hooks.md): `derive`, `decorate`, `onStart`, `onStop` and `parser`.
- [The app's type](types.md): what `use` and `plugin` add to the context, `ContextOf`.
