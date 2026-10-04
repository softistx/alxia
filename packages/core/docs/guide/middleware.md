# Middleware: which way to use

This page is a map of every way to run code around routes in alxia: what
each is for, where it applies, when it runs, and what it adds to a route's
type. The details of each live on [Routes and validation](routes.md),
[Hooks](hooks.md), [Groups and plugins](groups-and-plugins.md) and
[Replies](replies.md).

```ts
import { alxia, defineMiddleware, validate, withHeaders } from '@alxia/core';
import { z } from 'zod';

const sessions = new Map([['s1', { id: 'u1', name: 'Ada' }]]);

const auth = defineMiddleware(({ cookies, reply }, next) => {
	const user = sessions.get(cookies['sid'] ?? '');
	return user ? next({ user }) : reply(401, { error: 'unauthenticated' as const });
});

const app = alxia()
	.onResponse((response) => withHeaders(response, (headers) => headers.set('x-content-type-options', 'nosniff'))) // every response
	.get('/health', ({ reply }) => reply(200, 'ok')) // no middleware: not guarded
	.post('/notes', auth, validate({ body: z.object({ title: z.string().min(1) }) }), ({ user, body, reply }) =>
		reply(201, { title: body.title, owner: user.id }),
	);
// POST /notes without a session → 401, before the body is read; with one → 201, or 400 for a bad body
```

## Which way

| Way | For | Applies to | Runs | Can end the request | Typed, and in `app.routes` |
| --- | --- | --- | --- | --- | --- |
| [A route's middlewares](#a-routes-middlewares), `app.post(path, auth, canEdit, …, handler)` | authenticating, a check, a load, a timer or a lock that some routes need, written once with `defineMiddleware` | the routes it is given to | after the scope's hooks, in the order given | yes, with a reply or any `Response` | what it passes `next`, in that route's context; its replies carry no schema |
| [`use(...middlewares)`](#use-for-every-route-after-it) | the same middlewares, for every route after a point: authenticating, a timer | the routes declared after it, in this app or group | after the hooks declared before it, before the route's own middlewares | yes, with a reply or any `Response` | what it passes `next`, in the context of those routes; its replies carry no schema |
| [`use(path, ...middlewares)`](#use-with-a-path) | a guard for a subtree: `/admin` | the routes declared after it under `path`, matched when each is declared | as above | yes, with a reply or any `Response` | nothing: it may add nothing to the context |
| [`validate(schemas)`](#validate-and-responds) | validating `params`, `query`, `headers`, `cookies` or `body` | the route it is given to | where it stands among the middlewares | yes, a 400 or the `onRefusal` hook's reply | the validated parts, in the context after it; its schemas, in `app.routes` |
| [`responds(responses)`](#validate-and-responds) | declaring what a route answers, and checking it | the route it is given to | on the handler's reply, and on a reply made after it with a status it declares | a reply it refuses becomes a 500 | the handler's `reply` typed by its statuses; its schemas, in `app.routes` |
| A route's options, `{ bodyLimit, detail }` | capping one route's body; `detail`, which nothing reads at run time | one route | whenever the body is read | yes, a 413 | both, in `app.routes` |
| [`decorate(values)`](#decorate) | a database, a logger, a config | the routes declared after it | before the route's middlewares | no | its values, in the context |
| [`derive(hook)`](#derive) | the shorthand for a `use` middleware that only adds: loading what every route after a point reads | the routes declared after it | before the route's middlewares | yes, with a reply | what it adds, in the context |
| [`wrap(hook)`](#wrap) | a transaction, a lock, an idempotency key, a header from the response, for every route after a point | the routes declared after it | around the route's middlewares and the handler | yes, with a reply, or any `Response` | nothing |
| [`bodyLimit(bytes)`](#bodylimit) | capping request bodies | the routes declared after it | whenever the body is read | yes, a 413 | the limit, in `app.routes` |
| [`onRefusal(hook)`](#onrefusal) | answering a 400 or a 413 in your own format | the routes declared after it | when a `validate` or the body limit refuses | yes, with a 4xx reply | the hook, in `app.routes`; its replies carry no schema |
| `onRefusal(schema, hook)` | the same, with schemas for its replies | the routes declared after it | as above | yes, with a 4xx reply | its `reply`, by its schemas; the hook, in `app.routes` |
| `onRefusal(kind, [schema,] hook)` | one kind of refusal, `'validation'` or `'body_limit'` | the routes declared after it that may be refused that way | as above | yes, with a 4xx reply | its replies, on the routes that kind may refuse; the hook, in `app.routes` |
| [`onError(hook)`](#onerror) | turning a thrown error into a reply | the routes declared after it | after something threw | yes, with a reply | nothing |
| [`onRequest(hook)`](#onrequest-onresponse-and-around) | a CORS preflight, a redirect to HTTPS | the whole app | before routing | yes, with a raw `Response` | no |
| `onResponse(hook)` | a header on every response, compression | the whole app | after everything else, 404s included | it replaces the response; keep its status | no |
| `around(hook)` | a request id in `AsyncLocalStorage`, a timer, a span | the whole app | outermost | yes, with a raw `Response` | no |
| [`group(build)`](#group) | scoping hooks to some routes | the routes inside it | — | — | what its routes declare |
| [`plugin(app)`](#plugin-and-defineplugin), `definePlugin` | routes, hooks and context shared across apps | its routes, then the routes declared after `plugin` | — | its hooks can | as if written inline |
| `plugin(fn)`, a `Plugin` function | global hooks shared across apps | the whole app | — | its hooks can | no |
| [A route's own hooks](#a-routes-own-hooks), `[canView]` — **deprecated** | what a middleware does now | one route | after the scope's hooks, before its schema | yes | as a middleware's |

"Typed" is what the handler and the middlewares after it read. alxia is
spec first: the OpenAPI document, written by hand, is the contract a client
is generated from, and a route adds nothing to the app's type for a client
to read. The document declares every reply a route may send, a
middleware's 401 and a refusal's 400 included, and a `responds` of those
schemas — written on the route, or made by `route(operation, …)` from a
generated operation — checks each reply made after it with a status it
declares. What is in `app.routes` is what a tool reading it sees:
[`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi)'s
`matchesSpec` checks the routes against the document's operations.

### Which to reach for

- **Some routes need it**: a middleware. It is named on each route, so the
  route says what guards it, and a check can differ route by route —
  `canView` here, `canEdit` there.
- **Every route after a point needs it**: `use(middleware)` — or a
  `derive`, `decorate` or `wrap` — in a [group](#group) when only some of
  them do. Written once, it reaches every route declared after it, a
  plugin's included.
- **A subtree needs a guard that adds nothing**: `use('/admin', guard)`.
  To add to a subtree's context, `use` the middleware in a group:
  `app.group('/admin', (admin) => admin.use(auth).get(…))`.
- **Every request, routed or not, and nothing a client is generated for**: a
  global hook, `onRequest`, `onResponse` or `around`.
- **The same hooks or routes in several apps**: a [plugin](#plugin-and-defineplugin).

A middleware on a route and one given to `use` are the same function, and
run and type the same way; they differ in how far they reach. When every
route of a group takes the same middleware, `use` in the group says it
once.

Two rules decide the rest:

- **Order is meaning.** A route's middlewares run in the order given, and
  that order decides which answer a client gets first: see
  [Where `validate` stands](#where-validate-stands). A hook declared on the
  chain — `use(...middlewares)`, `decorate`, `derive`, `wrap`, `bodyLimit`,
  `onRefusal`, `onError` — applies to the routes declared after it, at
  runtime and in the types alike. A route declared before a `use(auth)`
  neither runs it nor reads what it adds.
- **Global hooks are global.** `onRequest`, `onResponse` and `around` apply
  to every request wherever they are declared, inside a group or a plugin
  included. What they answer is in no route's OpenAPI document: use them
  only for what a client generated from it never asks.

## The order of one request

1. **`around`** hooks, the first declared outermost. A WebSocket upgrade
   skips them.
2. **`onRequest`** hooks, in the order declared. A `Response` one returns
   skips to step 9.
3. **Routing.** No route: `404`, `405` or `426`, then step 9.
4. **The scope's middlewares and route hooks**, in the order declared: the
   app's, then the group's, a plugin's after those of the app that uses it.
   A middleware given to `use` — with a path, only if the route is under
   it — runs as a route's own does; a `derive` or `decorate` runs and adds
   to the context; a `wrap` calls `next()` to run the rest. A reply from
   any of them ends the request, and the `wrap`s and middlewares around it
   see it as the response. A 404 or a 405 never reaches them.
5. **The route's middlewares**, in the order given:
   - a middleware runs, and `next(added)` runs the rest with `added` in the
     context; a reply or a `Response` it returns ends the request there;
   - a **`validate`** checks `params`, `query`, `headers`, `cookies`, then
     `body`, where it stands. A refusal is answered there: the `onRefusal`
     hooks of its kind, then the general one, then the default 400. The
     middlewares before it see that answer as the response of `next()`;
   - a **`responds`** checks nothing yet: it holds the schemas the replies
     made after it are checked against.
6. **The handler.**
7. **The reply** is checked by the `responds` in force where it was made,
   and sent. The handler's must have a status it declares; a middleware's
   is checked when its status is declared, and sent as it is otherwise. A
   reply it refuses is a 500.
8. **The middlewares that awaited `next()`, and the `wrap`s, unwind**, the
   last first. Each sees the response, or the error as a rejection of
   `next()`.
9. **An error nobody caught**, once they have unwound:
   - the client hung up: a bodyless `499`, no hook runs;
   - a body past `bodyLimit`: the `onRefusal` hooks of `body_limit`, then
     the general one, then the default 413;
   - anything else: the `onError` hooks in the order declared, a plugin's
     before the app's, then an `HttpError` as it says, then a logged 500.
10. **`onResponse`** hooks, in the order declared, on every response.
11. **`around`** hooks unwind.

```
around ─┐
        onRequest ─ routing ─ use() and scope hooks ─ route middlewares: auth ─ validate ─ responds ─ … ─ handler
                              └─ wrap, a use() middleware ─└─ a middleware awaiting next() ────────────────┘   ← unwinds here
                              onError / onRefusal(body_limit)                                                   ← what was thrown
        onResponse
around ─┘
```

A `413` from a body read too far is a refusal wherever the body was read —
a middleware, a `validate` or the handler — so it reaches `onRefusal`, not
`onError`. An `onError` reply is sent after the middlewares and `wrap`s
have unwound: none of them sees it.

### Where `validate` stands

`validate` is a step like any other, so where it stands decides which
refusal a client gets first:

```ts
import { alxia, defineMiddleware, validate } from '@alxia/core';
import { z } from 'zod';

const Post = z.object({ title: z.string().min(1) });

const auth = defineMiddleware(({ request, reply }, next) => {
	const id = request.headers.get('x-user');
	return id === null ? reply(401, { error: 'unauthorized' as const }) : next({ user: { id } });
});

const app = alxia()
	// a stranger gets 401 before his body is read: he never learns what a valid one looks like
	.post('/posts', auth, validate({ body: Post }), ({ user, body, reply }) =>
		reply(201, { by: user.id, ...body }),
	)
	// a bad body gets 400 before the user is asked: a public form that names its errors first
	.post('/drafts', validate({ body: Post }), auth, ({ user, body, reply }) =>
		reply(201, { by: user.id, ...body }),
	);
// POST /posts, no x-user, {"title":""}  → 401
// POST /drafts, no x-user, {"title":""} → 400
```

`responds` stands somewhere too — on a `route(operation, …)`, the
operation's stands just before the handler, unless `responds(operation)`
is placed ([Routes](routes.md#middlewares-on-a-route-declared-as-data)). It checks the handler's reply, which must
have a status it declares, and a reply a middleware after it makes with a
status it declares. A middleware's reply made before it, or with a status
it does not declare, is sent as it is:

```ts
import { responds } from '@alxia/core';

const Created = z.object({ by: z.string(), title: z.string() });
const Unauthorized = z.object({ error: z.literal('unauthorized') });

app
	// auth's 401 is sent as it is: auth stands before responds
	.post('/a', auth, responds({ 201: Created }), ({ user, reply }) => reply(201, { by: user.id, title: 'a' }))
	// auth's 401 is checked by its schema, and sent as its output
	.post('/b', responds({ 201: Created, 401: Unauthorized }), auth, ({ user, reply }) => reply(201, { by: user.id, title: 'b' }))
	// auth's 401 is a status responds does not declare: sent as it is
	.post('/c', responds({ 201: Created }), auth, ({ user, reply }) => reply(201, { by: user.id, title: 'c' }));
```

The handler cannot answer a status `responds` does not declare: it does
not compile, and a reply cast past the types is a 500, the
`ResponseValidationError` logged.

<a id="hooks-run-before-validation"></a>

## What a middleware reads

A middleware before any `validate` reads the request as it arrived; one
after it reads what the `validate` gave back. The route hooks run before
every middleware, so they read the request as it arrived too:

| | A middleware before `validate` | After `validate({ … })` | A `derive` or `wrap` on the chain | The handler |
| --- | --- | --- | --- | --- |
| `params` | the path's parameters, strings, typed by the route's path | the `params` schema's output | there at runtime, not in its type: read `pathParams` | the output, or the strings without a `params` schema |
| `pathParams` | the same strings | the same strings | the same strings | the same strings |
| `query` | the query string, `Record<string, string \| readonly string[]>` | the `query` schema's output | not in its type: read `url.searchParams` | the output, or the query string |
| `headers` | an object of the headers, names lowercased, read on first use | the `headers` schema's output | not in its type: read `request.headers` | the output, or the headers |
| `cookies` | the request's cookies, strings | the `cookies` schema's output | the request's cookies, strings | the output, or the request's cookies |
| `body` | `undefined`: the body is not read yet | the `body` schema's output | never | the output, or `undefined` without a `body` schema |

```ts
import { alxia, validate } from '@alxia/core';
import { z } from 'zod';

const app = alxia().get(
	'/:id',
	({ params, query, headers }, next) => next({ raw: { params, query, agent: headers['x-agent'] } }),
	validate({ params: z.object({ id: z.coerce.number() }) }),
	({ raw, params, reply }) => reply(200, { raw, id: params.id }),
);
// GET /7?q=1 → { "raw": { "params": { "id": "7" }, "query": { "q": "1" }, "agent": … }, "id": 7 }
```

`pathParams` is the stable name for the raw path parameters: `params` is
the schema's output once a `validate` has read it. A middleware written to
stand anywhere reads `pathParams`, and names it in
`defineMiddleware<{ pathParams: { id: string } }>()`.

Three consequences:

- **A refusal before `validate` comes before a 400.** A 401 or a 403 from a
  middleware placed before it, or from a `derive`, is sent without reading
  the body.
- **A check that needs the body goes after `validate`**: a middleware placed
  after it reads the validated body, and so does the handler.
- **A middleware or hook must not read the body itself.** `await
  request.json()` before a `validate` uses the body up, and the `validate`
  then fails with `TypeError: Body already used`, answered as a 500
  ([Troubleshooting](../troubleshooting.md#typeerror-body-already-used)).

## Reading cookies

Two different maps:

| | What it is | Where |
| --- | --- | --- |
| `ctx.cookies` | the **request's** cookies, parsed from `Cookie` on first read | every hook and middleware, and the handler; after a `validate({ cookies })`, the middlewares and the handler read its output instead, while `onError` and `onRefusal` still read the request's |
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

### A route's middlewares

Each made once with `defineMiddleware` and named on every route that needs
it, after the path — or after the route's options. They run after the
scope's hooks, in the order given. What one passes `next`, the ones after it
and the handler read. Its replies end that route's request alone.
`defineMiddleware<Requires>()` names what a middleware reads beyond the
base context, and a route that does not give it there does not compile:

```ts
import { alxia, defineMiddleware, validate } from '@alxia/core';
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

const auth = defineMiddleware(({ cookies, reply }, next) => {
	const user = sessions.get(cookies['sid'] ?? '');
	return user ? next({ user }) : reply(401, { error: 'unauthenticated' as const });
});

const canView = defineMiddleware<{ user: User; pathParams: { id: string } }>()(
	({ user, pathParams, reply }, next) => {
		const note = notes.get(pathParams.id);
		return note && (note.shared || note.owner === user.id)
			? next({ note })
			: reply(404, { error: 'not_found' as const });
	},
);

const canEdit = defineMiddleware<{ user: User; note: Note }>()(({ user, note, reply }, next) =>
	note.owner === user.id ? next() : reply(403, { error: 'forbidden' as const }),
);

const app = alxia({ prefix: '/notes' })
	.get('/:id', auth, canView, ({ note, reply }) => reply(200, note))
	.patch('/:id', auth, canView, canEdit, validate({ body: z.object({ title: z.string().min(1) }) }), ({ note, body, reply }) => {
		note.title = body.title;
		return reply(200, note);
	});
// PATCH /notes/:id → 401 without a session, 404 for a note it may not see, 403 for someone else's,
// 400 for a bad body, 200 otherwise: in that order
```

`GET` checks only that the note may be seen. Every check stands before
`validate`, so a 403 comes before a 400. `canView` reads `pathParams.id`,
the string it arrived as, so it may stand before or after a `validate` of
the params.

A middleware that awaits `next()` runs around the rest of the route — the
middlewares after it and the handler — and receives its `Response`:

```ts
const exclusive = defineMiddleware<{ pathParams: { id: string } }>()(
	async ({ pathParams, reply }, next) =>
		(await locks.tryRun(pathParams.id, next)) ?? reply(409, { error: 'busy' as const }),
);
```

| A middleware returns | Effect |
| --- | --- |
| `next()`, `next(added)` | runs the rest; `added` is merged into the context of what follows, and typed there |
| a reply, `reply(…)`, `redirect(…)` | ends the request with it |
| a `Response` | sent as it is |
| nothing, once it called `next()` — `await next()` with no `return`, or `next()` not awaited | the rest's response, as Koa and Hono answer |
| anything else, or nothing without calling `next()` | a `TypeError` naming the route — `GET /x: a middleware (name) returned nothing: return next(), a reply or a Response` — answered as a 500 |

`next()` is called once at most, before the middleware returns: a second
call throws `GET /x: a middleware called next() twice`, and a call after it
returned `GET /x: a middleware called next() after it returned` — the rest
of the route never runs then. Both are a 500. A middleware that returns a
reply of its own before the `next()` it called settled — `next(); return
reply(403)` — has started the rest, which runs anyway: its reply is sent
once the rest has run, `console.warn` says `GET /x: a middleware returned
before the next() it called settled: …`, and an error the rest throws is
logged rather than left unhandled. Decide before calling `next()`. A route takes up to 8
middlewares, `validate` and `responds` included; a ninth does not compile.
`ws` takes them on the upgrade ([WebSockets](websockets.md#the-upgrade));
`route`, `static`, `file` and `page` do not.

```ts
defineMiddleware(middleware: Middleware<Empty, Result>): Middleware<Empty, Result>;
defineMiddleware<Requires>(): (middleware: Middleware<Requires, Result>) => Middleware<Requires, Result>;

type Middleware<Requires = Empty, Result = MiddlewareReturn> = (ctx: MiddlewareContext<Requires>, next: NextFunction) => Result;
type MiddlewareContext<Requires = Empty> = BaseContext & Requires;
type MiddlewareResult = Next | AnyReply | Response; // the brand is Next's, never any
type MiddlewareReturn = MaybePromise<MiddlewareResult>;

interface NextFunction {
	(): Promise<Next>;
	<Added extends object>(added: Added): Promise<Next<Added>>;
}
type Next<Added = Empty, Schema = Empty> = Response & { /* a brand, never set: what was added, what validate and responds declare */ };
```

A middleware written inline, `app.get(path, (ctx, next) => next({ a: 1 }), handler)`,
needs no `defineMiddleware`: its context is the route's, typed as it is
written.

### `use` for every route after it

Up to 8 middlewares made by `defineMiddleware`, run on every route declared
after `use` in this app or group, before the route's own, in the order
given. What each passes `next` is typed in those routes, as a route's own
middleware's is; a route declared before `use` neither runs them nor reads
it. A socket runs them on its upgrade, as it runs its own.

```ts
import { alxia, defineMiddleware } from '@alxia/core';

const tokens = new Map([['Bearer ada', { id: 'u1' }]]);

const auth = defineMiddleware(({ request, reply }, next) => {
	const user = tokens.get(request.headers.get('authorization') ?? '');
	return user ? next({ user }) : reply(401, { error: 'unauthenticated' as const });
});

const app = alxia()
	.get('/health', ({ reply }) => reply(200, 'ok')) // before use: no 401
	.use(auth)
	.get('/me', ({ user, reply }) => reply(200, user)); // `user` typed
// GET /me answers 200, 401 or 500
```

`use` takes middlewares made by `defineMiddleware`; a plugin goes to
[`plugin`](#plugin-and-defineplugin). `use(plugin)` still mounts one, deprecated,
and tells the two apart by the mark `defineMiddleware` puts on a
middleware: a plain `(ctx, next) => …` given to `use` is called once as a
plugin, with the app, and `use` throws when it returns no app —
[`use(): the plugin function returned a promise, …`](../troubleshooting.md#plugin-the-plugin-function-returned-undefined-not-an-app-a-plugin-returns-the-app-it-is-given-a-middleware-is-made-with-definemiddleware-and-given-to-use).
A route takes a plain function. In the next minor, `use` takes one too.

### `use` with a path

The same, for the routes declared after it whose path is under `path`,
matched once, when each route is declared: no request pays for it.

| `path` | Runs on |
| --- | --- |
| `'/admin'` | `/admin` and every route under it, segment by segment: not `/administrators` |
| `'/admin/*'` | the routes under `/admin`, not `/admin` itself |
| `'/users/:any/posts'` | `:any` is any one segment — a literal, a parameter or a wildcard: `/users/:id/posts`, `/users/me/posts/:postId`. A literal matches that literal alone: `'/users/me'` is not `/users/:id` |

`path` is joined to the prefix of the app or group `use` is called on, and
checked as a route path is. The middlewares may add nothing to the
context: `next()`, a reply or a `Response`. One that passes `next` an
object does not compile:

```ts
const admin = defineMiddleware(({ request, reply }, next) =>
	request.headers.get('x-admin') === 'yes' ? next() : reply(403, { error: 'forbidden' as const }),
);

alxia().use('/admin', admin).get('/admin/stats', ({ reply }) => reply(200, { users: 1 }));

alxia().use('/admin', auth);
// Invalid middleware: a middleware given a path may add nothing to the context, …

alxia().group('/admin', (admin) => admin.use(auth).get('/me', ({ user, reply }) => reply(200, user)));
```

What a path-scoped middleware adds would reach some routes and not others,
which no type can follow; a group is that subtree, typed.

The path is matched against each route's declared path, not the request's
URL: `use('/admin', guard)` does not run on a route declared at
`/:section`, though that route serves `GET /admin`. A path ending in `/`
is refused, since it would match no route
([Troubleshooting](../troubleshooting.md#a-usepath-guard-did-not-run-on-a-request-under-its-path)).

### `validate` and `responds`

Middlewares the core runs itself: `validate` checks the parts of the request
it is given a schema for and passes their output on; `responds` types the
handler's `reply` and checks its reply, and a middleware's after it whose
status it declares.

```ts
import { alxia, responds, validate } from '@alxia/core';
import { z } from 'zod';

const Note = z.object({ id: z.number(), title: z.string() });

const app = alxia().patch(
	'/notes/:id',
	validate({ params: z.object({ id: z.coerce.number().int() }), body: z.object({ title: z.string() }) }),
	responds({ 200: Note }),
	({ params, body, reply }) => reply(200, { id: params.id, title: body.title }), // params.id: number
);
```

Every part, the 400, body parsers and `bodyLimit` are on
[Routes and validation](routes.md#validate-and-responds).

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
the context after it; a reply it returns ends the request, on every route
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
// GET /me answers 200, 401 or 500
```

`derive` is the shorthand for a middleware given to `use` that only adds:
`use(defineMiddleware((ctx, next) => next({ … })))`. A middleware returning
`next({ user })` does the same on the routes it is given to. See
[Hooks: `derive`](hooks.md#derive).

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

For one route, a middleware that awaits `next()` does the same
([above](#a-routes-middlewares)). See [Hooks: `wrap`](hooks.md#wrap).

### A route's own hooks

**Deprecated.** A list of hooks after the route's path, made with
`defineHook` or `defineWrap`, still runs as it did in 0.3: after the
scope's hooks, in the order listed, then the route's schema. Each is a
middleware now — a `defineHook` that returned an object returns
`next(added)`, one that returned nothing returns `next()`, a `defineWrap`
awaits `next()`:

```ts
// deprecated: hooks in a list after the path, a schema before the handler
const canEdit = defineHook<{ user: User; note: Note }>()(({ user, note, reply }) =>
	note.owner === user.id ? undefined : reply(403, { error: 'forbidden' as const }),
);
app.derive(authenticate).patch('/:id', [canView, canEdit], { body: Update }, handler);

// now: middlewares, in the order they run
const canEdit = defineMiddleware<{ user: User; note: Note }>()(({ user, note, reply }, next) =>
	note.owner === user.id ? next() : reply(403, { error: 'forbidden' as const }),
);
app.patch('/:id', auth, canView, canEdit, validate({ body: Update }), handler);
```

A hook of the list read `params` as strings; a middleware before a
`validate` does too, but reads `pathParams` to stand anywhere. The list's
detail is on [Hooks: hooks on one route](hooks.md#hooks-on-one-route), and
each change on [Upgrading](../upgrading.md).

### `bodyLimit`

Caps the body of the routes after it, or of one route with the
`bodyLimit` of its options. A body past it is a 413, or what `onRefusal`
answers.

```ts
import { alxia, validate } from '@alxia/core';
import { z } from 'zod';

const Note = z.object({ title: z.string() });

const app = alxia()
	.bodyLimit(64 * 1024)
	.post('/notes', validate({ body: Note }), ({ body, reply }) => reply(201, body))
	.post('/upload', { bodyLimit: 25 * 1024 * 1024 }, async ({ request, reply }) =>
		reply(201, { bytes: (await request.arrayBuffer()).byteLength }),
	);
```

See [Routes: body size](routes.md#body-size-bodylimit).

### `onRefusal`

Answers a request the app refuses before the handler: a body or a parameter
a `validate` refuses, or a body past its limit. In general, with schemas, or
per kind:

```ts
import { alxia, problem, validate } from '@alxia/core';
import { z } from 'zod';

const Invalid = z.object({ type: z.string(), status: z.literal(422), detail: z.string() });

const app = alxia()
	.onRefusal((refusal) =>
		refusal.kind === 'body_limit' ? problem({ status: 413, detail: `at most ${refusal.limit} bytes` }) : undefined,
	)
	.onRefusal('validation', { response: { 422: Invalid }, contentType: 'application/problem+json' }, (refusal, { reply }) =>
		reply(422, { type: 'urn:example:invalid', status: 422, detail: `the ${refusal.part} is invalid` }),
	)
	.post('/notes', { bodyLimit: 1024 }, validate({ body: z.object({ title: z.string() }) }), ({ body, reply }) =>
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
answer is in a route's OpenAPI document.

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

Hooks and middlewares declared inside a group apply to its routes only.
The group's routes keep every one declared before it. `use` in a group is
how a subtree's context is added to:

```ts
import { alxia, defineMiddleware } from '@alxia/core';

const app = alxia()
	.group('/admin', (admin) =>
		admin
			.use(
				defineMiddleware(({ request, reply }, next) =>
					request.headers.get('x-admin') === 'yes'
						? next({ admin: true as const })
						: reply(403, { error: 'forbidden' as const }),
				),
			)
			.get('/stats', ({ admin, reply }) => reply(200, { users: 1, admin })),
	)
	.get('/public', ({ reply }) => reply(200, 'open')); // no 403 here
```

`group(build)` with no prefix is a scope alone. See
[Groups and plugins: groups](groups-and-plugins.md#groups).

### `plugin` and `definePlugin`

An app given to `plugin` brings its routes, and its route hooks and
middlewares then apply to the routes declared after `plugin`. A `Plugin`
function, given to `plugin` too, adds global hooks, returns the app and
leaves the type alone; `plugin` throws when it returns anything else. `definePlugin<Requires>()` builds an app plugin that
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
	.plugin(timing)
	.plugin(auth)
	.plugin(audit) // compiles: auth adds a user with an id
	.get('/whoami', ({ audit, reply }) => reply(200, audit));
```

See [Groups and plugins: plugins](groups-and-plugins.md#plugins) and
[Writing a plugin](writing-a-plugin.md).

## See also

- [Routes and validation](routes.md): `validate`, `responds`, the options
  and the 400.
- [Hooks](hooks.md): every hook's signature, options and edge cases.
- [Groups and plugins](groups-and-plugins.md): scoping, prefixes and what
  `plugin` mounts.
- [Replies](replies.md): `reply`, `set`, and how errors become responses.
- [Upgrading](../upgrading.md): moving a list of hooks and a schema to
  middlewares.
