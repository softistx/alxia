# @alxia/core

An HTTP framework for [Bun](https://bun.sh), type-safe from the request to
the reply, with **no dependency**. Each route declares what it
reads and what it answers with any [Standard Schema](https://standardschema.dev)
— Zod, Valibot, ArkType, or one written by hand — among its middlewares,
and the types follow: the handler reads validated values, and can only answer
what it declared.

alxia is **OpenAPI spec first**: the OpenAPI document, written by hand, is
the contract. A client is generated from it with the generator you choose,
and so are the server's routes — the examples use
[`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen),
whose `alxia` option writes each operation for `route()`. The operation's
schemas check every request and reply at run time, and
[`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi)'s
`matchesSpec` checks, in a test, that the app routes the document's
operations and nothing else
([upgrading](https://github.com/softistx/alxia/blob/develop/packages/core/docs/upgrading.md#alxia-is-openapi-spec-first)).

## Getting started

```sh
bun create @alxia my-app
```

writes a new app — an API with Zod, an API-key check on its route and a spec
calling it in process, or React Router's official template served by alxia — installs it,
and prints `cd my-app` and `bun dev`
([`@alxia/create`](https://www.npmjs.com/package/@alxia/create)). Into an
existing project:

```sh
bun add @alxia/core
bun add -d typescript
```

Everything else is a package of its own, to take or leave:
[`@alxia/zod`](https://www.npmjs.com/package/@alxia/zod),
[`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi),
[`@alxia/graphql`](https://www.npmjs.com/package/@alxia/graphql),
[`@alxia/cors`](https://www.npmjs.com/package/@alxia/cors),
[`@alxia/secure-headers`](https://www.npmjs.com/package/@alxia/secure-headers),
[`@alxia/rate-limit`](https://www.npmjs.com/package/@alxia/rate-limit),
[`@alxia/compress`](https://www.npmjs.com/package/@alxia/compress),
[`@alxia/jwt`](https://www.npmjs.com/package/@alxia/jwt),
[`@alxia/logger`](https://www.npmjs.com/package/@alxia/logger),
[`@alxia/env`](https://www.npmjs.com/package/@alxia/env).

## A first app

```ts
import { alxia, defineMiddleware, responds, validate } from '@alxia/core';
import { zq } from '@alxia/zod';
import { z } from 'zod';

const User = z.object({ id: z.number(), name: z.string() });
const NotFound = z.object({ error: z.literal('not_found') });

const auth = defineMiddleware(async ({ request, reply }, next) => {
	const user = await session(request);
	return user ? next({ user }) : reply(401, { error: 'unauthorized' as const });
});

const app = alxia()
	.get(
		'/users/:id',
		validate({ params: z.object({ id: zq.int() }) }),
		responds({ 200: User, 404: NotFound }),
		async ({ params, reply }) => {
			const user = await findUser(params.id); // params.id: number
			return user ? reply(200, user) : reply(404, { error: 'not_found' });
		},
	)
	.post(
		'/users',
		auth,
		validate({ body: z.object({ name: z.string().min(1) }) }),
		responds({ 201: User }),
		async ({ user, body, reply }) => reply(201, await createUser(user, body.name)),
	);

app.listen(3000);
```

A route is a path, its middlewares, then its handler. They run in the order
given: `POST /users` answers a stranger 401 before it reads his body, then
400 for a bad body, then 201. `listen` hands the routes to `Bun.serve`'s own
router. `app.fetch` is the same app as a fetch handler;
`app.request('/users/1')` calls it in process.

## What the types refuse

Each of these is a compile error, not a runtime surprise:

```ts
app.get('/users/:id', validate({ params: z.object({ name: z.string() }) }), ...); // not the path's parameters
app.get('/users', validate({ quey: z.object({}) }), ...);                          // a typo
app.get('/me', ({ user }, next) => ..., auth, ...);                                // `user` before the middleware that adds it
app.post('/users', { body: User }, auth, ...);                                     // a schema in the options
({ reply }) => reply(201, user);                                                   // behind responds({ 200: User }): a status not declared
({ reply }) => reply(200, { id: '1' });                                            // a body its schema refuses
```

## Middlewares

A middleware is `(ctx, next) => …`, written once with `defineMiddleware` and
given to every route that needs it. It returns `next(added)` — `added` is
typed in the context of everything after it — a reply, which ends the
request, or a `Response`, sent as it is. Awaited,
`next()` resolves to the response of the rest of the route, so a middleware
can run around it. `validate` and `responds` are middlewares too, and stand
where they are given:

```ts
import { alxia, defineMiddleware, responds, validate } from '@alxia/core';
import { z } from 'zod';

const Post = z.object({ title: z.string().min(1) });

const auth = defineMiddleware(async ({ request, reply }, next) => {
	const user = await session(request);
	if (!user) return reply(401, { error: 'unauthorized' as const });
	return next({ user }); // `user`, typed, in everything after
});

const timed = defineMiddleware(async (_ctx, next) => {
	const started = performance.now();
	const response = await next(); // the rest of the route, as a Response
	response.headers.set('server-timing', `app;dur=${performance.now() - started}`);
	return response;
});

const app = alxia().post(
	'/posts',
	{ bodyLimit: 1024 * 1024, detail: { summary: 'Create a post' } }, // options: never a schema
	timed,
	auth,                     // a 401 before the body is read
	validate({ body: Post }), // a 400, or the reply of a middleware before it
	responds({ 201: Post }),  // types the handler's `reply`, checks it
	({ user, body, reply }) => reply(201, createPost(user, body)),
);
// POST /posts answers 201, 400, 401, 413 or 500
```

| Piece | Does |
| --- | --- |
| `app.<method>(path, options?, ...middlewares, handler)` | up to 8 middlewares, each reading what the ones before it added; the handler last |
| `options` | `bodyLimit` (bytes, a 413 past it) and `detail` (`summary`, `operationId`, `tags`…: read by nothing at run time; a generated operation carries it); a schema there does not compile, and throws where the route is declared |
| `defineMiddleware(fn)` | types `fn`, marks it as a middleware, and returns it. One that calls `next()` and returns nothing answers with the rest's response, as Koa and Hono do |
| `app.use(...middlewares)` | up to 8 `defineMiddleware`s, run on every request in the order declared: a route runs the ones declared before it, then its own, and a request no route matches — a 404 — runs them all; what each adds is typed in the routes after it |
| `app.use(path, ...middlewares)` | the same for the requests under `path` alone, matched against the request's path; they may add nothing |
| `defineMiddleware<{ user: User; pathParams: { id: string } }>()(fn)` | a middleware that reads more than the base context; a route that does not give it, where the middleware is placed, does not compile |
| `validate({ params, query, headers, cookies, body })` | any Standard Schema per part; what follows reads their output; a request it refuses throws a `ValidationError`. Before it, a middleware reads the request as it arrived: `params` as strings, `query` raw, `body` `undefined`. Each `validate` reads the request as it arrived, a second one of the cookies included |
| `responds({ 200: Post, 404: NotFound })` | the handler's `reply` typed by the statuses, and its reply checked and sent as its schema's output: a body it refuses is a 500. A middleware after it that replies with a declared status is checked too; any other status it sends as it is |
| `validate(operation)`, `responds(operation)` | the same, read from an operation's `schema`: on `route(operation, …)`, where one stands replaces the implicit one the route places just before its handler |

Position is meaning: `auth, validate(…)` answers a stranger 401 before his
body is read; `validate(…), auth` answers a bad body 400 first. A reply
made before a `responds` is never checked; `auth`'s 401 after it is checked
only if `responds` declares a 401. Both declare their schemas on the route,
in `app.routes`.

The forms of 0.3 still run, as 0.3 ran them, and are deprecated: a list of
hooks after the path, a schema before the handler, `defineHook` and
`defineWrap`; and the hooks `onRequest`, `onResponse`, `around`, `wrap`,
`onError` and `onRefusal`, which a middleware replaces
([Hooks](#context-and-hooks)).

```ts
// deprecated
app.patch('/posts/:id', [canView], { params: PostId, body: Update, response: { 200: Post } }, handler);
// now
app.patch('/posts/:id', canView, validate({ params: PostId, body: Update }), responds({ 200: Post }), handler);
```

[Upgrading](https://github.com/softistx/alxia/blob/develop/packages/core/docs/upgrading.md)
has each one, before and after.

### Middlewares for the whole app: `use`

`app.use(...middlewares)` runs them on every request, in the order they are
declared, Koa and Hono style: the code before `await next()` runs on the way
in, the code after it on the way out. A route runs the ones declared before
it, then its own; what they pass `next` is typed in the routes after them,
and not in the routes before. A request no route matches — a 404, a 405, a
preflight — runs all of them, wherever declared, then the router's answer: a
middleware may answer before it. `app.use(path, ...middlewares)` runs them on
the requests under `path` alone, matched against the request's path with the
syntax of a route's, and they may add nothing to the context: to add to a
subtree's, `use` them in a group.

```ts
import { alxia, defineMiddleware } from '@alxia/core';

const auth = defineMiddleware(({ request, reply }, next) => {
	const id = request.headers.get('x-user');
	return id ? next({ user: { id } }) : reply(401, { error: 'unauthorized' as const });
});
const admin = defineMiddleware(({ request, reply }, next) =>
	request.headers.has('x-admin') ? next() : reply(403, { error: 'forbidden' as const }),
);
const timed = defineMiddleware(async (_ctx, next) => {
	const response = await next();
	response.headers.set('x-timed', '1');
	return response;
});
const loadTeams = defineMiddleware<{ user: { id: string } }>()(({ user }, next) =>
	next({ teams: [`${user.id}'s team`] }),
);

alxia()
	.get('/health', ({ reply }) => reply(200, 'ok')) // declared before use(auth): open
	.use(auth)                                       // every request after: a 401, or `user` typed
	.use('/admin', admin)                            // /admin and under: a 403 next
	.get('/me', ({ user, reply }) => reply(200, user))
	.get('/admin/stats', timed, ({ reply }) => reply(200, { users: 1 })) // auth, admin, timed, handler
	.group('/teams', (teams) =>
		teams.use(loadTeams).get('/', ({ teams, reply }) => reply(200, teams)), // adds, in a group
	);
// GET /missing: 401 without x-user — auth runs before the 404 — and 404 with it
```

| Path | Runs on |
| --- | --- |
| `'/admin'` | `/admin` and every request under it, segment by segment: not `/administrators` |
| `'/admin/*'` | the requests under `/admin`, not `/admin` itself |
| `'/users/:any/posts'` | `:any` is any one segment: `/users/:id/posts`, `/users/me/posts/:postId`; a literal matches that literal alone |

`use` takes middlewares made by `defineMiddleware`, whose mark it reads; a
plugin goes to [`app.plugin(…)`](#plugins). `use(plugin)` still mounts one,
deprecated, and throws when a function given to it returns no app — a
guard written without `defineMiddleware` is refused there, rather than
called once as a plugin and never on a request. A socket runs them on its
upgrade. `derive` stays, the shorthand for a middleware that only adds.

Four rules follow from running on every request:

- **`ctx.route` is `string | undefined`** in a middleware given to `use`:
  `undefined` on a request no route matches. A route's own middlewares and
  its handler read a `string`.
- **A guard on the app answers a missing path too**: `bearer`, a required
  session and `rateLimit` give an anonymous request to `/nowhere` its 401,
  not a 404. A group guards some routes only; `use('/api', guard)` does for a
  guard that adds nothing to the context.
- **A group's middlewares stay with its routes**: they do not run on an
  unmatched request, even one under the group's prefix. The middlewares of a
  plugin app are the app's, and do.
- **A `use` after a route does not run for it**, and does for a request no
  route matches.

The order matters. Give the observers first — `logger()`, `telemetry()`,
`secureHeaders()`, `cors()`, `compress()` — so that they wrap everything, a
404 included. A middleware that answers errors itself (a try/catch around
`next()`, `janusErrors()`) goes after them: an observer settles `next()`,
which answers an error before an outer try/catch could see it.

An error is a rejection through `next()`: a middleware's
`try { return await next() } catch (error) { … }` sees what the rest threw,
an `HttpError` included. What nobody catches reaches the route's boundary,
outermost, which answers an `HttpError` as it says and anything else with a
500. A middleware that must see the response the client will get —
a logger, a header on every response, the error's included — settles
`next()` with `settle`:

```ts
import { defineMiddleware, settle } from '@alxia/core';

const poweredBy = defineMiddleware(async (ctx, next) => {
	const response = await settle(ctx, next());
	response.headers.set('x-powered-by', 'alxia'); // a 404 and a 500 carry it
	return response;                               // the error stays on ctx.error
});
```

`next.behind(added?)` runs the rest behind a reply the middleware returns at
once — a stale cache entry served while the route refreshes it.

## Requests

`validate(…)` reads each part it is given a schema for; what follows it
reads the schema's output. Before it, or without one:

| part | read from | before a `validate` |
| --- | --- | --- |
| `params` | the path, as strings | `{ id: string }`, from the path; `pathParams` is the same, after a `validate` too |
| `query` | the query string: a key given once is a string, more than once an array | `Record<string, string \| string[]>` |
| `headers` | the headers, names lowercased | `Record<string, string>` |
| `cookies` | the `Cookie` header; a middleware or a hook before the `validate` reads it unvalidated | `Record<string, string>` |
| `body` | by `content-type`: a parser the app added, JSON, a form, text, or the bytes | `undefined`: read `ctx.request` |

A request a `validate` refuses throws a `ValidationError`, an `HttpError`
of the 400: nobody catches it, and the answer is a 400 that names every
issue, whatever part it is in:

```json
{ "error": "validation", "issues": [{ "target": "params", "path": ["id"], "code": "invalid_type", "message": "…" }] }
```

A middleware given **before** the `validate` answers it in its own format.
`refusalOf(error)` reads the refusal — `{ kind: 'validation', part, issues }`,
or `{ kind: 'body_limit', limit }` for a body past its limit — and is
`undefined` for any other error. `problem(details)` builds an RFC 9457
problem, sent as `application/problem+json`, its extension members typed:

```ts
import { alxia, defineMiddleware, problem, refusalOf, validate } from '@alxia/core';
import { z } from 'zod';

const JmapRequest = z.object({ using: z.array(z.string()), methodCalls: z.array(z.unknown()) });

const jmapErrors = defineMiddleware(async (_ctx, next) => {
	try {
		return await next();
	} catch (error) {
		const refusal = refusalOf(error);
		if (refusal === undefined) throw error; // not a refusal: not ours
		return refusal.kind === 'body_limit'
			? problem({ type: 'urn:ietf:params:jmap:error:limit', status: 413, limit: 'maxSizeRequest' })
			: problem({
					type: refusal.issues.some((issue) => issue.code === 'invalid_json')
						? 'urn:ietf:params:jmap:error:notJSON'
						: 'urn:ietf:params:jmap:error:notRequest',
					status: 400,
					detail: `the ${refusal.part} is invalid`,
				});
	}
});

const app = alxia()
	.use(jmapErrors)
	.post('/jmap', validate({ body: JmapRequest }), ({ reply }) => reply(200, { methodResponses: [] }));
```

Its reply replaces the 400 and the 413 of every route after it. Branch on
`refusal.kind` to answer each its own way, and rethrow the kinds you leave:

```ts
const refusals = defineMiddleware(async ({ reply }, next) => {
	try {
		return await next();
	} catch (error) {
		const refusal = refusalOf(error);
		if (refusal?.kind === 'validation') return reply(422, { detail: `the ${refusal.part} is invalid` });
		if (refusal?.kind === 'body_limit') return reply(413, { limit: refusal.limit });
		throw error; // anything else: the default answer
	}
});

alxia()
	.use(refusals)
	.post('/notes', { bodyLimit: 64 * 1024 }, validate({ body: z.object({ text: z.string() }) }), ({ reply }) =>
		reply(201, 'ok'),
	);
// POST /notes answers 201, 413 { limit: number }, 422 { detail: string } or 500
```

`onRefusal(hook)` still answers a refusal for the routes declared after it,
as in 0.3, and is deprecated for this middleware.

`ip` is the client's address — the `ip` option reads it behind a proxy —
and `server` the Bun server, when there is one. `HEAD` runs the `GET` route.

`query` declares a `QUERY` route: a safe, idempotent read whose criteria are
too long or too structured for a query string, so they travel in the body —
validated like a `POST`'s, a 400 when refused.

```ts
app.query(
	'/users/search',
	validate({ body: z.object({ name: z.string().min(1) }) }),
	responds({ 200: z.array(User) }),
	async ({ body, reply }) => reply.ok(await searchUsers(body.name)),
);
```

`route(operation, ...middlewares, handler)` declares the same route from
data — `{ method, path, schema? }`, written once and shared, or generated
from an OpenAPI document — with the same types and the same compile
errors. A variable holding an operation needs `as const`, to keep its
method and path literal. The operation's `schema` is a `validate` of its
request and a `responds` of its responses, just before the handler, so a
middleware such as `auth` answers before the body is read, and its 401 is
its own, never checked by the operation's. A `validate(operation)` or a
`responds(operation)` among the middlewares stands where it is given
instead, once — a `responds(operation)` first checks every middleware's
reply after it too:

```ts
const getUser = {
	method: 'GET',
	path: '/users/:id',
	schema: { params: z.object({ id: z.coerce.number().int() }), response: { 200: User } },
} as const;

const renameUser = {
	method: 'PATCH',
	path: '/users/:id',
	schema: {
		params: z.object({ id: z.coerce.number().int() }),
		body: z.object({ name: z.string().min(1) }),
		response: { 200: User },
	},
} as const;

app
	.route(getUser, async ({ params, reply }) => reply.ok(await findUser(params.id)))
	// auth answers 401 before the body is read; the handler reads it validated
	.route(renameUser, auth, async ({ params, body, reply }) => reply.ok(await rename(params.id, body.name)));
// validate(renameUser), auth: a bad body is a 400 before auth runs, and is validated once
```

### Body size

`bodyLimit`, in bytes, caps a route's request body below the server's
`maxRequestBodySize`. Set it in a route's options, or call `bodyLimit(bytes)` for
every route declared after the call: on the app, for every later route; in a
group, for the group's routes alone. A route's own limit wins.

```ts
const app = alxia()
	.bodyLimit(64 * 1024)
	.post('/notes', validate({ body: z.object({ text: z.string() }) }), ({ body, reply }) => reply.created(body))
	.post('/upload', { bodyLimit: 25 * 1024 * 1024 }, async ({ request, reply }) => {
		await Bun.write('upload.bin', new Response(request.body));
		return reply.noContent();
	});
```

A `Content-Length` over the limit is refused without reading the body.
Without one, the bytes are counted as they arrive, and reading stops once
they pass the limit, so a chunked upload is never buffered whole. The
limit applies to JSON, forms, text, an app's own parsers, and a handler
reading `request.body` as a stream. Either way the answer is a 413, which
the route's operation in the OpenAPI document declares:

```json
{ "error": "content_too_large", "limit": 65536 }
```

It is a refusal, as a 400 is: a `ContentTooLargeError`, which `refusalOf` reads as
`{ kind: 'body_limit', limit }`, so the middleware above answers it in its own
format, JMAP's `limit` problem there, sent with 413 by that app's choice. A
route with no limit reads its body as before.

## Replies

A handler returns `reply(status, body, init?)`. Behind a `responds(…)`,
only a declared status, with a body its schema accepts. Without, any status
and any body. Shortcuts —
`reply.ok(body)`, `reply.created(body)`, `reply.noContent()`,
`reply.notFound(body)`, `reply.html(status, html)`, … — are the same
replies; behind a `responds`, a route has one only for a status it declares.

The body sent is the **output** of the schema: an unknown key it strips — a
password hash — never leaves the server. A reply its schema refuses is a
500, never an undeclared shape (`validateResponses: false` skips the check).

A string is `text/plain`, a `Blob` — a `Bun.file` — a stream or a buffer
goes as it is, an async iterable is a stream of server-sent events, anything
else is JSON. `redirect(location, status?)` needs no schema.
`set.headers` and `set.cookies` (a `Bun.CookieMap` of the response's cookies, empty at first) apply to every reply.

## Static files

Served through the app's pipeline: every middleware runs around them —
headers, compression, telemetry — like any route.

```ts
const app = alxia()
	.static('/assets', './public', {
		cacheControl: (path) =>
			/\.[0-9a-f]{8}\./.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
		precompressed: ['br', 'gzip'],    // app.js.br, app.js.gz beside app.js
	})
	.file('/favicon.ico', './static/favicon.ico')
	.static('/', './dist', { fallback: 'index.html' }); // a single-page app
```

`static(path, source, options?)` is a `GET` route at `path/*`. `file(path,
file, options?)` serves one file. Both answer:

- **304** to a client whose copy is current: a weak `ETag` and
  `Last-Modified`;
- **206** to a `Range` — a video seeking — and **416** to one past the end;
  `If-Range` honored;
- **404** `{ error: 'not_found' }` to no file, a dotfile, or a path that
  leaves the source — `..`, an encoded slash, a backslash;
- `HEAD`, as every `GET` route.

| option | default | |
| --- | --- | --- |
| `index` | `'index.html'` | the file a directory serves: one, a list tried in order, or `false` |
| `extensions` | none | tried for a path without one: `['html']` serves `/about` from `about.html` |
| `fallback` | none | served with a 200 for a path that matches no file: a single-page app |
| `precompressed` | none | `br`, `zstd`, `gzip`: a file stored compressed beside itself, to a client that accepts it |
| `cacheControl` | `public, max-age=0` | a value, `false`, or one per path |
| `headers` | none | headers, or `(path, file) => headers` |
| `types` | Bun's | content types by extension: `{ '.wasm': 'application/wasm' }` |
| `etag`, `lastModified`, `ranges` | on | |
| `dotfiles` | `false` | whether `.env` and the like are served |

**Any source.** A directory, or a function from a path to a `Blob` — so
files come from anywhere Bun reads them:

```ts
const files = new Map([['logo.svg', new File([svg], 'logo.svg', { type: 'image/svg+xml' })]]);
app.static('/memory', (path) => files.get(path));                 // files held in memory

app.static('/media', async (path) => {                             // an S3 bucket
	const file = Bun.s3.file(`media/${path}`);
	return (await file.exists()) ? file : null;                       // null is a 404
});
app.file('/sitemap.xml', async () => new Blob([await sitemap()], { type: 'application/xml' }));
```

### Bun's HTML bundles

```ts
import dashboard from './dashboard/index.html';

app.page('/dashboard', dashboard).listen(3000);
```

`page(path, bundle)` hands Bun's full-stack bundling its route: the page's
scripts and styles bundled by Bun, hot-reloaded under `development`. It is
served by `Bun.serve` itself — so through `listen` only, and outside the
app's middlewares.

## Server-sent events

```ts
import { eventStream, responds } from '@alxia/core';

app.get('/ticks', responds({ 200: eventStream(Tick) }), ({ reply }) =>
	reply(200, (async function* () {
		for (let n = 0; ; n++) { yield { n }; await Bun.sleep(1000); }
	})()),
);
```

Each value is checked by the event's schema and sent as one `data:` line of
JSON; a comment keeps an idle stream open, and the generator is closed when
the client leaves.

Name the events, each with its schema, and each is sent with its `event:`
line, plus `id:` and `retry:` when given:

```ts
const Push = eventStream({ state: StateChange, ping: Ping });

app.get('/push', responds({ 200: Push }), ({ reply }) =>
	reply(200, (async function* () {
		yield Push.event('ping', { interval: 30 });
		yield Push.event('state', change, { id: 's42' });
	})()),
);
// event: ping
// data: {"interval":30}
```

`Push.event(name, data, fields?)` types each by its name's schema. A
line break in an `id`, or a `retry` that is not a whole number, ends the
stream before it is written.

## WebSockets

```ts
app.ws('/rooms/:room', { message: Chat, send: Chat }, auth, validate({ query: z.object({ v: z.literal('1') }) }), {
	open: (socket) => socket.subscribe(socket.data.params.room),
	message: (socket, chat) => socket.publish(socket.data.params.room, chat), // socket.data.user: auth's
});
```

`ws(path, options?, ...middlewares, handlers)`: the upgrade request runs the
middlewares declared before the route, then its own — a 401 or a 400 never becomes
a socket. The options are `message`, `send` and `detail`. Each message is
parsed as JSON and checked by `message` (a refused one is answered with its
issues, the socket kept open); each one sent is checked by `send`.
`socket.data` holds what the middlewares added and `validate` gave back. A
middleware that awaits `next()` gets an empty `200` stand-in once the socket
is open; what it returns after is ignored (a header set on the stand-in is
lost: set `set.headers` before). `responds` has no
reply to check on a socket, and is refused there. Sockets need a
server: `listen`, or `Bun.serve({ fetch: app.fetch, websocket: app.websocket })`.

## Context and hooks

A middleware belongs to the routes it is given to; `use` gives it to the
app. `derive` and `decorate` are the shape of a middleware that only adds to
the context of every route after them, and neither is deprecated:

```ts
const app = alxia()
	.decorate({ db })                                  // ctx.db, everywhere after
	.get('/health', ({ reply }) => reply(200, 'ok'))   // not guarded
	.derive(async ({ request, reply }) => {
		const user = await authenticate(request);
		return user ? { user } : reply(401, { error: 'unauthenticated' as const });
	})
	.get('/me', ({ user, reply }) => reply(200, user)); // ctx.user is typed
```

A reply a `derive` returns ends the request: `/me` answers the 401 to a
stranger. Like a `use`, a `derive` and a `decorate` run on a request no
route matches, so `GET /missing` answers 401 to a stranger too.

The middlewares before a `validate`, and `derive`, read the request as it
arrived: `pathParams` holds the path's parameters as strings, and `cookies`
the request's cookies, parsed on first read. A `validate({ cookies })` gives
what follows it the validated ones. `set.cookies` is the response's — its
`get` reads what the response set, so it is `null` in a middleware for a
cookie the request sent:

```ts
.derive(({ cookies }) => ({ user: sessions.get(cookies['sid'] ?? '') ?? null }))
```

Which one to reach for — a middleware, `derive`, a group, a plugin — where
each applies and the order a request runs them in:
[Middleware: which way to use](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/middleware.md).

### The request hooks are middlewares now

`onRequest`, `onResponse`, `around`, `wrap`, `onError` and `onRefusal` run
as in 0.3 and are deprecated. Each has a middleware:

| deprecated | instead |
| --- | --- |
| `onRequest(ctx)` | `use(defineMiddleware((ctx, next) => early(ctx) ?? next()))`, first: a `Response` it returns is sent as it is (a CORS preflight) |
| `onResponse(response, ctx)` | `use(defineMiddleware(async (ctx, next) => edit(await settle(ctx, next()))))`, first: every response, errors included |
| `around(ctx, next)` | `use(defineMiddleware((ctx, next) => … next() …))`, first: a span, a transaction held for the whole request |
| `onError(error, ctx)` | `use(defineMiddleware(async (ctx, next) => { try { return await next(); } catch (error) { … } }))`: rethrow what is not yours |
| `onRefusal(refusal, ctx)` | the same, reading `refusalOf(error)` ([Requests](#requests)) |
| `wrap(ctx, next)` | `use(defineMiddleware(async (ctx, next) => … await next() …))`: unlike a `wrap`, it runs on a 404 too, and a refusal rejects `next()` with the `ValidationError` |

An error nobody catches is answered, as in 0.3, by the `onError` hooks, then
an `HttpError` as it says, and anything else is a 500 that leaks nothing,
but for a client that hung up mid-request, a 499 nobody reads.
[Upgrading](https://github.com/softistx/alxia/blob/develop/packages/core/docs/upgrading.md#middlewares-replace-the-request-hooks)
has each one, before and after.

`onStart(server)`, `onStop()` and `parser(type, parse)` stay: they run with
`listen` and `stop`, and a body parser is tried before the built-in ones.

## Groups

```ts
app.group('/admin', (admin) =>
	admin.use(requireAdmin).get('/stats', ...),   // the guard, and what it adds, apply here only
);
```

A group's routes are under its prefix and keep the hooks and middlewares
declared before it; the ones it adds stay inside, and do not run on a request
no route matches, even one under its prefix. `group(build)`, without a
prefix, is a scope alone.

## Plugins

A plugin is an app, or a function given the app that returns it, mounted
by `app.plugin(…)`; a middleware is given to `use`. What the other
packages call plugins — `logger()`, `cors()`, `bearer(…)` — are
middlewares: `app.use(logger())`.

```ts
// an app: its routes, its context, its replies — all typed
const auth = alxia().derive(async ({ request }) => ({ user: await authenticate(request) }));
const users = alxia({ prefix: '/users' }).get('/:id', ...);

const app = alxia({ prefix: '/api' }).plugin(auth).plugin(users); // GET /api/users/:id

// a function: lifecycle hooks and parsers, the app's type unchanged
const closing = (pool: { end(): Promise<void> }): Plugin => (app) =>
	app.onStop(() => pool.end());

alxia().plugin(auth).plugin(closing(pool));
// a middleware needs no plugin: export it, and give it to `use`
```

`plugin(app)` mounts its routes under this app's prefix and behind this
app's middlewares; its `derive`s and middlewares then apply to the routes
declared after it, and become this app's, so they run on a request no route
matches too. `plugin(fn)` calls `fn` with the app and returns what it
returns, which must be an app: anything else throws `plugin(): the plugin
function returned …, not an app`.

`app.plugin(middleware)` and `app.use(plugin)`, the forms of 0.3, still run
and are deprecated: a middleware goes to `use`, an app or a function to
`plugin`.

A plugin that reads what an earlier one added names it with `definePlugin`,
and an app that does not give it cannot mount it:

```ts
import { alxia, definePlugin } from '@alxia/core';

const tenants = new Map<string, { name: string }>();
const auth = alxia().derive(({ request, reply }) => {
	const tenantId = request.headers.get('x-tenant');
	return tenantId ? { user: { tenantId } } : reply(401, { error: 'unauthenticated' as const });
});

const tenant = definePlugin<{ user: { tenantId: string } }>()((app) =>
	app.derive(({ user }) => ({ tenant: tenants.get(user.tenantId) ?? null })),
);

alxia().plugin(auth).plugin(tenant); // ok: auth adds a user, or answers 401
alxia().plugin(tenant);              // compile error: the plugin reads "user", which this app's context does not give
```

### Route files: `Register` and `defineRoutes`

Register the chain that builds the context once, and a file of routes
reads it with no import of the app:

```ts
// src/context.ts — the base: what every route reads
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

// src/routes/todos.ts — imports @alxia/core, not the app
import { defineRoutes } from '@alxia/core';

export const todos = defineRoutes('/todos')
	.get('/', ({ db, user, reply }) => reply(200, db.todos.of(user.id)));

// src/app.ts
import { alxia } from '@alxia/core';
import { base } from './context';
import { todos } from './routes/todos';

export const app = base.plugin(todos);
alxia().plugin(todos); // compile error: the plugin reads "db" | "user", which this app's context does not give
```

`defineRoutes(prefix?)` is `alxia({ prefix })` typed with the registered
context, which it requires of the app that mounts it. `AppContext` is that
context, for a service or a resolver. Register `base`, never the app that
mounts the routes: their type reads `Register`, so the app would be typed
by itself (TS7022). Nothing registered, `AppContext` is `BaseContext`. A
`defineMiddleware` still reads `BaseContext` alone; one that needs the
registered context says so, `defineMiddleware<AppContext>()(fn)`, and is
checked where it is given.

A tool that reads `app.routes` — a route check, a document — finds a path
as the core declares and matches it with `joinPath` and `shapeOf`:

```ts
import { joinPath, shapeOf } from '@alxia/core';

joinPath('/api', '/pets/:petId');                    // '/api/pets/:petId'
joinPath('/api', '/');                               // '/api'
shapeOf('/pets/:id') === shapeOf('/pets/:petId');    // true: the router sends them the same requests
```

[Writing a plugin](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/writing-a-plugin.md)
covers all three kinds.

## API

| export | |
| --- | --- |
| `alxia(options?)`, `AlxiaOptions` | a new app: `prefix`, `validateResponses`, `ip` |
| `Alxia` | `get` `post` `put` `patch` `delete` `options` `head` `query` `route` `ws`, `static` `file` `page`, `use` `derive` `decorate` `bodyLimit` `onStart` `onStop` `parser`, `group` `plugin`, `fetch` `websocket` `request` `listen` `stop`, `routes` `sockets` `server`; deprecated for `use`: `wrap` `onError` `onRefusal` `around` `onRequest` `onResponse` |
| `eventStream(schema)`, `EventStreamSchema` | the response schema of a stream of events |
| `isEventStreamSchema(schema)` | whether a schema is one `eventStream(schema)` made |
| `eventStream({ name: schema })`, `NamedEventStreamSchema`, `EventSchemas` | the response schema of a stream of named events, its `event(name, data, fields?)` builder, its schemas by name under `~events` |
| `EventInput<Of>`, `EventOutput<Of>`, `EventFields` | what a handler yields on a named stream, what is sent of it, and an event's `id` and `retry` |
| `isNamedEventStreamSchema(schema)` | whether a schema is one `eventStream({ … })` made |
| `FileSource`, `StaticOptions`, `FileOptions`, `StaticReply`, `parseRange` | static files |
| `Precompressed`, `FileNotFoundBody`, `RangeNotSatisfiableBody` | a coding stored beside a file, the bodies of the 404 and 416 |
| `Reply`, `HttpError`, `ResponseValidationError` | what a handler returns or throws |
| `ValidationError`, `refusalOf(error)` | what `validate` throws — an `HttpError` of the 400, its `refusal` `{ kind: 'validation', part, issues }` and its default `body` — and what reads the `Refusal` of it or of a `ContentTooLargeError`, else `undefined`: how a middleware before a `validate` answers a refusal |
| `settle(ctx, next())` | for a middleware that must see the final response: resolves to what `next()` resolved to or, when it rejected, to the answer the route would give — `onError` and `onRefusal` hooks, an `HttpError`, a 500 — with the error on `ctx.error` |
| `ContentTooLargeError`, `ContentTooLargeBody` | what reading a body past its route's `bodyLimit` throws — a `body_limit` refusal — and the body of its default 413: `{ error: 'content_too_large', limit }` |
| `ReplyInit` | a reply's options: `headers` |
| `AnyReply`, `FreeReplyFunction`, `TypedReplyFunction`, `DeclaredReply`, `RedirectFunction` | any reply, `reply` without and behind a `responds`, every reply a route with schemas may return, `redirect` |
| `FreeShortcuts`, `TypedShortcuts`, `SHORTCUTS`, `Shortcuts` | `reply`'s shortcuts without and with schemas, and the status of each |
| `Plugin`, `AnyAlxia` | a function plugin, any app |
| `defineMiddleware(fn)`, `defineMiddleware<Requires>()(fn)`, `MiddlewareMark` | a middleware, `(ctx, next) => …`, typed, marked as one for `use`, and returned: `next(added)` adds `added` to the context after it, `next.behind(added?)` runs the rest behind a reply it returns at once, a reply ends the request, a `Response` is sent as it is, nothing once `next()` was called is the rest's response; `Requires` is what it reads beyond `BaseContext`, which the route must give where it is placed |
| `validate(schemas)`, `validate(operation)`, `RequestSchemas`, `Validated<Schemas>`, `ValidateRequires<Schemas>` | the middleware that validates `params`, `query`, `headers`, `cookies` and `body`, each with any Standard Schema — or the request parts of an operation's `schema`, which its `route` then validates nowhere else; what it takes, what it passes on, the path parameters its `params` schema must read |
| `responds(responses)`, `responds(operation)` | the middleware that types the handler's `reply` by the statuses it declares, and checks the replies after it of those statuses against their schemas; given an operation, its `schema.response`, which its `route` then checks nowhere else — it throws for an operation that declares none |
| `BuiltinMark<Kind>` | the mark `validate` and `responds` carry in their type, `'~builtin': 'validate' \| 'responds'`; at runtime `Symbol.for('alxia.builtin')`, so one made by another copy of `@alxia/core` is still recognised, and `use` refuses it |
| `Middleware<Requires, Result>`, `MiddlewareContext<Requires>`, `MiddlewareResult`, `MiddlewareReturn`, `Next<Added, Schema>`, `NextFunction` | a middleware, what it reads (`BaseContext & Requires`), what it may return, and `next`: called once at most, it resolves to the rest of the route's `Response`, branded by what was added. A middleware typed `Middleware` alone adds nothing: its result's brand is `Next`, never `any` |
| `RouteOptions`, `SocketOptions` | a route's options, `bodyLimit` and `detail`; a socket's, `message`, `send` and `detail` |
| `RouteMethod`'s `MiddlewareForms`, `OptionsForms` and `DeprecatedForms`; `SocketMethod`'s `SocketForms`, `SocketOptionsForms` and `DeprecatedSocketForms`; `RouteApp`, `AppWithRoute` | the forms of a route method and of `ws`: with and without options, and those of 0.3; the app's types and the method, as those forms read them; the app a call returns, unchanged in type. Exported so an app's type can be named in a declaration file |
| `PluginMethod` | the type of `plugin`: an app, or a function given the app that returns it, checked against what the plugin requires; a middleware given to it is `use(middleware)`, deprecated. Exported so an app's type can be named in a declaration file |
| `UseForms`, `PluginForms`, `ScopeMiddleware`, `PathMiddleware`, `AddingNothing`, `ScopePathAt`, `AppAfterUse` | the forms of `use` — middlewares, with a path or without, and the plugin forms of 0.3, deprecated for `plugin` (`PluginForms`) — what each middleware form takes, the check that a middleware given a path adds nothing (`Invalid middleware: …`), the check of that path (a route's, with no trailing `/`), and the app after them. Exported so an app's type can be named in a declaration file |
| `defineHook(hook)`, `defineHook<Requires>()(hook)`, `defineWrap(hook)`, `defineWrap<Requires>()(hook)` | deprecated: a hook for a route's list, `app.get(path, [hook], schema?, handler)`, and one around the rest of it. Still run as in 0.3; write a `defineMiddleware` instead |
| `RouteHook<Requires, Result>`, `RouteWrap<Requires, Result>`, `AnyRouteHook`, `HookContext<Requires>`, `RawRequestParts` | what `defineHook` and `defineWrap` make, and what such a hook reads: `BaseContext`, the `params` and `query` as they arrived, and `Requires` |
| `ThreadHooks<Base, Hooks>`, `RouteHookBase<Ctx, Path>`, `HookProvided<Given, Requires>`, `AddedBy<Hook>`, `RepliesBy<Hook>`, `MaxRouteHooks`, `NoHookYet` | how a route's type threads a deprecated list of hooks, bounded at 8. Exported so an app's type can be named in a declaration file |
| `Register`, `AppContext` | the interface an app augments with `context: typeof base`, and that base's context: `BaseContext` when nothing is registered |
| `defineRoutes(prefix?)` | an app plugin built on the registered context, requiring it of the app that mounts it with `plugin`: a file of routes with no import of the app |
| `RegisteredOf<R>`, `RegisteredBase`, `InvalidRegister`, `RoutesContext` | the app a `Register`-shaped interface names (a fresh app when it names none), the one `Register` names, what a `context` that is not an app reads as (every key of the app's own a compile error), and the context `defineRoutes` starts from, its requirement in it |
| `RequiringContext<Requires>`, `RequiredIn<PluginCtx>`, `Mounted<PluginCtx>` | the requirement a `defineRoutes` plugin carries in its context (a function type, never set, so a route reading it gets nothing usable), what it requires of the app that mounts it — checked by `plugin(app)`, `plugin((app) => plugin)` and a `group` returning it (`plugin-method.ts`) — and what it adds to it. Exported so an app's type can be named in a declaration file |
| `definePlugin<Requires>()(build)` | an app plugin built on an app whose context has `Requires`; `plugin` refuses it on an app that does not give them |
| `Requiring<Requires>`, `ProvidedBy<Ctx, Requires>` | the marker on a `definePlugin` plugin, and the check `plugin` makes of it |
| `RequiresOf<Ctx, Callback?>` | what a callback annotated `Ctx` reads beyond `BaseContext` — `{ user: User }` for `BaseContext & { user: User }`, `Empty` for nothing more: the `Requires` of a plugin that infers it from a callback it is given. A callback annotated `any` is refused on every app, with a message naming `Callback` |
| `ListenOptions` | the options of `listen`: `port`, `hostname`, `development`, `idleTimeout`, `maxRequestBodySize`, `tls` |
| `RequestHook`, `ResponseHook`, `AroundHook`, `StartHook`, `StopHook`, `BodyParser` | the hooks of `onRequest`, `onResponse`, `around` (the three deprecated for a middleware), `onStart`, `onStop`, and a body parser |
| `joinPath(prefix, path)` | a path under a prefix, as the app joins them: `joinPath('/api', '/')` is `'/api'`; typed `JoinPath` |
| `shapeOf(path)` | the path with its parameter names erased, as the router compares them: `shapeOf('/pets/:id') === shapeOf('/pets/:petId')`; throws a `TypeError` for a path no route may be declared at |
| `withHeaders`, `vary`, `check` | for plugins: edit a response's headers (copied when immutable; an error of the edit leaves the body unread), add to `Vary`, run a schema |
| `Checked` | what `check` returns: the value, or its issues |
| `Jsonify<T>` | what a value is on the wire |
| `ContextOf<App>` | what a route declared next on `App` reads: to type a GraphQL schema, a service |
| `RequestContext`, `BaseContext`, `Context`, `ResponseSettings`, `HandlerResult` | what every middleware reads (`BaseContext.cookies`: the request's; `BaseContext.route`: the route's path as declared, `undefined` on a request no route matches), what a handler reads, what a route sets on its response, what a handler may return |
| `ResponseCookies` | `set.cookies`: Bun's `CookieMap` of the cookies the response sets, whose `get` and `has` read those, never the request's |
| `RouteSchema`, `ResponseSchemas`, `RouteDetail`, `ValidSchema`, `RouteMethod` (its forms: `path, options?, ...middlewares, handler`, and the deprecated schema and list of hooks), `RefusalMethod`, `RouteDefinition`, `SocketDefinition` | a route: what it validates, its `detail` (`summary`, `operationId`, …), the checks its schema's type cannot express, a route method, the type of `onRefusal` (its four forms), a route and a socket as the app runs them |
| `RouteOperation`, `OperationSchema`, `OperationMethod`, `CheckedOperation` | a route as data for `route`: `{ method, path, schema? }`, its schema (or `Empty`), the type of `route` — `OperationForms`, and its list of hooks of 0.3, deprecated — and the check it makes of the operation |
| `OperationForms`, `OperationApp`, `OperationParts`, `OperationOptions`, `OperationResponds`, `OperationValidate` | `route(operation, ...middlewares, handler)`, up to 8 middlewares; the app it reads; the operation's request parts, its options (`bodyLimit`, `detail`), and the implicit `validate` and `responds` it threads, just before the handler. Exported so an app's type can be named in a declaration file |
| `StaticMethod`, `FileMethod`, `PageMethod`, `DecorateMethod`, `DeriveMethod`, `WrapMethod`, `BodyLimitMethod`, `ErrorMethod`, `RequestHookMethod`, `ResponseHookMethod`, `AroundMethod`, `StartHookMethod`, `StopHookMethod`, `ParserMethod`, `GroupMethod`, `UseMethod`, `PluginMethod`, `RequestMethod`, `ListenMethod` | the types of the app's other methods, each holding its overloads and their documentation: `static`, `file`, `page`; `decorate`, `derive`, `bodyLimit`, and the deprecated `wrap`, `onError`; the hooks `onRequest`, `onResponse`, `around` (deprecated), `onStart`, `onStop`, `parser`; `group`, `use` and `plugin`; `request` and `listen`. Exported so an app's type can be named in a declaration file |
| `SocketMethod`, `SocketSchema`, `SocketContext`, `Socket`, `SocketHandlers`, `SocketSend`, `SocketMessage` | sockets: the type of `ws` (`path, options?, ...middlewares, handlers`, and the deprecated forms), what a deprecated socket schema validates, what its handlers read, send and receive |
| `StandardSchemaV1`, `StandardResult`, `StandardIssue`, `InferInput`, `InferOutput` | the Standard Schema types |
| `ValidationErrorBody`, `InternalErrorBody`, `RoutingErrorBody` | the bodies of the 400, 500, 404, 405 and 426 |
| `ValidationIssue`, `ValidationTarget` | one issue of a 400, and where the refused value was read from |
| `Refusal`, `ValidationRefusal`, `BodyLimitRefusal`, `RequestPart` | what `refusalOf` and an `onRefusal` hook (deprecated) read: the refusal by `kind` — `validation`, with the `part` that failed first and its `issues`, or `body_limit`, with the route's `limit` |
| `RefusalKind`, `RefusalOfKind<Kind>` | the kinds `onRefusal(kind, hook)` takes, `'validation' \| 'body_limit'`, and the refusal a hook of one kind reads |
| `RefusalSchema`, `RefusalResponses` | what an `onRefusal` hook may declare: the schema of each 4xx it answers, and its `contentType` |
| `RefusalHook`, `RefusalHandler`, `RefusalHandlersByKind` | an `onRefusal` hook, the general one in force for a route — `RouteDefinition['refusal']` — and those of each kind, tried before it — `RouteDefinition['refusalByKind']` |
| `RefusingKind`, `KindFallsBack`, `KindRefusalsOf`, `OneKind` | how an app's type carries an `onRefusal(kind, hook)`: the mark of its replies, of the general hook or default it falls back to, the replies it may answer, and the check that its kind is one literal, not a union. Exported so an app's type can be named in a declaration file |
| `Refusing`, `FallsBack`, `RefusalsOf`, `DeclaredRefusal`, `ThenShortcuts`, `BodyLimited`, `BodyLimitShortcut` | how an app's type carries its `onRefusal` hook and its `bodyLimit()`: the mark of the hook's replies, of the default it falls back to, how a later scope's hooks replace them, the mark of a `bodyLimit()` in force and the shortcut it adds, the replies a hook may answer (`RefusalsOf`) and, for a hook declaring schemas, those replies as its schemas give them back (`DeclaredRefusal`). Exported so an app's type can be named in a declaration file |
| `problem(details, init?)`, `ProblemDetails` | a reply whose body is an RFC 9457 problem — `type`, `title`, `status`, `detail`, `instance` and typed extension members — sent with its `status` as `application/problem+json` |
| `RoutePath`, `JoinPath`, `PathParams`, `PathParamName` | paths: an absolute path, a prefix joined to a path, the parameters a path declares |
| `PathAt<Prefix, Path, Route?>`, `CheckedPath<Path>`, `StaticPath<Path>` | the check a route method makes on a literal path: `Path`, or `Invalid path: …` with the `TypeError` the app would throw; the same for a path alone; the route `static(path)` declares. A wrapper forwarding a path generic in `P` types its parameter `PathAt<'', P>` |
| `StatusCode`, `InformationalStatus`, `SuccessStatus`, `RedirectStatus`, `ClientErrorStatus`, `ServerErrorStatus` | every status a route may declare, and each class of them |
| `Method`, `Empty`, `MaybePromise`, `Simplify` | an HTTP method, no properties, a value or its promise, an object type with its intersections flattened |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/core/docs): a page per area — routes and validation, replies, middleware and hooks, groups and plugins, writing a plugin, static files, server-sent events, WebSockets, serving, and the app's type.
- [Middleware: which way to use](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/middleware.md): a route's middlewares, `use`, `derive`, groups and plugins side by side, the hooks they replace, and the order a request runs them in.
- [Upgrading](https://github.com/softistx/alxia/blob/develop/packages/core/docs/upgrading.md): what the next release changes, and what can break.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/core/docs/troubleshooting.md): an error message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/core/docs/roadmap.md): what is coming, and what is not planned.
