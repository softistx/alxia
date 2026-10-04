# Hooks

As of 0.4 a middleware is the one way to run code around routes, and most
request hooks are **deprecated** for it: `onRequest`, `onResponse`,
`around`, `wrap`, `onError`, `onRefusal`, and `app.plugin(middleware)`. They
keep working as they did in 0.3, and will be removed in a later minor. This
page says which are deprecated and which stay, what each becomes, and what
behaves differently once moved. The order a request runs in, and the
middleware side of every case, is on [Middleware](middleware.md).

```ts
import { alxia, defineMiddleware } from '@alxia/core';

const tokens = new Map([['Bearer ada', { id: 1, name: 'Ada' }]]);

const app = alxia()
	.decorate({ tokens })                              // stays: ctx.tokens, everywhere after
	.get('/health', ({ reply }) => reply(200, 'ok'))   // not guarded
	.derive(({ request, tokens, reply }) => {          // stays: adds to the context, cannot wrap
		const user = tokens.get(request.headers.get('authorization') ?? '');
		return user ? { user } : reply(401, { error: 'unauthenticated' as const });
	})
	.use(defineMiddleware<{ user: { name: string } }>()(({ user }, next) => next({ greeting: `hello ${user.name}` }))) // the form to write
	.get('/me', ({ user, greeting, reply }) => reply(200, { user, greeting }));
```

## Route hooks and global hooks

| Hook | Status | Applies to | Instead |
| --- | --- | --- | --- |
| `onRequest(hook)` | **deprecated** | every request, before routing | a first `use` middleware |
| `onResponse(hook)` | **deprecated** | every response | a first `use` middleware that `settle`s `next()` |
| `around(hook)` | **deprecated** | every request, outermost | a first `use` middleware |
| `wrap(hook)` | **deprecated** | the routes declared after it | a `use` middleware that awaits `next()` |
| `onError(hook)` | **deprecated** | the routes declared after it | a `use` middleware with `try`/`catch` around `next()` |
| `onRefusal(…)` | **deprecated** | the routes declared after it | the same `try`/`catch`, reading `refusalOf(error)` |
| `app.plugin(middleware)` | **deprecated** | every route, declared before it or after it, and unmatched requests, as 0.3's global hooks | `app.use(middleware)`, given before the routes |
| a route's list of hooks, `defineHook`, `defineWrap` | **deprecated** | one route | the route's own middlewares ([below](#hooks-on-one-route)) |
| `derive(fn)` | stays | the routes declared after it, and unmatched requests | — |
| `decorate(values)` | stays | the routes declared after it, and unmatched requests | — |
| `onStart`, `onStop`, `parser`, `bodyLimit` | stay | the whole app | — |
| `app.plugin(otherApp)`, `definePlugin` | stay: plugins are apps | its routes, then the routes declared after it and unmatched requests; one with a prefix of its own, its routes and the unmatched requests under that prefix | — |

`derive` stays as a shorthand, not a hook to migrate: it adds to the
context and cannot wrap what follows, so it needs no `next`. It is
`use(defineMiddleware((ctx, next) => next(added)))` written shorter.

## From a hook to a middleware

Each deprecated hook, and the middleware that does the same. A middleware
given to `use` runs in the order declared, on the routes declared after
it: give the replacements of the global hooks first, before any route.
The replacement of `onError` goes after the observers, so that they see
its reply too; it catches the error wherever it stands, since `settle`
does not swallow it ([Middleware: ordering](middleware.md#ordering)).

A hook of 0.3 that throws — `onRequest`, `around` — is answered by a bare
500 outside the chain: no middleware, observers included, adds its
headers to it. Its replacement, a middleware, throws inside the chain,
where the observers settle it.

### Instead of `onRequest`

Answers or lets the request through, before routing.

```ts
// deprecated
app.onRequest(({ request }) => (request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : undefined));

// now
app.use(
	defineMiddleware(({ request }, next) =>
		request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : next(),
	),
);
```

### Instead of `onResponse`

Edits or replaces every response, a 404 and a 500 included. A middleware
reads the response through `settle`, which also answers what the rest threw:

```ts
import { defineMiddleware, settle, withHeaders } from '@alxia/core';

// deprecated
app.onResponse((response) => withHeaders(response, (headers) => headers.set('x-content-type-options', 'nosniff')));

// now
app.use(
	defineMiddleware(async (ctx, next) =>
		withHeaders(await settle(ctx, next()), (headers) => headers.set('x-content-type-options', 'nosniff')),
	),
);
```

### Instead of `around`

Runs the rest of the request inside it.

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

const requestId = new AsyncLocalStorage<string>();

// deprecated
app.around((_ctx, next) => requestId.run(crypto.randomUUID(), next));

// now
app.use(defineMiddleware((_ctx, next) => requestId.run(crypto.randomUUID(), next)));
```

### Instead of `wrap`

```ts
// deprecated
app.wrap(async (_ctx, next) => {
	const response = await next();
	response.headers.set('x-served-by', 'api');
	return response;
});

// now
app.use(
	defineMiddleware(async (_ctx, next) => {
		const response = await next();
		response.headers.set('x-served-by', 'api');
		return response;
	}),
);
```

### Instead of `onError`

```ts
class NotFoundError extends Error {}

// deprecated
app.onError((error, { reply }) => (error instanceof NotFoundError ? reply(404, { error: 'not_found' as const }) : undefined));

// now
app.use(
	defineMiddleware(async ({ reply }, next) => {
		try {
			return await next();
		} catch (error) {
			if (error instanceof NotFoundError) return reply(404, { error: 'not_found' as const });
			throw error; // what the hook returned nothing for
		}
	}),
);
```

### Instead of `onRefusal`

```ts
import { refusalOf } from '@alxia/core';

// deprecated
app.onRefusal('validation', (refusal, { reply }) => reply(422, { detail: `the ${refusal.part} is invalid` }));

// now
app.use(
	defineMiddleware(async ({ reply }, next) => {
		try {
			return await next();
		} catch (error) {
			const refusal = refusalOf(error);
			if (refusal?.kind !== 'validation') throw error;
			return reply(422, { detail: `the ${refusal.part} is invalid` });
		}
	}),
);
```

### `derive` stays

Not deprecated. The same thing as a middleware, when it must also wrap:

```ts
// stays
app.derive(({ request }) => ({ agent: request.headers.get('user-agent') }));

// the middleware it is shorthand for
app.use(defineMiddleware(({ request }, next) => next({ agent: request.headers.get('user-agent') })));
```

### Instead of `app.plugin(middleware)`

```ts
// deprecated
app.plugin(logger());

// now
app.use(logger());
```

`app.plugin(otherApp)` and `definePlugin` are unchanged.

## What behaves differently once moved

A deprecated hook runs exactly as in 0.3; a middleware that replaces it
differs in these ways.

- **A `wrap` resolved a refusal; a middleware's `next()` rejects with it.**
  A 400 from a `validate` after a `wrap` reached its `next()` as a
  response, with the deprecated `onRefusal` hooks or the default 400 already
  applied. A middleware's `next()` rejects with the `ValidationError`
  ([Middleware](middleware.md#answering-a-refusal-or-an-error)); read
  `response.status` after `await next()` no more, but `refusalOf(error)` in
  a `catch`, or `settle` for the 400 as the client gets it.
- **A middleware runs on an unmatched request; a `wrap` never did, and still
  does not.** A request no route matches runs every top-level `use`,
  `derive` and `decorate` of the app, then its 404, 405 or 426 — never a
  `wrap`, as in 0.3. A `wrap` migrated to `use()` starts running on 404s;
  a middleware reads `ctx.route` as `undefined` there.
- **`onError` answers outermost; a `try`/`catch` middleware answers only
  what is behind it.** An `onError` hook answers at the route boundary, after
  every middleware has unwound, so none of them sees its reply. A `try`/`catch`
  middleware answers what was thrown behind it, and the middlewares
  declared before it see its reply. Put it after the observers
  ([Ordering](middleware.md#ordering)).
- **`onResponse` and `around` stood outside everything; a middleware stands
  where it is declared.** A deprecated hook still runs before every
  middleware and after all of them, so a middleware cannot be outside an
  `onRequest`. Given first to `use`, one is as outer as a middleware can be.
- **`onResponse` saw errors as responses; a middleware's `await next()`
  rejects.** Read the response through `settle(ctx, next())` to see a 404, a
  400 or a 500 as the client gets it. Without `settle`, the code after
  `await next()` does not run on a throw.
- **A WebSocket upgrade skips `around`, `wrap` and `onResponse`; it runs
  `use` middlewares**, and the upgrade is open by the time they unwind: what
  one returns after `next()` is ignored.
- **A middleware reads `ctx.route`** — the route as declared — from the
  start of the chain, `undefined` when no route matched; `onRequest` and
  `around` read it only once routing has run.

## Group and plugin scope

A hook or middleware declared in a [group](groups-and-plugins.md#groups)
stays inside the group: it runs on the group's routes and on an unmatched
request under the group's prefix (before its 404 or 405), never on a route
declared after the group nor on a request outside the prefix. A group without
a prefix of its own adds nothing to unmatched requests, and a plugin with a
prefix of its own behaves like such a group once mounted.

| | Scope |
| --- | --- |
| `use`, `derive`, `decorate`, `wrap`, `onError`, `onRefusal` in the app | the routes declared after it; the top-level `use`, `derive` and `decorate` also unmatched requests (never a `wrap`) |
| the same, in a `group` | the group's routes declared after it, never an unmatched request |
| `onRequest`, `onResponse`, `around` | **global**: every request, wherever declared, a group or a plugin included |
| `app.plugin(otherApp)`: its middlewares, `derive`s and `decorate`s | the routes declared after `plugin`, and unmatched requests: a plugin's are the app's |
| `app.plugin(otherApp)`: its `onError` | tried before the app's; its `onRefusal` hooks first for its own routes |
| `app.plugin(otherApp)`: its global hooks | become the app's |

Moving a global hook into a middleware **inside a group** narrows it to the
group's routes. To keep it global, give it to `use` on the app itself.

```ts
const app = alxia()
	.use(timing)                                                  // every request, first
	.group('/admin', (admin) =>
		admin.use(guard).get('/stats', ({ reply }) => reply(200, 1)), // the group's routes only
	)
	.plugin(sharedRoutes);                                        // its middlewares are the app's
```

## `decorate`

```ts
decorate<const Values extends object>(values: Values): Alxia<Ctx & Values, …>
```

Values every route after it reads from its context: a database client, a
logger, a config. The same object every request. Not deprecated.

```ts
import { Database } from 'bun:sqlite';
import { alxia } from '@alxia/core';

const app = alxia()
	.decorate({ db: new Database('app.sqlite'), log: console })
	.get('/count', ({ db, reply }) => reply(200, db.query('select count(*) as n from users').get()));
```

## `derive`

```ts
derive<Result>(hook: (ctx: BaseContext & Ctx) => MaybePromise<Result>): Alxia<…>
```

Runs on every request to a route declared after it, and on unmatched
requests when declared at the top level. Not deprecated: it adds to the
context and cannot wrap what follows, which is the one thing a middleware
is for beyond it. What it returns:

| Returns | Effect |
| --- | --- |
| an object | merged into the context of the middlewares and handler after it, and typed there |
| a reply (`reply(…)`, `redirect(…)`) | ends the request with it |
| `undefined` | nothing |

```ts
const app = alxia()
	.get('/public', ({ reply }) => reply(200, 'open'))
	.derive(({ request, reply }) => {
		const token = request.headers.get('authorization');
		if (token !== 'Bearer ada') return reply(401, { error: 'unauthenticated' as const });
		return { user: 'ada' };
	})
	.get('/me', ({ user, reply }) => reply(200, { user }));
// GET /public → 200; GET /me without the header → 401; with it → {"user":"ada"}
```

A `derive`'s reply is sent as it is: it is made before the route's
middlewares, so a `responds` among them does not check it. For some routes
rather than every route after it, the same thing is a middleware:
`defineMiddleware(({ request, reply }, next) => … next({ user }))`.

### Reading the request's cookies

Every `derive`, `wrap`, `onError` and `onRefusal` hook, and every middleware
before a `validate`, reads the request's cookies as `ctx.cookies`, a
`Readonly<Record<string, string>>` parsed from the `Cookie` header on first
read. A `validate({ cookies })` gives what follows it — the middlewares after
it and the **handler** — the validated values instead, typed by the schema's
output. The hooks still read the cookies as they arrived, strings, even an
`onError` or `onRefusal` that runs after the `validate`:

```ts
app
	.onError((error, { cookies }) => console.error(error, cookies['sid'])) // a string
	.get('/visits', validate({ cookies: z.object({ visits: z.coerce.number() }) }),
		({ cookies, reply }) => reply(200, cookies.visits));                 // a number
```

A `derive` that returns `cookies` replaces the map for what follows it; a
`validate({ cookies })` then validates the map it returned, not the `Cookie`
header. The full table, with `set.cookies` — the cookies the **response**
sets, which read back as `null` in a hook — is on
[Middleware: reading cookies](middleware.md#reading-cookies), and
[Troubleshooting](../troubleshooting.md#setcookiesget-returns-null-in-a-hook).

## `wrap`

**Deprecated** for a middleware that awaits `next()`
([above](#instead-of-wrap)).

```ts
wrap<Result extends AnyReply | Response>(
	hook: (ctx: BaseContext & Ctx, next: () => Promise<Response>) => MaybePromise<Result>,
): Alxia<…>
```

A route hook around the rest of the route: `next()` runs what is declared
after it and resolves to the `Response`. The hook returns that response,
another one, or a reply of its own.

- A 400 from a `validate` reaches the hook as a **response**, like any
  other: a middleware's `next()` rejects with the `ValidationError` instead.
- An error thrown after it reaches it first, as a rejection of `next()`;
  rethrown, it goes on to `onError`.
- A socket's upgrade skips `wrap`: there is no response to wrap.

## Hooks on one route

**Deprecated.** A list of hooks after the path, and the `defineHook` and
`defineWrap` that make them, still run as they did in 0.3, and will be
removed in a later minor. Give the route [middlewares](middleware.md#a-routes-middlewares)
instead: a `defineHook` becomes a `defineMiddleware` that returns
`next(added)` — `next()` where the hook returned nothing — and a
`defineWrap` one that awaits `next()`:

```ts
// deprecated
const canView = defineHook<{ user: User; params: { id: string } }>()(
	async ({ user, params, reply }) =>
		(await mayView(user, params.id)) ? undefined : reply(403, { error: 'forbidden' as const }),
);
app.patch('/posts/:id', [canView], { params: PostId, body: Update, response: { 200: Post } }, handler);

// now
const canView = defineMiddleware<{ user: User; pathParams: { id: string } }>()(
	async ({ user, pathParams, reply }, next) =>
		(await mayView(user, pathParams.id)) ? next() : reply(403, { error: 'forbidden' as const }),
);
app.patch('/posts/:id', canView, validate({ params: PostId, body: Update }), responds({ 200: Post }), handler);
```

Each change is on [Upgrading](../upgrading.md). As it runs:

- **A list stands after the app's chain**, in the order of the list, then
  the request is validated, then the handler runs.
- **What a hook returns** is treated as a `derive`'s: an object is added to
  the context of the hooks after it and of the handler; a reply ends that
  route's request; `undefined` does nothing. A `defineWrap` runs the rest
  inside `next()`, and a socket's upgrade skips it.
- **A hook reads the request as it arrived**, before validation:
  `params` and `pathParams` strings typed by the route's path, `query` as
  the query string, the request's `cookies`, no `body`. A check that needs
  the validated body belongs after a `validate`, or in the handler.
- **`defineHook<Requires>()(hook)`** names what a hook reads beyond
  `HookContext` — the base context and the raw `params` and `query` — checked
  where the hook is given; `defineWrap<Requires>()(hook)` does the same
  ([Troubleshooting](../troubleshooting.md#the-hook-reads--which-this-routes-context-does-not-give-derive-it-before-this-route-or-earlier-in-its-list)).
  Name the requirement before the hook: `defineHook<{ user: User }>()(…)`.
- **A list is bounded at 8 hooks** (`MaxRouteHooks`), as the route's
  middlewares are; a ninth does not compile.
- **A thrown error** goes to the `onError` hooks in force; a refusal to the
  `onRefusal` hook of its kind, or the general one.

## `onError`

**Deprecated** for a `try`/`catch` middleware ([above](#instead-of-onerror)).

```ts
onError<Result extends AnyReply | undefined | void>(
	hook: (error: unknown, ctx: BaseContext & Partial<Ctx>) => MaybePromise<Result>,
): Alxia<…>
```

Turns an error thrown by a route declared after it — its middlewares or its
handler — into a reply. Returning nothing lets the next `onError` try. Past
the last one, an `HttpError` is answered as it says and anything else is a
logged `500 { "error": "internal" }` ([Replies](replies.md#errors)). It
never sees the client hanging up mid-request, which is answered a `499`
with no hook, nor a refusal: that goes to `onRefusal`.

The context is `Partial<Ctx>`: the error may have been thrown before a
`derive` added its part. An `onError` reply is sent after the middlewares
have unwound: none of them sees it, except through `settle`.

## `onRefusal`

**Deprecated** for a `try`/`catch` middleware that reads `refusalOf(error)`
([above](#instead-of-onrefusal)).

```ts
onRefusal<Result extends Reply<ClientErrorStatus, any> | undefined | void>(
	hook: (refusal: Refusal, ctx: BaseContext & Ctx) => MaybePromise<Result>,
): Alxia<…>
onRefusal<Responses extends RefusalResponses, Result extends DeclaredReply<Responses> | undefined | void>(
	schema: { response: Responses; contentType?: string },
	hook: (refusal: Refusal, ctx: Omit<BaseContext, 'reply'> & Ctx & { reply: TypedReplyFunction<Responses> }) => MaybePromise<Result>,
): Alxia<…>
onRefusal<Kind extends RefusalKind, Result extends Reply<ClientErrorStatus, any> | undefined | void>(
	kind: Kind & OneKind<Kind>, // one literal kind
	hook: (refusal: RefusalOfKind<Kind>, ctx: BaseContext & Ctx) => MaybePromise<Result>,
): Alxia<…>
onRefusal<Kind extends RefusalKind, Responses extends RefusalResponses, Result extends DeclaredReply<Responses> | undefined | void>(
	kind: Kind & OneKind<Kind>,
	schema: { response: Responses; contentType?: string },
	hook: (refusal: RefusalOfKind<Kind>, ctx: Omit<BaseContext, 'reply'> & Ctx & { reply: TypedReplyFunction<Responses> }) => MaybePromise<Result>,
): Alxia<…>
```

Answers a request a route declared after it refuses before its handler
runs: a `validate` among a route's middlewares, wherever it stands, or a
body past `bodyLimit`. A refusal is thrown (a `ValidationError`, a
`ContentTooLargeError`) and reaches the route boundary after every
middleware: a middleware that answers it first wins. Two kinds, each with
its default:

| `kind` | When | Default |
| --- | --- | --- |
| `validation` | a `validate` refuses the request | `400 { "error": "validation", "issues": […] }` ([The 400](routes.md#the-400)) |
| `body_limit` | the body is larger than the route's [`bodyLimit`](routes.md#body-size-bodylimit) | `413 { "error": "content_too_large", "limit": … }` |

The hook reads the refusal and the context, and returns a reply with a 4xx
status, or nothing to send that kind's default.

```ts
interface ValidationRefusal {
	readonly kind: 'validation';
	readonly part: 'params' | 'query' | 'headers' | 'cookies' | 'body'; // the first that failed
	readonly issues: readonly ValidationIssue[];                         // every one, each with its target
}
interface BodyLimitRefusal {
	readonly kind: 'body_limit';
	readonly limit: number; // the route's limit, in bytes
}
type Refusal = ValidationRefusal | BodyLimitRefusal; // told apart by `kind`
```

Only a `validation` refusal has a `part` and `issues`: check `kind` first.

```ts
import { alxia, problem, type Refusal, validate } from '@alxia/core';
import { z } from 'zod';

const jmapProblem = (refusal: Refusal) =>
	refusal.kind === 'body_limit'
		? problem({ type: 'urn:ietf:params:jmap:error:limit', status: 413, limit: 'maxSizeRequest' })
		: problem({
				type: refusal.issues.some((issue) => issue.code === 'invalid_json')
					? 'urn:ietf:params:jmap:error:notJSON'
					: 'urn:ietf:params:jmap:error:notRequest',
				status: 400,
				detail: `the ${refusal.part} is invalid`,
			});

const app = alxia()
	.onRefusal(jmapProblem)
	.post('/jmap', { bodyLimit: 10_000_000 }, validate({ body: z.object({ using: z.array(z.string()) }) }), ({ reply }) =>
		reply(200, { methodResponses: [] }),
	);
```

- **Order is meaning.** The last `onRefusal` declared before a route is the
  one in force; a hook of one kind sits in front of it. A route declared
  before any keeps the default, and a [group](groups-and-plugins.md#groups)'s
  hook stays inside the group. A plugin keeps its own hook for its routes;
  its routes without one take the hook of the app mounting it.
- **What it replaces.** The hook's reply replaces the default 400 or 413 of
  every route after it that validates or has a `bodyLimit`. A hook that
  returns nothing leaves the default. A status other than 400 replaces it.
- **With schemas.** Given `{ response, contentType? }` first, the hook's
  `reply` is typed by those schemas, as a `responds` types a handler's:
  checked by the schema of its status, sent as its output, a reply the
  schema refuses is a 500 ([`validateResponses`](replies.md#validateresponses)).
  `contentType` is set on the reply unless it sets its own.

### One hook per kind

Given a kind first, `'validation'` or `'body_limit'`, the hook answers that
kind alone and reads its refusal narrowed, a `ValidationRefusal` or a
`BodyLimitRefusal`:

```ts
const Invalid = z.object({ type: z.string(), status: z.literal(400), detail: z.string() });
const TooLarge = z.object({ type: z.string(), status: z.literal(413), limit: z.number() });

const app = alxia()
	.onRefusal('validation', { response: { 400: Invalid }, contentType: 'application/problem+json' }, (refusal, { reply }) =>
		reply(400, { type: 'urn:ietf:params:jmap:error:notRequest', status: 400, detail: `the ${refusal.part} is invalid` }),
	)
	.onRefusal('body_limit', { response: { 413: TooLarge }, contentType: 'application/problem+json' }, (refusal, { reply }) =>
		reply(413, { type: 'urn:ietf:params:jmap:error:limit', status: 413, limit: refusal.limit }),
	)
	.post('/jmap', { bodyLimit: 10_000_000 }, validate({ body: z.object({ using: z.array(z.string()) }) }), ({ reply }) =>
		reply(200, { methodResponses: [] }),
	);
```

- **One kind, as a literal.** A kind typed as a union, `RefusalKind`, or as
  a generic parameter is a compile error. Write the kind out, or one call
  per kind.
- **Fallback.** A kind with no hook of its own, or whose hook returns
  nothing, falls back to the general hook, then to the default of that kind.
- **Order.** A kind's hook replaces the one of that kind declared before it,
  and keeps the general hook as its fallback. A general hook declared after
  it replaces it, and every other one.
- **Plugins.** A plugin's route tries the plugin's hooks first, then the
  mounting app's hooks for that kind, then the app's general hook.

A hook that throws reaches the route's `onError` hooks, as a handler's error
does. A socket route's upgrade is refused through the same hook.

## Global hooks

`onRequest`, `onResponse` and `around` are **deprecated** for a first `use`
middleware ([above](#from-a-hook-to-a-middleware)); `onStart`, `onStop` and
`parser` stay. They apply to every request, wherever declared.

### `around`

```ts
type AroundHook = (ctx: RequestContext, next: () => Promise<Response>) => Promise<Response>;
```

Around everything else, the first declared outermost. What it awaits around
`next()` runs in the request's async context, so `AsyncLocalStorage`, a
tracing span or a timer holds for the whole request. After `next()`,
`ctx.route` is the route reached (`/users/:id`, or `undefined` for a 404)
and `ctx.error` what it failed with. A socket's upgrade runs outside
`around`. An `around` hook that throws is logged and answered with a 500.

### `onRequest`

```ts
type RequestHook = (ctx: RequestContext) => MaybePromise<Response | undefined | void>;
```

Before routing, on every request. A `Response` it returns is sent as it is,
and the route never runs. That `Response` is in no route's OpenAPI
document: use it only for what a client generated from the document never
asks — a CORS preflight, a redirect to HTTPS.

### `onResponse`

```ts
type ResponseHook = (response: Response, ctx: RequestContext) => MaybePromise<Response | undefined | void>;
```

Every response, in the order declared — 404s, 405s and 500s included. Edit
the response, or return another to replace it; keep its status, which the
OpenAPI document promises. A response's headers may be immutable — one from
`fetch`, a `Response.redirect` — and `withHeaders` copies it then. An
`onResponse` hook that throws is logged and skipped, and the response still
goes out.

### `onStart` and `onStop`

```ts
type StartHook = (server: Bun.Server<unknown>) => MaybePromise<void>;
type StopHook = () => MaybePromise<void>;
```

`onStart` runs once `listen` has started the server; it is not awaited, and
an error it throws is logged. `onStop` runs after `stop()` has stopped the
server, each hook awaited in turn: close a pool, flush a log. Not
deprecated.

```ts
const app = alxia()
	.onStart((server) => console.log(`listening on ${server.url}`))
	.onStop(() => pool.end());
```

See [Serving](serving.md#stopping).

### `parser`

A body parser for a `content-type`, tried before the built-in ones
([Routes](routes.md#body-parsers)). Not deprecated.

## What each hook reads

```ts
interface RequestContext {               // around, onRequest, onResponse
	readonly request: Request;
	readonly url: URL;
	readonly server: Bun.Server<unknown> | undefined; // none through app.fetch alone
	readonly ip: string | undefined;                  // see Serving: behind a proxy
	readonly route: string | undefined;               // once routing has run
	readonly error: unknown;                          // once a route has failed
}

interface BaseContext extends RequestContext {   // middlewares, derive, wrap, onError, onRefusal, handlers
	readonly route: string | undefined;              // as declared: /users/:id; undefined when no route matched
	readonly pathParams: Readonly<Record<string, string>>;
	readonly cookies: Readonly<Record<string, string>>; // the request's, parsed on first read
	readonly set: ResponseSettings;                  // { headers: Headers; cookies: ResponseCookies }
	readonly reply: FreeReplyFunction;
	readonly redirect: RedirectFunction;
}
```

A handler, and a route's own middlewares, read `route` as a `string`: only a
`use()` middleware or a `derive` can run on a request no route matches. `ResponseCookies` is Bun's `CookieMap`, documented as the
response's: its `get` and `has` read what this response set.

A middleware made by `defineMiddleware<Requires>()` reads
`MiddlewareContext<Requires>`, `BaseContext & Requires`; one written inline
reads the route's context where it stands: `BaseContext`, what the middlewares
before it added, and the request's `params`, `query`, `headers` and `cookies`
as they arrived, or as a `validate` before it gave them back
([What a middleware reads](middleware.md#what-a-middleware-reads)). A hook in
a deprecated list reads `HookContext<Requires>`: `BaseContext`, the raw
`params` and `query`, and what it names. `ContextOf<App>` names that context
outside the chain ([The app's type](types.md#contextofapp)).

## See also

- [Middleware: which way to use](middleware.md): the order a request runs
  in, the tool for each need, and every middleware form side by side.
- [Groups and plugins](groups-and-plugins.md): scoping middlewares to some
  routes, and sharing them across apps.
- [Replies](replies.md): `reply`, `set`, and errors.
- [Upgrading](../upgrading.md): moving the hooks to middlewares.
