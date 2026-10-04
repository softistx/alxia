# Middleware: which way to use

This page is a map of every way to run code around routes in alxia: what
each is for, where it applies, when it runs, and what it adds to a route's
type. The details of each live on [Hooks](hooks.md),
[Groups and plugins](groups-and-plugins.md) and [Replies](replies.md).

```ts
import { alxia, withHeaders } from '@alxia/core';
import { z } from 'zod';

const sessions = new Map([['s1', { id: 'u1', name: 'Ada' }]]);

const app = alxia()
	.onResponse((response) => withHeaders(response, (headers) => headers.set('x-content-type-options', 'nosniff'))) // every response
	.get('/health', ({ reply }) => reply(200, 'ok')) // before the derive: not guarded
	.derive(({ cookies, reply }) => {
		const user = sessions.get(cookies['sid'] ?? '');
		return user ? { user } : reply(401, { error: 'unauthenticated' as const });
	})
	.post('/notes', { body: z.object({ title: z.string().min(1) }) }, ({ user, body, reply }) =>
		reply(201, { title: body.title, owner: user.id }),
	);
// POST /notes without a session → 401, before the body is read; with one → 201, or 400 for a bad body
```

## Which way

| Way | For | Applies to | Runs | Can end the request | Enters the route's type |
| --- | --- | --- | --- | --- | --- |
| [`decorate(values)`](#decorate) | a database, a logger, a config | the routes declared after it | before validation | no | its values, in the context; nothing for the client |
| [`derive(hook)`](#derive) | authenticating, loading what routes read | the routes declared after it | before validation | yes, with a reply | what it adds, in the context; its replies, for the client. Not in OpenAPI |
| [`wrap(hook)`](#wrap) | a transaction, a lock, an idempotency key, a header from the response | the routes declared after it | around validation and the handler | yes, with a reply, or any `Response` | its replies, for the client. Not in OpenAPI. A raw `Response`, nowhere |
| [A route's own hooks](#a-routes-own-hooks), `app.patch(path, [canView, canEdit], …)` | a check that belongs to one route, written once with `defineHook` or `defineWrap` | one route | after the scope's hooks, in the order listed, before validation | yes, with a reply; a `defineWrap`, any `Response` | what it adds, in that route's context; its replies, for that route's client. Not in OpenAPI |
| [`bodyLimit(bytes)`](#bodylimit), or a route's `bodyLimit` | capping a request body | the routes declared after it, or one route | whenever the body is read | yes, a 413 | the 413, for the client and in OpenAPI |
| [`onRefusal(hook)`](#onrefusal) | answering a 400 or a 413 in your own format | the routes declared after it | when validation or the body limit refuses | yes, with a 4xx reply | its replies, for the client; a `4XX` with no body in OpenAPI |
| `onRefusal(schema, hook)` | the same, documented | the routes declared after it | as above | yes, with a 4xx reply | its replies, for the client and in OpenAPI |
| `onRefusal(kind, [schema,] hook)` | one kind of refusal, `'validation'` or `'body_limit'` | the routes declared after it that may be refused that way | as above | yes, with a 4xx reply | its replies, on the routes that kind may refuse; in OpenAPI when given schemas |
| [`onError(hook)`](#onerror) | turning a thrown error into a reply | the routes declared after it | after something threw | yes, with a reply | its replies, for the client. Not in OpenAPI |
| [`onRequest(hook)`](#onrequest-onresponse-and-around) | a CORS preflight, a redirect to HTTPS | the whole app | before routing | yes, with a raw `Response` | no |
| `onResponse(hook)` | a header on every response, compression | the whole app | after everything else, 404s included | it replaces the response; keep its status | no |
| `around(hook)` | a request id in `AsyncLocalStorage`, a timer, a span | the whole app | outermost | yes, with a raw `Response` | no |
| [`group(build)`](#group) | scoping hooks to some routes | the routes inside it | — | — | what its routes declare |
| [`use(app)`](#use-and-defineplugin), `definePlugin` | routes, hooks and context shared across apps | its routes, then the routes declared after `use` | — | its hooks can | as if written inline |
| `use(plugin)`, a `Plugin` function | global hooks shared across apps | the whole app | — | its hooks can | no |

"Before validation" means the hook runs before the route's schemas read
the request: see [Hooks run before validation](#hooks-run-before-validation).
"Enters the route's type" means [`@alxia/client`](https://www.npmjs.com/package/@alxia/client)
reads the reply among the route's outcomes, and
[`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi) documents
it where the table says so. A hook's reply carries no schema, so the
OpenAPI document cannot describe it: only `bodyLimit` and `onRefusal` with
schemas reach it.

Two rules decide the rest:

- **Order is meaning.** A hook declared on the chain — `decorate`, `derive`,
  `wrap`, `bodyLimit`, `onRefusal`, `onError` — applies to the routes
  declared after it, at runtime and in the types alike. A route declared
  before a `derive` neither runs it nor reads what it adds. A route's own
  list applies to that route alone.
- **Global hooks are global.** `onRequest`, `onResponse` and `around` apply
  to every request wherever they are declared, inside a group or a plugin
  included. What they answer is in no route's type: use them only for what
  a typed client never asks.

## The order of one request

1. **`around`** hooks, the first declared outermost. A WebSocket upgrade
   skips them.
2. **`onRequest`** hooks, in the order declared. A `Response` one returns
   skips to step 10.
3. **Routing.** No route: `404`, `405` or `426`, then step 10.
4. **The scope's route hooks**, in the order declared: the app's, then the
   group's, a plugin's after the hooks of the app that uses it. A `derive`
   or `decorate` runs and adds to the context; a `wrap` calls `next()` to run
   the rest. A reply from any of them ends the request, and the `wrap`s
   around it see it as the response.
5. **The route's own list**, `[canView, canEdit]`, in its order: a
   `defineHook` runs as a `derive` does, a `defineWrap` as a `wrap`.
6. **Validation**: `params`, `query`, `headers`, `cookies`, then `body`.
   A refusal is answered here, inside the `wrap`s: the `onRefusal` hooks of
   its kind, then the general one, then the default 400.
7. **The handler.**
8. **The `wrap`s unwind**, the last declared first. Each sees the response,
   or the error as a rejection of `next()`.
9. **An error nobody caught**, once the `wrap`s have unwound:
   - the client hung up: a bodyless `499`, no hook runs;
   - a body past `bodyLimit`: the `onRefusal` hooks of `body_limit`, then
     the general one, then the default 413;
   - anything else: the `onError` hooks in the order declared, a plugin's
     before the app's, then an `HttpError` as it says, then a logged 500.
10. **`onResponse`** hooks, in the order declared, on every response.
11. **`around`** hooks unwind.

```
around ─┐
        onRequest ─ routing ─ scope hooks ─ route's list ─ validation ─ handler
                                  └─ wrap ─────────────────────────────────┘   ← unwinds here
                              onError / onRefusal(body_limit)                   ← what was thrown
        onResponse
around ─┘
```

A `413` from a body read too far is a refusal wherever the body was read —
a hook, validation or the handler — so it reaches `onRefusal`, not
`onError`. An `onError` reply is sent after the `wrap`s have unwound: a
`wrap` never sees it.

## Hooks run before validation

Every route hook runs before the route's schemas, so it reads the request
as it arrived: strings, never the body. Every hook has `params` and `query`
at runtime, but only a hook of a route's list has them in its type:

| | A hook of a route's list (`defineHook`) | A `derive` or `wrap` on the chain | The handler |
| --- | --- | --- | --- |
| `params` | the path's parameters, strings, typed by the route's path | there at runtime, not in its type: read `pathParams` | the `params` schema's output |
| `pathParams` | the same strings | the same strings | the same strings |
| `query` | the query string, `Record<string, string \| readonly string[]>` | there at runtime, not in its type: read `url.searchParams` | the `query` schema's output |
| `cookies` | the request's cookies, strings | the same | the `cookies` schema's output |
| `body` | never: naming it in `defineHook<…>` does not compile | never | the `body` schema's output |

```ts
import { alxia, type BaseContext } from '@alxia/core';
import { z } from 'zod';

const archived = new Set(['3']);

const app = alxia()
	.derive(({ pathParams, reply }: BaseContext) =>
		archived.has(pathParams['id'] ?? '') ? reply(410, { error: 'archived' as const }) : undefined,
	)
	.patch('/notes/:id', { params: z.object({ id: z.coerce.number().int() }), body: z.object({ title: z.string() }) }, ({ params, body, reply }) =>
		reply(200, { id: params.id, title: body.title }), // params.id: number, body validated
	);
// PATCH /notes/3 with a bad body → 410: the hook answers before the body is checked
```

Three consequences:

- **A refusal from a hook comes before a 400.** A 401 or a 403 from a
  `derive` is sent without reading the body, so a client that is not
  allowed never learns what a valid body looks like.
- **A check that needs the body goes in the handler.** A hook never sees
  the validated body.
- **A hook must not read the body itself.** `await request.json()` in a
  `derive` uses the body up, and validation then fails with
  `TypeError: Body already used`, answered as a 500
  ([Troubleshooting](../troubleshooting.md#typeerror-body-already-used)).

## Reading cookies

Two different maps:

| | What it is | Where |
| --- | --- | --- |
| `ctx.cookies` | the **request's** cookies, parsed from `Cookie` on first read | every route hook and the handler; a route's `cookies` schema gives the handler its output instead |
| `set.cookies` | the **response's** cookies, empty when the request starts | `set.cookies.set(…)` adds a `Set-Cookie`; `get` reads back only what this response set |

```ts
import { alxia } from '@alxia/core';

const sessions = new Map([['s1', 'ada']]);

const app = alxia()
	.derive(({ cookies }) => ({ user: sessions.get(cookies['sid'] ?? '') ?? null })) // the request's
	.post('/sign-out', ({ set, reply }) => {
		set.cookies.delete('sid'); // the response's
		return reply(204);
	});
```

`set.cookies.get('sid')` in a hook is `null`, whatever the request sent.
The detail, and what a `cookies` schema changes, is on
[Hooks](hooks.md#reading-the-requests-cookies) and
[Replies](replies.md#headers-and-cookies-set).

## Each way

### `decorate`

The same values on every request, for every route after it.

```ts
import { alxia } from '@alxia/core';

const app = alxia()
	.decorate({ config: { region: 'eu' } as const })
	.get('/region', ({ config, reply }) => reply(200, config.region));
```

See [Hooks: `decorate`](hooks.md#decorate).

### `derive`

Computes something per request, or ends it. What it returns is typed in
the context after it; a reply it returns is in the type of every route
after it.

```ts
import { alxia } from '@alxia/core';

const tokens = new Map([['Bearer ada', { id: 'u1', role: 'editor' as 'viewer' | 'editor' }]]);

const app = alxia()
	.derive(({ request, reply }) => {
		const user = tokens.get(request.headers.get('authorization') ?? '');
		return user ? { user } : reply(401, { error: 'unauthenticated' as const });
	})
	.get('/me', ({ user, reply }) => reply(200, user));
// the client of /me reads 200 | 401 | 500
```

See [Hooks: `derive`](hooks.md#derive).

### `wrap`

Runs the rest of the route inside it, so it can act after the handler.

```ts
import { alxia } from '@alxia/core';

const app = alxia()
	.wrap(async ({ request, reply }, next) => {
		if (request.headers.get('x-busy') === 'yes') return reply(409, { error: 'busy' as const });
		const response = await next();
		response.headers.set('x-served-by', 'api');
		return response;
	})
	.get('/items', ({ reply }) => reply(200, []));
```

See [Hooks: `wrap`](hooks.md#wrap).

### A route's own hooks

A list of hooks after the route's path, before its schema, each made once
with `defineHook` and named on every route that needs it. They run after
the scope's hooks, in the order listed, and before validation. What one
adds, the hooks after it and the handler read. Its replies join that
route's type alone. `defineHook<Requires>()` names what the hook reads, and
a route that does not give it does not compile:

```ts
import { alxia, defineHook } from '@alxia/core';
import { z } from 'zod';

interface User {
	readonly id: string;
}
interface Note {
	readonly id: string;
	readonly owner: string;
	readonly shared: boolean;
	title: string;
}

const sessions = new Map<string, User>();
const notes = new Map<string, Note>();

const canView = defineHook<{ user: User; params: { id: string } }>()(({ user, params, reply }) => {
	const note = notes.get(params.id);
	return note && (note.shared || note.owner === user.id) ? { note } : reply(404, { error: 'not_found' as const });
});

const canEdit = defineHook<{ user: User; note: Note }>()(({ user, note, reply }) =>
	note.owner === user.id ? undefined : reply(403, { error: 'forbidden' as const }),
);

const app = alxia({ prefix: '/notes' })
	.derive(({ cookies, reply }) => {
		const user = sessions.get(cookies['sid'] ?? '');
		return user ? { user } : reply(401, { error: 'unauthenticated' as const });
	})
	.get('/:id', [canView], ({ note, reply }) => reply(200, note))
	.patch('/:id', [canView, canEdit], { body: z.object({ title: z.string().min(1) }) }, ({ note, body, reply }) => {
		note.title = body.title;
		return reply(200, note);
	});
// PATCH /notes/:id → 401 without a session, 404 for a note it may not see, 403 for someone else's,
// 400 for a bad body, 200 otherwise: in that order, and each in the route's type
```

The `derive` is the scope's: every route after it is authenticated.
`canView` and `canEdit` belong to the routes that list them: `GET` checks
only that the note may be seen. Both run before validation, so a 403 comes
before a 400, and `canView` reads `params.id` as the string it arrived as.

`route(operation, [hooks], handler)` and `ws(path, [hooks], schema, handlers)`
take a list too; `static`, `file` and `page` do not. A list holds at most 8
hooks. `defineWrap`, what `Requires` may name, and when a group's `derive`
says it better are on
[Hooks: hooks on one route](hooks.md#hooks-on-one-route).

### `bodyLimit`

Caps the body of the routes after it, or of one route with its own
`bodyLimit`. A body past it is a 413, or what `onRefusal` answers.

```ts
import { alxia } from '@alxia/core';
import { z } from 'zod';

const Note = z.object({ title: z.string() });

const app = alxia()
	.bodyLimit(64 * 1024)
	.post('/notes', { body: Note }, ({ body, reply }) => reply(201, body))
	.post('/upload', { bodyLimit: 25 * 1024 * 1024 }, async ({ request, reply }) =>
		reply(201, { bytes: (await request.arrayBuffer()).byteLength }),
	);
```

See [Routes: body size](routes.md#body-size-bodylimit).

### `onRefusal`

Answers a request the app refuses before the handler: a body or a parameter
its schemas refuse, or a body past its limit. In general, with schemas, or
per kind:

```ts
import { alxia, problem } from '@alxia/core';
import { z } from 'zod';

const Invalid = z.object({ type: z.string(), status: z.literal(422), detail: z.string() });

const app = alxia()
	.onRefusal((refusal) =>
		refusal.kind === 'body_limit' ? problem({ status: 413, detail: `at most ${refusal.limit} bytes` }) : undefined,
	)
	.onRefusal('validation', { response: { 422: Invalid }, contentType: 'application/problem+json' }, (refusal, { reply }) =>
		reply(422, { type: 'urn:example:invalid', status: 422, detail: `the ${refusal.part} is invalid` }),
	)
	.post('/notes', { body: z.object({ title: z.string() }), bodyLimit: 1024 }, ({ body, reply }) =>
		reply(201, body),
	);
// a bad body → the 422 problem; a body over 1 KiB → the 413 problem
```

See [Hooks: `onRefusal`](hooks.md#onrefusal) and
[One hook per kind](hooks.md#one-hook-per-kind).

### `onError`

Turns an error thrown by the routes after it into a reply. Returning
nothing lets the next one try.

```ts
import { alxia } from '@alxia/core';

class NotFoundError extends Error {}

const app = alxia()
	.onError((error, { reply }) =>
		error instanceof NotFoundError ? reply(404, { error: 'not_found' as const }) : undefined,
	)
	.get('/users/:id', ({ pathParams }) => {
		throw new NotFoundError(pathParams['id']);
	});
```

See [Hooks: `onError`](hooks.md#onerror) and [Replies: errors](replies.md#errors).

### `onRequest`, `onResponse` and `around`

The global hooks. They see every request, even a 404, and none of what they
answer is in a route's type.

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { alxia, withHeaders } from '@alxia/core';

const requestId = new AsyncLocalStorage<string>();

const app = alxia()
	.around((_ctx, next) => requestId.run(crypto.randomUUID(), next))
	.onRequest(({ request }) => (request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : undefined))
	.onResponse((response) =>
		withHeaders(response, (headers) => headers.set('x-request-id', requestId.getStore() ?? '')),
	)
	.get('/', ({ reply }) => reply(200, 'ok'));
```

See [Hooks: global hooks](hooks.md#global-hooks).

### `group`

Hooks declared inside a group apply to its routes only. The group's routes
keep every hook declared before it.

```ts
import { alxia } from '@alxia/core';

const app = alxia()
	.group('/admin', (admin) =>
		admin
			.derive(({ request, reply }) =>
				request.headers.get('x-admin') === 'yes' ? undefined : reply(403, { error: 'forbidden' as const }),
			)
			.get('/stats', ({ reply }) => reply(200, { users: 1 })),
	)
	.get('/public', ({ reply }) => reply(200, 'open')); // no 403 here, at runtime or in its type
```

`group(build)` with no prefix is a scope alone. See
[Groups and plugins: groups](groups-and-plugins.md#groups).

### `use` and `definePlugin`

An app given to `use` brings its routes, and its route hooks then apply to
the routes declared after `use`. A `Plugin` function adds global hooks and
leaves the type alone. `definePlugin<Requires>()` builds an app plugin that
reads what an earlier one added.

```ts
import { alxia, definePlugin, type Plugin } from '@alxia/core';

const auth = alxia().derive(({ request, reply }) => {
	const id = request.headers.get('x-user');
	return id ? { user: { id } } : reply(401, { error: 'unauthenticated' as const });
});

const audit = definePlugin<{ user: { id: string } }>()((app) =>
	app.derive(({ user, request }) => ({ audit: `${user.id} ${request.method}` })),
);

const timing: Plugin = (app) =>
	app.around(async (_ctx, next) => {
		const started = performance.now();
		const response = await next();
		response.headers.set('server-timing', `app;dur=${performance.now() - started}`);
		return response;
	});

const app = alxia()
	.use(timing)
	.use(auth)
	.use(audit) // compiles: auth adds a user with an id
	.get('/whoami', ({ audit, reply }) => reply(200, audit));
```

See [Groups and plugins: plugins](groups-and-plugins.md#plugins) and
[Writing a plugin](writing-a-plugin.md).

## See also

- [Hooks](hooks.md): every hook's signature, options and edge cases.
- [Groups and plugins](groups-and-plugins.md): scoping, prefixes and what
  `use` mounts.
- [Replies](replies.md): `reply`, `set`, and how errors become responses.
- [Upgrading](../upgrading.md): what the next release changes in hooks.
