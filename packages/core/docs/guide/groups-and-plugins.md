# Groups and plugins

This page covers splitting an app: groups scope hooks to some routes, an
app given to `use` brings its routes and typed context, and a function
plugin adds global hooks.

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

`build` must return the chain it was given — `(admin) => admin.get(…)`.
A group's global hooks (`onRequest`, `onResponse`, …) are the app's: they
apply everywhere, as they would declared outside it.

## Plugins

A plugin is either an **app** or a **function**.

| | Adds | Type of the app after `use` |
| --- | --- | --- |
| an app, `use(otherApp)` | routes, route hooks, context, typed replies, global hooks | grows: its routes and context are added |
| a function, `use(plugin)` | global hooks | unchanged |

### An app as a plugin

```ts
use(plugin: Alxia<PluginCtx, PluginRoutes, PluginPrefix, PluginShortcuts>): Alxia<…>
```

- Its **routes** are mounted under this app's prefix and behind this app's
  route hooks declared so far: `alxia({ prefix: '/api' }).use(posts)`
  serves `posts`' `/posts/:id` at `/api/posts/:id`.
- Its **route hooks** then apply to the routes declared on this app after
  `use`: an `auth` plugin can be a `derive` and nothing else.
- Its **`onError` hooks** are tried before this app's, for its own routes.
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
	.get('/search', ({ reply }) => reply(200, []));     // may answer 429, and its client knows
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

## For plugin authors

Plugins use the core's public API, and three helpers are exported for
them:

| Export | Signature | For |
| --- | --- | --- |
| `withHeaders` | `(response: Response, edit: (headers: Headers) => void) => Response` | editing a response's headers, copying it when they are immutable |
| `vary` | `(headers: Headers, value: string) => void` | adding to `Vary` once, leaving `*` alone |
| `check` | `(schema: StandardSchemaV1, value: unknown, target: ValidationTarget) => Promise<Checked>` | running a schema as a route does: its output, or its issues |

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

```ts
type Checked =
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly issues: ValidationIssue[] };
```

`AnyAlxia` types any app, whatever it holds — a function that takes an app
of any shape.

## See also

- [Hooks](hooks.md): what each hook does.
- [The app's type](types.md): what `use` and `group` add to `RoutesOf`.
