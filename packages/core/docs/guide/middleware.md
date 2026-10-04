# Middleware: which way to use

This page is the map of every way to run code around routes in alxia: the
order one request runs them in, which tool fits which need, and a working
snippet for each. A middleware is the one form — `(ctx, next) => …` — and
the request hooks of 0.3 (`onRequest`, `onResponse`, `around`, `wrap`,
`onError`, `onRefusal`) are deprecated for it ([Hooks](hooks.md)). The
details of each way live on [Routes and validation](routes.md),
[Groups and plugins](groups-and-plugins.md) and [Replies](replies.md).

```ts
import { alxia, defineMiddleware, validate, withHeaders } from '@alxia/core';
import { z } from 'zod';

const sessions = new Map([['s1', { id: 'u1', name: 'Ada' }]]);

const nosniff = defineMiddleware(async (_ctx, next) =>
	withHeaders(await next(), (headers) => headers.set('x-content-type-options', 'nosniff')),
);

const auth = defineMiddleware(({ cookies, reply }, next) => {
	const user = sessions.get(cookies['sid'] ?? '');
	return user ? next({ user }) : reply(401, { error: 'unauthenticated' as const });
});

const app = alxia()
	.use(nosniff) // every request, first
	.get('/health', ({ reply }) => reply(200, 'ok')) // no auth: not guarded
	.post('/notes', auth, validate({ body: z.object({ title: z.string().min(1) }) }), ({ user, body, reply }) =>
		reply(201, { title: body.title, owner: user.id }),
	);
// POST /notes without a session → 401, before the body is read; with one → 201, or 400 for a bad body
```

## The order of one request

Routing is decided first, then the request runs one chain of middlewares
around the router's answer, in the order declared: an onion. Code before
`await next()` runs on the way in, code after it on the way out.

1. **`around`** hooks (deprecated), the first declared outermost. A
   WebSocket upgrade skips them.
2. **`onRequest`** hooks (deprecated), in the order declared. A `Response`
   one returns skips to step 8.
3. **Routing.** The router finds the route, or none. From here `ctx.route`
   is the route's path as declared (`/users/:id`), or `undefined` on a
   request no route matches: a 404, a 405, a 426, an `OPTIONS` to a path
   with no `OPTIONS` route.
4. **The app's chain**, in the order declared: first the middlewares given
   to the deprecated `plugin(middleware)`, which run app-wide as 0.3's
   global hooks did, then every `use(middleware)`, `derive`, `decorate`
   and `wrap` — the app's, then the group's, a plugin's after those of the
   app that uses it. A `use(path, …)` one runs when the request's path is
   under `path`. A middleware that returns a reply or a `Response` ends the
   request there.
5. **The route's own middlewares**, in the order given: the ones a route is
   given after its path, `validate` and `responds` where they stand.
6. **The handler** — or, when no route matched, the router's 404, 405 or
   426.
7. **Unwinding.** The reply is checked by the `responds` in force and sent;
   then every middleware that awaited `next()` runs its code after it, the
   last first. It sees the response, or what the rest threw as the
   rejection of `next()`. **What nobody caught reaches the route
   boundary**, outermost, which answers it:
   - the client hung up: a bodyless `499`, no hook runs;
   - a refusal — a `ValidationError`, or a body past `bodyLimit`: the
     deprecated `onRefusal` hooks of its kind, then the general one, then
     the default 400 or 413;
   - anything else: the deprecated `onError` hooks in the order declared,
     then an `HttpError` as it says, then a logged 500.
8. **`onResponse`** hooks (deprecated), in the order declared, on every
   response.
9. **`around`** hooks unwind.

```
around                                              deprecated, outermost
└─ onRequest                                        deprecated; a Response here skips to onResponse
   └─ routing                                       decides the route, or none: ctx.route
      └─ use() middlewares, derive, decorate, wrap  the app's chain, in the order declared
         └─ the route's middlewares                 auth ─ validate ─ responds ─ …
            └─ handler                              or the 404 / 405 / 426 when no route matched
         ↑ each middleware that awaited next() unwinds here, the last first
      route boundary                                answers what nobody caught: refusal, onError, HttpError, 500
   onResponse                                       deprecated, last
```

Three rules follow, each spec'd:

- **A route runs the `use()` middlewares declared before it.** One declared
  after a route does not run for that route:

  ```ts
  import { alxia, defineMiddleware } from '@alxia/core';

  const stamp = defineMiddleware(async ({ set }, next) => {
  	set.headers.set('x-stamp', '1');
  	return next();
  });

  const app = alxia()
  	.get('/early', ({ reply }) => reply(200, 'early')) // no x-stamp
  	.use(stamp)
  	.get('/late', ({ reply }) => reply(200, 'late')); // x-stamp
  ```

- **A request no route matches runs every top-level `use()` middleware of
  the app, wherever declared**, then the 404, 405 or 426. So `/missing`
  above gets the stamp too, where `/early` does not. The same holds for the
  top-level `derive` and `decorate`, never a deprecated `wrap`, which keeps
  0.3's rule. A middleware may answer before
  the 404: a 401, a preflight's 204.

  ```ts
  const guard = defineMiddleware(({ request, reply }, next) =>
  	request.headers.has('x-user') ? next() : reply(401, { error: 'unauthorized' as const }),
  );

  const guarded = alxia()
  	.use(guard)
  	.get('/', ({ reply }) => reply(200, 'home'));
  // GET /missing without x-user → 401, not 404. With it → 404.
  ```

  A guard on the app guards what is not there too: scope it with a
  [group](#group) or a path (`use('/api', guard)`) to guard some routes only.

- **A group's middlewares stay under the group's prefix**: they run on the
  group's routes and on an unmatched request under its prefix, before its
  404 or 405 — so `DELETE /admin/secret` behind `group('/admin', g =>
  g.use(guard).get('/secret', …))` is the guard's 401, not a 405 whose
  `Allow` tells what is there — and on nothing else: no route declared
  after the group, no request outside its prefix. A group without a prefix
  of its own adds none to unmatched requests. A plugin with a prefix of its
  own (`alxia({ prefix: '/todos' })`, `defineRoutes('/todos')`) is such a
  group once mounted. A plugin without one (`app.plugin(otherApp)`) gives
  its middlewares to the app: the routes declared after it, and every
  unmatched request.

Where an observer or an error handler stands in the chain matters, and is
[below](#ordering).

## Which tool for which need

| Need | Tool | Applies to | Can end the request | Typed |
| --- | --- | --- | --- | --- |
| Something every request needs, a 404 included: a timer, a header, a guard, a preflight | [`use(middleware)`](#use-for-every-request-after-it), declared first | the routes declared after it, and every unmatched request | yes, with a reply or any `Response` | what it passes `next`, in those routes' context |
| The same, for a subtree such as `/admin` | [`use(path, middleware)`](#use-with-a-path) | requests under `path`, matched at run time | yes | nothing: it may add nothing to the context |
| A check or a load that some routes need | [a route's own middlewares](#a-routes-middlewares): `app.post(path, auth, canEdit, …, handler)` | the routes it is given to | yes | what it passes `next`, in that route's context |
| Validating `params`, `query`, `headers`, `cookies`, `body`; declaring and checking what a route answers | [`validate`, `responds`](#validate-and-responds) | the route they are given to | `validate`: a refusal | the validated parts; the reply's statuses; both in `app.routes` |
| Something added to the context, nothing to wrap | [`derive(fn)`](#derive) | the routes declared after it, and unmatched requests | yes, with a reply | what it returns |
| A value every request reads: a database, a config | [`decorate(values)`](#decorate) | the routes declared after it | no | its values |
| Scoping middlewares to some routes | [`group(build)`](#group) | the routes inside it | — | what its routes declare |
| Routes, middlewares and context shared across apps | [`app.plugin(app)`, `definePlugin`](#plugin-and-defineplugin) | its routes, then the routes declared after `plugin` | its middlewares can | as if written inline |
| Seeing the response a request will get, errors and 404s included | [`settle(ctx, next())`](#settle-see-the-response-the-client-gets) in a middleware | where the middleware stands | yes | no |
| Answering a refusal or an error in your own format | [a `try`/`catch` around `next()`](#answering-a-refusal-or-an-error), with `refusalOf` and `ValidationError` | what is behind the middleware | yes | no |
| Answering at once and finishing the work after | [`next.behind()`](#nextbehind-reply-now-finish-after) | where the middleware stands | yes | no |
| Capping a body | `bodyLimit(bytes)`, or a route's `{ bodyLimit }` | the routes declared after it, or one route | a 413 | the limit, in `app.routes` |

The hooks that were the answer before 0.4 — `onRequest`, `onResponse`,
`around`, `wrap`, `onError`, `onRefusal` — are in the [mapping on the Hooks
page](hooks.md#from-a-hook-to-a-middleware). They still run, as in 0.3.

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

- **Every request needs it, a 404 included**: `use(middleware)`, first. A
  timer, a request id, security headers, a preflight, a guard.
- **Some routes need it**: a middleware on those routes. It is named on each
  route, so the route says what guards it, and a check can differ route by
  route — `canView` here, `canEdit` there.
- **Every route after a point needs it, not a 404**: `use(middleware)` in a
  [group](#group).
- **A subtree needs a guard that adds nothing**: `use('/admin', guard)`. To
  add to a subtree's context, `use` the middleware in a group:
  `app.group('/admin', (admin) => admin.use(auth).get(…))`.
- **The same middlewares or routes in several apps**: a
  [plugin](#plugin-and-defineplugin).

A middleware on a route and one given to `use` are the same function, and
run and type the same way; they differ in how far they reach. When every
route of a group takes the same middleware, `use` in the group says it
once.

<a id="ordering"></a>

### Ordering

**Order is meaning.** A middleware's place in the chain decides what it
sees.

- **Observers first.** What watches every request — a logger, a tracing
  span, security headers, CORS, compression — is given to `use` first, so it
  wraps everything after it, a 404 included.
- **An error handler anywhere.** An observer settles `next()`
  ([below](#settle-see-the-response-the-client-gets)): it reads the
  response the error would be answered with, and the error goes on. A
  `try`/`catch` middleware catches it whether it is given before the
  observers or after them; given after them, the observers also see its
  reply, so that is still the place to give it. `use(janusErrors()).use(i18n).use(session())`
  answers a janus error as janus says.
- **A guard on the app runs on unmatched requests too**: an anonymous
  request to a missing path gets the 401, not the 404. Scope the guard with a
  group or a path to guard some routes only.
- **A route's middlewares run in the order given**, and that order decides
  which answer a client gets first: see
  [Where `validate` stands](#where-validate-stands). A middleware, `derive`,
  `decorate`, `bodyLimit` applies to the routes declared after it, at
  runtime and in the types alike. A route declared before a `use(auth)`
  neither runs it nor reads what it adds.

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
after it reads what the `validate` gave back. A `use()` middleware, a
`derive` or a `wrap` stands before every middleware of the route, so it
reads the request as it arrived too:

| | A middleware before `validate` | After `validate({ … })` | A `derive` or `wrap` on the chain | The handler |
| --- | --- | --- | --- | --- |
| `params` | the path's parameters, strings, typed by the route's path | the `params` schema's output | there at runtime, not in its type: read `pathParams` | the output, or the strings without a `params` schema |
| `pathParams` | the same strings | the same strings | the same strings | the same strings |
| `query` | the query string, `Record<string, string \| readonly string[]>` | the `query` schema's output | not in its type: read `url.searchParams` | the output, or the query string |
| `headers` | an object of the headers, names lowercased, read on first use | the `headers` schema's output | not in its type: read `request.headers` | the output, or the headers |
| `cookies` | the request's cookies, strings | the `cookies` schema's output | the request's cookies, strings | the output, or the request's cookies |
| `body` | `undefined`: the body is not read yet | the `body` schema's output | never | the output, or `undefined` without a `body` schema |

On a request no route matches, a `use()` middleware reads `route` as
`undefined`, and there are no path parameters. A route's own middlewares
and the handler read `route` as a `string`.

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
- **A middleware must not read the body itself.** `await
  request.json()` before a `validate` uses the body up, and the `validate`
  then fails with `TypeError: Body already used`, answered as a 500
  ([Troubleshooting](../troubleshooting.md#typeerror-body-already-used)).

## Reading cookies

Two different maps:

| | What it is | Where |
| --- | --- | --- |
| `ctx.cookies` | the **request's** cookies, parsed from `Cookie` on first read | every middleware and the handler; after a `validate({ cookies })`, the middlewares after it and the handler read its output instead, while the deprecated `onError` and `onRefusal` hooks still read the request's |
| `set.cookies` | the **response's** cookies, empty when the request starts | `set.cookies.set(…)` adds a `Set-Cookie`; `get` reads back only what this response set |

```ts
import { alxia, defineMiddleware } from '@alxia/core';

const sessions = new Map([['s1', 'ada']]);

const session = defineMiddleware(({ cookies }, next) =>
	next({ user: sessions.get(cookies['sid'] ?? '') ?? null }), // the request's
);

const app = alxia()
	.use(session)
	.post('/sign-out', ({ set, reply }) => {
		set.cookies.delete('sid'); // the response's
		return reply(204);
	});
```

`set.cookies.get('sid')` in a middleware is `null`, whatever the request
sent. The detail, and what a `cookies` schema changes, is on
[Hooks](hooks.md#reading-the-requests-cookies) and
[Replies](replies.md#headers-and-cookies-set).

## Each way

### A route's middlewares

Each made once with `defineMiddleware` and named on every route that needs
it, after the path — or after the route's options. They run after the
app's chain, in the order given. What one passes `next`, the ones after it
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
	behind(added?: object): Promise<Response>;
}
type Next<Added = Empty, Schema = Empty> = Response & { /* a brand, never set: what was added, what validate and responds declare */ };
```

A middleware written inline, `app.get(path, (ctx, next) => next({ a: 1 }), handler)`,
needs no `defineMiddleware`: its context is the route's, typed as it is
written.

<a id="use-for-every-route-after-it"></a>

### `use` for every request after it

Up to 8 middlewares made by `defineMiddleware`, run in the order given on
every route declared after `use` in this app or group, before the route's
own, and on every request no route matches. What each passes `next` is
typed in those routes, as a route's own middleware's is; a route declared
before `use` neither runs them nor reads it. A socket runs them on its
upgrade, as it runs its own.

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
// GET /me answers 200, 401 or 500; GET /missing without a token answers 401, not 404
```

On an unmatched request `ctx.route` is `undefined`: a middleware that reads
it, as a logger does, reads `route ?? url.pathname`.

`use` takes middlewares made by `defineMiddleware`; a plugin goes to
[`plugin`](#plugin-and-defineplugin). `use(plugin)` still mounts one, deprecated,
and tells the two apart by the mark `defineMiddleware` puts on a
middleware: a plain `(ctx, next) => …` given to `use` is called once as a
plugin, with the app, and `use` throws when it returns no app —
[`use(): the plugin function returned a promise, …`](../troubleshooting.md#plugin-the-plugin-function-returned-undefined-not-an-app-a-plugin-returns-the-app-it-is-given-a-middleware-is-made-with-definemiddleware-and-given-to-use).
A route takes a plain function. In the next minor, `use` takes one too.
`app.plugin(middleware)`, deprecated, keeps the meaning of 0.3, where
those middlewares were global hooks: it runs app-wide, on every route
declared before it and after it and on every unmatched request, before
the app's chain. What it adds to the context is typed only for the routes
after it. Given after routes, in development (`NODE_ENV` neither
`production` nor `test`), it warns once, naming them.

`use(middleware)` given after routes does not run on them, by design — a
`use()` after a route runs on unmatched requests and on the routes after
it. In development it warns once per app, naming the routes declared
before it, in case they needed it:

```
use(): the middleware runs on the routes declared after it and on requests no route matches, not on the route (GET /health) declared before it. Give it to use() before them if they need it.
```

### `use` with a path

The same, for the requests whose path is under `path`. The path is matched
against the **request's** path at run time, with the same pattern syntax as
routes, compiled once when `use` is called.

| `path` | Runs on |
| --- | --- |
| `'/admin'` | `/admin` and every path under it, segment by segment: not `/administrators` |
| `'/admin/*'` | the paths under `/admin`, not `/admin` itself |
| `'/users/:id/posts'` | `:id` is any one segment: `/users/7/posts` and `/users/me/posts/9`. A literal matches that literal alone: `'/users/me'` is not `/users/7` |

It runs for a route whose request path matches — a `/users/:id` route
requested as `/users/admin` runs `use('/users/admin', guard)` — and for an
unmatched request under the path, before its 404.

The request's path is read as the router, the static files and React
Router read it, and fails closed: each segment is decoded (an encoded `/`,
`%2F`, splits it), empty segments are collapsed (`//admin`, a trailing
`/`), and segments are compared **without case**, on purpose: React
Router's matching ignores case, and so does the file system of macOS. So
`/%61dmin/x`, `//admin/x`, `/admin%2Fx` and `/ADMIN/x` all run
`use('/admin', guard)`. A segment that does not decode, or a `.` or `..`
left in it once decoded, runs the middleware too. A route declared at a
fixed path is still settled when it is declared, at no cost per request.

```ts
import { alxia, defineMiddleware } from '@alxia/core';

const admin = defineMiddleware(({ request, reply }, next) =>
	request.headers.get('x-admin') === 'yes' ? next() : reply(403, { error: 'forbidden' as const }),
);

const app = alxia()
	.use('/admin', admin)
	.get('/admin/stats', ({ reply }) => reply(200, { users: 1 }))
	.get('/:section/users', ({ reply }) => reply(200, 'users'));
// GET /admin/stats, GET /admin/users, GET /admin/missing → 403 without x-admin; GET /public/users → 200
```

`path` is joined to the prefix of the app or group `use` is called on, and
checked as a route path is. The middlewares may add nothing to the
context: `next()`, a reply or a `Response`. One that passes `next` an
object does not compile:

```ts
alxia().use('/admin', auth);
// Invalid middleware: a middleware given a path may add nothing to the context, …

alxia().group('/admin', (admin) => admin.use(auth).get('/me', ({ user, reply }) => reply(200, user)));
```

What a path-scoped middleware adds would reach some requests and not others,
which no type can follow; a group is that subtree, typed. A path ending in
`/` is refused, since it would match nothing
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

A refusal is **thrown**: a `ValidationError`, which a middleware before the
`validate` can answer ([below](#answering-a-refusal-or-an-error)). Nobody
answering, it is the default 400. Every part, the 400, body parsers and
`bodyLimit` are on [Routes and validation](routes.md#validate-and-responds).

### `decorate`

The same values on every request, for every route after it.

```ts
import { alxia } from '@alxia/core';

const app = alxia()
	.decorate({ config: { region: 'eu' } as const })
	.get('/region', ({ config, reply }) => reply(200, config.region));
```

`decorate` is not deprecated. See [Hooks: `decorate`](hooks.md#decorate).

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

`derive` is not deprecated: it is the shorthand for a middleware given to
`use` that only adds, `use(defineMiddleware((ctx, next) => next({ … })))`,
and it cannot wrap what follows. A middleware returning `next({ user })`
does the same on the routes it is given to. See
[Hooks: `derive`](hooks.md#derive).

### `group`

Middlewares declared inside a group apply to its routes, and to an
unmatched request under its prefix, before the 404 or 405: never to a
route declared after the group. The group's routes keep every one
declared before it.
`use` in a group is how a subtree's context is added to:

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
// GET /admin/missing → 403 without x-admin, 404 with it; GET /missing → 404
```

`group(build)` with no prefix is a scope alone. See
[Groups and plugins: groups](groups-and-plugins.md#groups).

### `plugin` and `definePlugin`

An app given to `plugin` brings its routes, behind the app's middlewares,
its own `use(path, …)` moved under the prefix it is mounted at. A plugin
without a prefix of its own gives its middlewares to the routes declared
after `plugin` — and to unmatched requests, as the app's own do. One with
a prefix of its own, `alxia({ prefix: '/todos' })` or
`defineRoutes('/todos')`, keeps them under that prefix, as a group does:
its routes, and the unmatched requests under it. It then adds nothing to
the context of the routes after it, in the types too.

```ts
const todos = defineRoutes('/todos').use(requireAdmin).get('/', listTodos);
const app = base.plugin(todos).get('/public', ({ reply }) => reply(200, 'open'));
// GET /todos, GET /todos/missing → requireAdmin; GET /public, GET /missing → no requireAdmin
```

`definePlugin<Requires>()` builds an app plugin that reads
what an earlier one added. A `Plugin` function given to `plugin`, `(app) =>
app`, returns the app; `plugin` throws when it returns anything else.

```ts
import { alxia, definePlugin } from '@alxia/core';

const auth = alxia().derive(({ request, reply }) => {
	const id = request.headers.get('x-user');
	return id ? { user: { id } } : reply(401, { error: 'unauthenticated' as const });
});

const audit = definePlugin<{ user: { id: string } }>()((app) =>
	app.derive(({ user, request }) => ({ audit: `${user.id} ${request.method}` })),
);

const app = alxia()
	.plugin(auth)
	.plugin(audit) // compiles: auth adds a user with an id
	.get('/whoami', ({ audit, reply }) => reply(200, audit));
```

See [Groups and plugins: plugins](groups-and-plugins.md#plugins) and
[Writing a plugin](writing-a-plugin.md).

### `settle`: see the response the client gets

`next()` rejects when the rest threw. A middleware that must see every
response — a logger, a header on errors too — awaits
`settle(ctx, next())` instead: it resolves to what `next()` resolved to or,
when it rejected, to the answer the route boundary would give (the
deprecated `onError` and `onRefusal` hooks, an `HttpError`, a 500), and
leaves the error on `ctx.error`.

```ts
import { alxia, defineMiddleware, settle } from '@alxia/core';

const timing = defineMiddleware(async (ctx, next) => {
	const started = performance.now();
	const response = await settle(ctx, next());
	response.headers.set('server-timing', `app;dur=${(performance.now() - started).toFixed(1)}`);
	console.log(ctx.request.method, ctx.route ?? ctx.url.pathname, response.status);
	return response;
});

const app = alxia()
	.use(timing) // first: it sees 404s, 400s and 500s too
	.get('/boom', () => {
		throw new Error('boom');
	});
// GET /boom → 500 with a server-timing header; GET /missing → 404 with one
```

```ts
function settle<Settled extends Response>(ctx: object, pending: Promise<Settled>): Promise<Settled>;
```

`settle` does not swallow the error. Once the middleware returns the
response, the error goes on to the middlewares around it: a `try`/`catch`
there still catches it, and a `settle` there reads the response this one
returned, its headers included. When nothing catches it, that response —
what the observers made of it, the outermost last — is the one sent. So
an [error handler](#ordering) works wherever it is given; given after the
observers, they see its reply too.

### Answering a refusal or an error

An error is a rejection of `next()`: a middleware that wraps it in
`try`/`catch` sees what the rest threw, an `HttpError` included, and
answers only what is **behind** it.

`validate` throws a `ValidationError` (`extends HttpError<400>`, its
`.refusal` is `{ kind: 'validation', part, issues }`, its `.body` the
default 400 body); a body past its limit throws a `ContentTooLargeError`
(413). `refusalOf(error)` gives the `Refusal` of either —
`{ kind: 'validation', … }` or `{ kind: 'body_limit', limit }` — and
`undefined` for any other error. A middleware before the `validate` answers
it in its own format; nobody answering, the default 400 or 413 does.

```ts
import { alxia, defineMiddleware, refusalOf, validate } from '@alxia/core';
import { z } from 'zod';

const problems = defineMiddleware(async ({ reply }, next) => {
	try {
		return await next();
	} catch (error) {
		const refusal = refusalOf(error);
		if (refusal === undefined) throw error; // not ours: on to the next one, then the route boundary
		return refusal.kind === 'validation'
			? reply(422, { detail: `the ${refusal.part} is invalid` })
			: reply(413, { detail: `at most ${refusal.limit} bytes` });
	}
});

const app = alxia()
	.use(problems)
	.post('/notes', { bodyLimit: 1024 }, validate({ body: z.object({ title: z.string().min(1) }) }), ({ body, reply }) =>
		reply(201, body),
	);
// a bad body → 422 { "detail": "the body is invalid" }; a body over 1 KiB → 413
```

The same `try`/`catch` answers a domain error:

```ts
import { HttpError } from '@alxia/core';

class NotFoundError extends Error {}

const notFound = defineMiddleware(async ({ reply }, next) => {
	try {
		return await next();
	} catch (error) {
		if (error instanceof NotFoundError) return reply(404, { error: 'not_found' as const });
		throw error;
	}
});
```

Throwing on keeps the rest of the answer where it was: the next middleware
out, then the route boundary. See also [Replies: errors](replies.md#errors).

```ts
class ValidationError extends HttpError<400, ValidationErrorBody> {
	readonly refusal: ValidationRefusal;
}
class ContentTooLargeError extends HttpError<413, ContentTooLargeBody> {
	readonly limit: number;
}
function refusalOf(error: unknown): Refusal | undefined;
```

### `next.behind()`: reply now, finish after

`next.behind(added?)` runs the rest of the route behind a reply the
middleware returns at once: the rest's response goes to nobody, and an
error it throws rejects the promise `behind` returned. It stands in place
of `next()`. A cache serving a stale entry while it refreshes it uses it:

```ts
import { alxia, defineMiddleware } from '@alxia/core';

const stale = new Map<string, string>();

const swr = defineMiddleware(async ({ url, reply }, next) => {
	const held = stale.get(url.pathname);
	if (held === undefined) {
		const response = await next();
		stale.set(url.pathname, await response.clone().text());
		return response;
	}
	void next
		.behind()
		.then(async (fresh) => stale.set(url.pathname, await fresh.text()))
		.catch(console.error);
	return reply(200, held); // sent now; the route refreshes in the background
});

const app = alxia()
	.use(swr)
	.get('/time', ({ reply }) => reply(200, new Date().toISOString()));
```

### A route's own hooks

**Deprecated.** A list of hooks after the route's path, made with
`defineHook` or `defineWrap`, still runs as it did in 0.3: after the
app's chain, in the order listed, then the route's schema. Each is a
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
`validate` does too, but reads `pathParams` to stand anywhere. A route
mixing a list with middlewares throws. The list's detail is on
[Hooks: hooks on one route](hooks.md#hooks-on-one-route), and each change on
[Upgrading](../upgrading.md).

### `bodyLimit`

Caps the body of the routes after it, or of one route with the
`bodyLimit` of its options. A body past it is a 413: thrown as a
`ContentTooLargeError`, answered by a middleware that reads
`refusalOf(error)`, or by the default.

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

## See also

- [Hooks](hooks.md): the deprecated request hooks, each beside the
  middleware that replaces it, and what behaves differently once moved.
- [Routes and validation](routes.md): `validate`, `responds`, the options
  and the 400.
- [Groups and plugins](groups-and-plugins.md): scoping, prefixes and what
  `plugin` mounts.
- [Replies](replies.md): `reply`, `set`, and how errors become responses.
- [Upgrading](../upgrading.md): moving the hooks and a list of hooks to
  middlewares.
