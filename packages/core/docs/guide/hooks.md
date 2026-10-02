# Hooks

This page covers the code that runs around routes: route hooks, which
apply to the routes declared after them and can end a request with a typed
reply, and global hooks, which apply to the whole app.

```ts
import { alxia } from '@alxia/core';

const tokens = new Map([['Bearer ada', { id: 1, name: 'Ada' }]]);

const app = alxia()
	.decorate({ tokens })                              // ctx.tokens, everywhere after
	.get('/health', ({ reply }) => reply(200, 'ok'))   // not guarded
	.derive(({ request, tokens, reply }) => {
		const user = tokens.get(request.headers.get('authorization') ?? '');
		return user ? { user } : reply(401, { error: 'unauthenticated' as const });
	})
	.get('/me', ({ user, reply }) => reply(200, user)); // ctx.user is typed; the 401 is in its type
```

## Route hooks and global hooks

| | Applies to | Declared with |
| --- | --- | --- |
| route hooks | the routes declared **after** them, in the same app or [group](groups-and-plugins.md#groups) | `decorate`, `derive`, `wrap`, `onError` |
| global hooks | every request to the app, wherever they are declared | `around`, `onRequest`, `onResponse`, `onStart`, `onStop`, `parser` |

The order of the chain is the order of the request, at runtime and in the
types alike: a route declared before a `derive` neither runs it nor reads
what it adds.

## The order a request runs

```
around (first declared outermost)
└─ onRequest hooks           ← a Response here is sent as it is
   └─ routing                ← 404, 405, 426
      └─ route hooks, in order: derive / decorate / wrap
         └─ validation       ← 400
            └─ handler
         onError hooks       ← for what any of the above threw
   onResponse hooks          ← every response, 404s included
```

Route hooks run **before validation**: they read `pathParams`, the path
parameters as they arrived, not `params`.

## `decorate`

```ts
decorate<const Values extends object>(values: Values): Alxia<Ctx & Values, …>
```

Values every route after it reads from its context: a database client, a
logger, a config. The same object every request.

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

Runs on every request to a route declared after it. What it returns:

| Returns | Effect |
| --- | --- |
| an object | merged into the context of the hooks and handler after it, and typed there |
| a reply (`reply(…)`, `redirect(…)`) | ends the request with it; the reply is added to the type of every route after it |
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

Write the error literal `as const`: the client then reads
`{ error: 'unauthenticated' }`, not `{ error: string }`. A hook's reply is
sent as it is: the route's `response` schemas do not check it.

## `wrap`

```ts
wrap<Result extends AnyReply | Response>(
	hook: (ctx: BaseContext & Ctx, next: () => Promise<Response>) => MaybePromise<Result>,
): Alxia<…>
```

A route hook around the rest of the route: `next()` runs the hooks declared
after it, validation and the handler, and resolves to the `Response`. The
hook returns that response, another one, or a reply of its own — which,
like a `derive`'s, is added to the type of the routes after it.

```ts
const app = alxia()
	.wrap(async ({ request, reply }, next) => {
		if (request.headers.get('x-busy') === 'yes') return reply(409, { error: 'busy' as const });
		const response = await next();
		response.headers.set('x-wrapped', 'yes');
		return response;
	})
	.get('/items/:id', ({ params, reply }) => reply(200, { id: params.id }));
```

- A 400 from validation reaches the hook as a response, like any other.
- An error thrown after it reaches it first, as a rejection of `next()`;
  rethrown, it goes on to `onError`.
- A socket's upgrade skips `wrap`: there is no response to wrap.

Use it for what must hold across the handler: an idempotency key, a
database transaction, a lock, a cookie set from the response.

## `onError`

```ts
onError<Result extends AnyReply | undefined | void>(
	hook: (error: unknown, ctx: BaseContext & Partial<Ctx>) => MaybePromise<Result>,
): Alxia<…>
```

Turns an error thrown by a route declared after it — its hooks or its
handler — into a reply. Returning nothing lets the next `onError` try. Past
the last one, an `HttpError` is answered as it says and anything else is a
logged `500 { "error": "internal" }` ([Replies](replies.md#errors)).

```ts
class NotFoundError extends Error {}

const app = alxia()
	.onError((error, { reply }) =>
		error instanceof NotFoundError ? reply(404, { error: 'not_found' as const }) : undefined,
	)
	.get('/users/:id', async ({ params, reply }) => reply(200, await loadUser(params.id)));
```

The context is `Partial<Ctx>`: the error may have been thrown before a
`derive` added its part.

## Global hooks

### `around`

```ts
type AroundHook = (ctx: RequestContext, next: () => Promise<Response>) => Promise<Response>;
```

Around everything else, the first declared outermost. What it awaits around
`next()` runs in the request's async context, so `AsyncLocalStorage`, a
tracing span or a timer holds for the whole request. After `next()`,
`ctx.route` is the route reached (`/users/:id`, or `undefined` for a 404)
and `ctx.error` what it failed with.

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

const requestId = new AsyncLocalStorage<string>();

const app = alxia()
	.around(async (ctx, next) => {
		const started = performance.now();
		const response = await requestId.run(crypto.randomUUID(), next);
		console.log(ctx.request.method, ctx.route ?? ctx.url.pathname, response.status, performance.now() - started);
		return response;
	})
	.get('/', async ({ reply }) => reply(200, requestId.getStore() ?? 'none'));
```

A socket's upgrade runs outside `around`. An `around` hook that throws is
logged and answered with a 500.

### `onRequest`

```ts
type RequestHook = (ctx: RequestContext) => MaybePromise<Response | undefined | void>;
```

Before routing, on every request. A `Response` it returns is sent as it is,
and the route never runs.

```ts
app.onRequest(({ request }) =>
	request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : undefined,
);
```

That `Response` is in no route's type: use it only for what a typed client
never asks — a CORS preflight, a redirect to HTTPS. What a client must
read belongs in a `derive`.

### `onResponse`

```ts
type ResponseHook = (response: Response, ctx: RequestContext) => MaybePromise<Response | undefined | void>;
```

Every response, in the order declared — 404s, 405s and 500s included. Edit
the response, or return another to replace it; keep its status, which the
client's types promise.

```ts
import { alxia, withHeaders } from '@alxia/core';

const app = alxia().onResponse((response) =>
	withHeaders(response, (headers) => headers.set('x-content-type-options', 'nosniff')),
);
```

A response's headers may be immutable — one from `fetch`, a
`Response.redirect` — and `withHeaders` copies it then. An error the edit
itself throws is thrown as it is, the body unread, so an `onResponse` hook
that throws is logged and skipped, and the response still goes out with its
body (and, when its headers are mutable, any header the edit set before
throwing).

### `onStart` and `onStop`

```ts
type StartHook = (server: Bun.Server<unknown>) => MaybePromise<void>;
type StopHook = () => MaybePromise<void>;
```

`onStart` runs once `listen` has started the server; it is not awaited, and
an error it throws is logged. `onStop` runs after `stop()` has stopped the
server, each hook awaited in turn: close a pool, flush a log.

```ts
const app = alxia()
	.onStart((server) => console.log(`listening on ${server.url}`))
	.onStop(() => pool.end());
```

See [Serving](serving.md#stopping).

### `parser`

A body parser for a `content-type`, tried before the built-in ones
([Routes](routes.md#body-parsers)).

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

interface BaseContext extends RequestContext {   // derive, wrap, onError, handlers
	readonly route: string;                          // as declared: /users/:id
	readonly pathParams: Readonly<Record<string, string>>;
	readonly set: ResponseSettings;                  // { headers: Headers; cookies: Bun.CookieMap }
	readonly reply: FreeReplyFunction;
	readonly redirect: RedirectFunction;
}
```

A handler reads `BaseContext`, what every hook before it added, and the
validated `params`, `query`, `headers`, `cookies` and `body`. `ContextOf<App>`
names that context outside the chain ([The app's type](types.md#contextofapp)).

## See also

- [Groups and plugins](groups-and-plugins.md): scoping a hook to some
  routes, and sharing hooks across apps.
- [Replies](replies.md): `reply`, `set`, and errors.
