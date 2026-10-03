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
| route hooks | the routes declared **after** them, in the same app or [group](groups-and-plugins.md#groups) | `decorate`, `derive`, `wrap`, `onError`, `onRefusal` |
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
         └─ validation       ← 400, or the onRefusal hook's reply
            └─ handler
         onError hooks       ← for what any of the above threw
   onResponse hooks          ← every response, 404s included
```

A body read past its route's `bodyLimit` is a `body_limit` refusal,
answered by [`onRefusal`](#onrefusal) or with a 413, wherever it is read: a
route hook, validation or the handler ([Routes](routes.md#body-size-bodylimit)). A global hook reads it
unbounded, and the route's limit is then skipped.

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

### Reading the request's cookies

Every route hook — `derive`, `wrap`, `onError`, `onRefusal`, a guard —
reads the request's cookies as `ctx.cookies`, a
`Readonly<Record<string, string>>` parsed from the `Cookie` header on first
read. A route with no hook or handler that reads it never parses the header.

```ts
const sessions = new Map<string, User>();

const app = alxia()
	.derive(({ cookies }) => ({ user: sessions.get(cookies['sid'] ?? '') ?? null }))
	.get('/me', ({ user, reply }) => reply(200, { user }));
// GET /me with "Cookie: sid=…" → the session's user; without it → {"user":null}
```

A route with a `cookies` schema gives its **handler** the validated values
instead, typed by the schema's output. Its hooks still read the cookies as
they arrived — strings — even an `onError` or `onRefusal` that runs after
validation, so the type each one reads is the one it gets:

```ts
app
	.onError((error, { cookies }) => console.error(error, cookies['sid'])) // a string
	.get('/visits', { cookies: z.object({ visits: z.coerce.number() }) },
		({ cookies, reply }) => reply(200, cookies.visits));                 // a number
```

Two consequences of that split:

- On a route with a `cookies` schema, the handler's context is a copy of
  the hooks' whose `cookies` is the schema's output. `getContext()` from
  `@alxia/context-storage` holds the hooks' one, with the cookies as
  strings.
- A handler's context on a route whose `cookies` schema outputs anything
  but strings — `{ visits: number }` — is no longer a `BaseContext`, whose
  `cookies` are strings. Pass a helper typed `(ctx: BaseContext) => …` the
  fields it reads, or type it `Omit<BaseContext, 'cookies'>`.

A `derive` that returns `cookies` replaces the map for the hooks and the
handler after it; a route's `cookies` schema then validates the map it
returned, not the `Cookie` header.

`set.cookies` is the other side: the cookies the **response** sets, empty
when the request starts. `set.cookies.get('sid')` reads back what this
response set, never what the request sent, so in a hook it is `null`
([Troubleshooting](../troubleshooting.md#setcookiesget-returns-null-in-a-hook)).

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
logged `500 { "error": "internal" }` ([Replies](replies.md#errors)). It
never sees the client hanging up mid-request, which is answered a `499`
with no hook.

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

## `onRefusal`

```ts
onRefusal<Result extends Reply<ClientErrorStatus, any> | undefined | void>(
	hook: (refusal: Refusal, ctx: BaseContext & Ctx) => MaybePromise<Result>,
): Alxia<…>
onRefusal<Responses extends RefusalResponses, Result extends DeclaredReply<Responses> | undefined | void>(
	schema: { response: Responses; contentType?: string },
	hook: (refusal: Refusal, ctx: Omit<BaseContext, 'reply'> & Ctx & { reply: TypedReplyFunction<Responses> }) => MaybePromise<Result>,
): Alxia<…>
onRefusal<Kind extends RefusalKind, Result extends Reply<ClientErrorStatus, any> | undefined | void>(
	kind: Kind,
	hook: (refusal: RefusalOfKind<Kind>, ctx: BaseContext & Ctx) => MaybePromise<Result>,
): Alxia<…>
onRefusal<Kind extends RefusalKind, Responses extends RefusalResponses, Result extends DeclaredReply<Responses> | undefined | void>(
	kind: Kind,
	schema: { response: Responses; contentType?: string },
	hook: (refusal: RefusalOfKind<Kind>, ctx: Omit<BaseContext, 'reply'> & Ctx & { reply: TypedReplyFunction<Responses> }) => MaybePromise<Result>,
): Alxia<…>
```

Answers a request that a route declared after it refuses before its
handler runs. There are two kinds of refusal, each with its default:

| `kind` | When | Default |
| --- | --- | --- |
| `validation` | the route's schemas refuse the request | `400 { "error": "validation", "issues": […] }` ([The 400](routes.md#the-400)) |
| `body_limit` | the body is larger than the route's [`bodyLimit`](routes.md#body-size-bodylimit) | `413 { "error": "content_too_large", "limit": … }` |

The hook reads the refusal and the context. It returns a reply with a 4xx
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

Only a `validation` refusal has a `part` and `issues`: check `kind` before
reading them. A kind added later reaches every hook too, and a hook that
returns nothing for it sends its default.

An API whose errors are RFC 9457 problems, as JMAP's are, answers them
with [`problem`](replies.md#problem-details-problem):

```ts
import { alxia, problem, type Refusal } from '@alxia/core';
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
	.post('/jmap', { body: z.object({ using: z.array(z.string()) }), bodyLimit: 10_000_000 }, ({ reply }) =>
		reply(200, { methodResponses: [] }),
	)
	.get('/download/:blobId', { params: z.object({ blobId: z.string().min(1) }) }, ({ reply }) =>
		reply(200, 'blob'),
	);
```

A body that is not JSON gets `notJSON`, and a body or a path parameter its
schema refuses gets `notRequest`. A body past 10 MB gets JMAP's `limit`
problem, whether its `Content-Length` says so or the bytes counted do. It
is sent with 413 here, the app's choice; RFC 8620's own example of that
problem answers 400. Each is sent as
`application/problem+json`, with its `detail` naming the part.

**Order is meaning.** The last `onRefusal` declared before a route is the
one in force; a [hook of one kind](#one-hook-per-kind) sits in front of it. A route declared before any keeps the default, and a
[group](groups-and-plugins.md#groups)'s hook stays inside the group. A
plugin given to `use` keeps its own hook for its routes. Its routes without
one take the hook of the app using it, and the plugin's hook then applies to
the routes declared after `use`, as its `derive`s do.

**Typed.** The hook's reply replaces the default 400 in the type of every
route after it that validates part of its request, so
[`@alxia/client`](https://www.npmjs.com/package/@alxia/client) reads the
problem. A route under a `bodyLimit` may be refused too, and its type
gains the hook's replies in place of the default 413. A route that neither
validates nor has a `bodyLimit` is never refused, and its type gains
nothing. A hook that may return nothing keeps the default of each kind the
route may refuse with — the 400, the 413 — in the type beside its own
reply. A status other than 400 replaces it: a hook that answers 422 makes
the route's outcomes 422 and no 400. The hook's type does not say which
reply answers which kind, so every reply it may return is in the type of
every route it may refuse: the JMAP hook above puts its 413 in the type of
`/download/:blobId` too, though only `/jmap` has a limit. A
[hook per kind](#one-hook-per-kind) says which, and keeps it out.

**With schemas.** Given `{ response, contentType? }` first, the hook's
`reply` is typed by those schemas, as a route's is. Its reply is checked by
the schema of its status and sent as that schema's output, and a reply the
schema refuses is a 500, as a handler's is ([`validateResponses`](replies.md#validateresponses)).
`contentType` is set on the reply unless it sets its own.
[`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi) documents
each declared status under that content type. Without schemas it documents
a `4XX` whose body it does not know.

```ts
const Problem = z.object({ type: z.string(), status: z.literal(400), detail: z.string() });

const documented = alxia()
	.onRefusal({ response: { 400: Problem }, contentType: 'application/problem+json' }, (refusal, { reply }) =>
		reply(400, { type: 'urn:ietf:params:jmap:error:notRequest', status: 400, detail: refusal.kind }),
	)
	.post('/jmap', { body: z.object({ using: z.array(z.string()) }) }, ({ reply }) => reply(200, 'ok'));
```

### One hook per kind

Given a kind first, `'validation'` or `'body_limit'`, the hook answers that
kind alone. It reads its refusal narrowed, a `ValidationRefusal` or a
`BodyLimitRefusal`, with no `kind` to check. Its replies, and its schemas
when it is given some, replace the default of that kind only:

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
	.post('/jmap', { body: z.object({ using: z.array(z.string()) }), bodyLimit: 10_000_000 }, ({ reply }) =>
		reply(200, { methodResponses: [] }),
	)
	.get('/download/:blobId', { params: z.object({ blobId: z.string().min(1) }) }, ({ reply }) =>
		reply(200, 'blob'),
	);
```

Here `/jmap` may answer the `Invalid` 400 and the `TooLarge` 413, and
`/download/:blobId`, which has no limit, the `Invalid` 400 alone. The
client reads each by its own schema, and
[`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi) documents
each kind's statuses on the routes that kind may refuse.

- **Fallback.** A kind with no hook of its own, or whose hook returns
  nothing, falls back to the general hook, `onRefusal(hook)`, then to the
  default of that kind. The types say so: a hook that may return nothing
  keeps the general hook's replies, or the default, beside its own.
- **Order.** A kind's hook replaces the one of that kind declared before
  it, and keeps the general hook as its fallback. A general hook declared
  after it replaces it, and every other one: it answers every kind.
- **Plugins.** A plugin's route tries the plugin's hooks first. Without a
  general hook of the plugin's own, it then tries the using app's hooks for
  that kind, then the app's general hook. A plugin's hook of one kind
  given to `use` applies to the routes declared after it, and keeps the
  app's general hook.

A hook that throws reaches the route's `onError` hooks, as a handler's
error does. A socket route's upgrade is refused through the same hook. A
message the socket refuses is answered on the socket, as before
([WebSockets](websockets.md)).

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

interface BaseContext extends RequestContext {   // derive, wrap, onError, onRefusal, handlers
	readonly route: string;                          // as declared: /users/:id
	readonly pathParams: Readonly<Record<string, string>>;
	readonly cookies: Readonly<Record<string, string>>; // the request's, parsed on first read
	readonly set: ResponseSettings;                  // { headers: Headers; cookies: ResponseCookies }
	readonly reply: FreeReplyFunction;
	readonly redirect: RedirectFunction;
}
```

`ResponseCookies` is Bun's `CookieMap`, documented as the response's: its
`get` and `has` read what this response set.

A handler reads `BaseContext`, what every hook before it added, and the
validated `params`, `query`, `headers`, `cookies` and `body`: a `cookies`
schema's output replaces the request's map for the handler alone. `ContextOf<App>`
names that context outside the chain ([The app's type](types.md#contextofapp)).

## See also

- [Groups and plugins](groups-and-plugins.md): scoping a hook to some
  routes, and sharing hooks across apps.
- [Replies](replies.md): `reply`, `set`, and errors.
