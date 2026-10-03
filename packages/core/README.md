# @alxia/core

An HTTP framework for [Bun](https://bun.sh), type-safe from the request to
the client that calls it, with **no dependency**. Each route declares what it
reads and what it answers with any [Standard Schema](https://standardschema.dev)
— Zod, Valibot, ArkType, or one written by hand — and the types follow: the
handler reads validated values, can only answer what it declared, and the
app's type is the contract [`@alxia/client`](https://www.npmjs.com/package/@alxia/client)
calls.

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
import { alxia } from '@alxia/core';
import { zq } from '@alxia/zod';
import { z } from 'zod';

const User = z.object({ id: z.number(), name: z.string() });

const app = alxia()
	.get(
		'/users/:id',
		{
			params: z.object({ id: zq.int() }),
			response: { 200: User, 404: z.object({ error: z.literal('not_found') }) },
		},
		async ({ params, reply }) => {
			const user = await findUser(params.id); // params.id: number
			return user ? reply(200, user) : reply(404, { error: 'not_found' });
		},
	)
	.post(
		'/users',
		{ body: z.object({ name: z.string().min(1) }), response: { 201: User } },
		async ({ body, reply }) => reply(201, await createUser(body.name)),
	);

app.listen(3000);

export type App = typeof app;
```

`listen` hands the routes to `Bun.serve`'s own router. `app.fetch` is the
same app as a fetch handler; `app.request('/users/1')` calls it in process.

## What the types refuse

Each of these is a compile error, not a runtime surprise:

```ts
app.get('/users/:id', { params: z.object({ name: z.string() }) }, ...); // not the path's parameters
app.get('/users', { quey: z.object({}) }, ...);                          // a typo
({ reply }) => reply(201, user);                                         // a status not declared
({ reply }) => reply(200, { id: '1' });                                  // a body its schema refuses
```

## Requests

| part | read from | without a schema |
| --- | --- | --- |
| `params` | the path, as strings | `{ id: string }`, from the path |
| `query` | the query string: a key given once is a string, more than once an array | `Record<string, string \| string[]>` |
| `headers` | the headers, names lowercased | `Record<string, string>` |
| `cookies` | the `Cookie` header | `Record<string, string>` |
| `body` | by `content-type`: a parser the app added, JSON, a form, text, or the bytes | `undefined`: read `ctx.request` |

A request any schema refuses is answered with a 400 that names every issue,
whatever part it is in:

```json
{ "error": "validation", "issues": [{ "target": "params", "path": ["id"], "code": "invalid_type", "message": "…" }] }
```

`onRefusal(hook)` answers it in your format instead, for the routes declared
after it: the hook reads the refusal's `kind` — for a `validation`, the
`part` that failed and the `issues` — and returns a reply with a 4xx
status, or nothing, for the default.
`problem(details)` builds an RFC 9457 problem, sent as
`application/problem+json`, its extension members typed:

```ts
import { alxia, problem } from '@alxia/core';
import { z } from 'zod';

const JmapRequest = z.object({ using: z.array(z.string()), methodCalls: z.array(z.unknown()) });

const app = alxia()
	.onRefusal((refusal) =>
		refusal.kind === 'body_limit'
			? problem({ type: 'urn:ietf:params:jmap:error:limit', status: 413, limit: 'maxSizeRequest' })
			: problem({
					type: refusal.issues.some((issue) => issue.code === 'invalid_json')
						? 'urn:ietf:params:jmap:error:notJSON'
						: 'urn:ietf:params:jmap:error:notRequest',
					status: 400,
					detail: `the ${refusal.part} is invalid`,
				}),
	)
	.post('/jmap', { body: JmapRequest }, ({ reply }) => reply(200, { methodResponses: [] }));
```

Its reply replaces the 400 in the type of every route after it that
validates, so the client reads the problem. Given schemas first —
`onRefusal({ response: { 400: Problem }, contentType: 'application/problem+json' }, hook)`
— its `reply` is typed by them, its body checked and sent as their output,
and `@alxia/openapi` documents it.

`ip` is the client's address — the `ip` option reads it behind a proxy —
and `server` the Bun server, when there is one. `HEAD` runs the `GET` route.

`query` declares a `QUERY` route: a safe, idempotent read whose criteria are
too long or too structured for a query string, so they travel in the body —
validated like a `POST`'s, a 400 when refused.

```ts
app.query(
	'/users/search',
	{ body: z.object({ name: z.string().min(1) }), response: { 200: z.array(User) } },
	async ({ body, reply }) => reply.ok(await searchUsers(body.name)),
);
```

`route(operation, handler)` declares the same route from data —
`{ method, path, schema? }`, written once and shared, or generated from an
OpenAPI document — with the same types and the same compile errors. A
variable holding an operation needs `as const`, to keep its method and path
literal:

```ts
const getUser = {
	method: 'GET',
	path: '/users/:id',
	schema: { params: z.object({ id: z.coerce.number().int() }), response: { 200: User } },
} as const;

app.route(getUser, async ({ params, reply }) => reply.ok(await findUser(params.id)));
```

### Body size

`bodyLimit`, in bytes, caps a route's request body below the server's
`maxRequestBodySize`. Set it on a route, or call `bodyLimit(bytes)` for
every route declared after the call: on the app, for every later route; in a
group, for the group's routes alone. A route's own limit wins.

```ts
const app = alxia()
	.bodyLimit(64 * 1024)
	.post('/notes', { body: z.object({ text: z.string() }) }, ({ body, reply }) => reply.created(body))
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
the route's type and its OpenAPI document include:

```json
{ "error": "content_too_large", "limit": 65536 }
```

It is a refusal, as a 400 is: the `onRefusal` hook above reads it as `{ kind: 'body_limit', limit }` and may answer it in its
own format, JMAP's `limit` problem there, sent with 413 by that app's
choice. A route with no limit reads its
body as before.

## Replies

A handler returns `reply(status, body, init?)`. With `response` schemas,
only a declared status, with a body its schema accepts. Without, any status
and any body — the client still reads the type of the body. Shortcuts —
`reply.ok(body)`, `reply.created(body)`, `reply.noContent()`,
`reply.notFound(body)`, `reply.html(status, html)`, … — are the same
replies; with schemas, a route has one only for a status it declares.

The body sent is the **output** of the schema: an unknown key it strips — a
password hash — never leaves the server. A reply its schema refuses is a
500, never an undeclared shape (`validateResponses: false` skips the check).

A string is `text/plain`, a `Blob` — a `Bun.file` — a stream or a buffer
goes as it is, an async iterable is a stream of server-sent events, anything
else is JSON. `redirect(location, status?)` needs no schema.
`set.headers` and `set.cookies` (a `Bun.CookieMap`) apply to every reply.

## Static files

Served through the app's pipeline: every hook runs around them — headers,
compression, telemetry — and the client types them like any route.

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
app's hooks.

## Server-sent events

```ts
import { eventStream } from '@alxia/core';

app.get('/ticks', { response: { 200: eventStream(Tick) } }, ({ reply }) =>
	reply(200, (async function* () {
		for (let n = 0; ; n++) { yield { n }; await Bun.sleep(1000); }
	})()),
);
```

Each value is checked by the event's schema and sent as one `data:` line of
JSON; a comment keeps an idle stream open, and the generator is closed when
the client leaves. The client reads `data` as an `AsyncIterable` of events.

Name the events, each with its schema, and each is sent with its `event:`
line, plus `id:` and `retry:` when given:

```ts
const Push = eventStream({ state: StateChange, ping: Ping });

app.get('/push', { response: { 200: Push } }, ({ reply }) =>
	reply(200, (async function* () {
		yield Push.event('ping', { interval: 30 });
		yield Push.event('state', change, { id: 's42' });
	})()),
);
// event: ping
// data: {"interval":30}
```

`Push.event(name, data, fields?)` types each by its name's schema. The
client reads `{ event, data, id? }`, a union discriminated by `event`. A
line break in an `id`, or a `retry` that is not a whole number, ends the
stream before it is written.

## WebSockets

```ts
app.ws('/rooms/:room', { message: Chat, send: Chat }, {
	open: (socket) => socket.subscribe(socket.data.params.room),
	message: (socket, chat) => socket.publish(socket.data.params.room, chat),
});
```

The upgrade request runs the hooks before the route and is validated as a
route's — a 401 or a 400 never becomes a socket. Each message is parsed as
JSON and checked by `message` (a refused one is answered with its issues,
the socket kept open); each one sent is checked by `send`. `socket.data`
holds the validated request and what each hook added. Sockets need a
server: `listen`, or `Bun.serve({ fetch: app.fetch, websocket: app.websocket })`.

## Hooks

Route hooks apply to the routes declared **after** them: the chain reads in
the order the request runs.

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

A reply a hook returns ends the request, and is added to the type of every
route after it: the client of `/me` reads the 401.

`wrap(hook)` is a route hook around the rest: `next()` runs the hooks
declared after it, validation and the handler, and resolves to the
response, which the hook returns — or a reply of its own, typed like a
`derive`'s. An idempotency key, a transaction, a cookie set after the route:

```ts
.wrap(async ({ request, reply }, next) =>
	busy(request) ? reply(409, { error: 'busy' as const }) : next())
```

Hooks run before validation: `pathParams` holds the path's parameters as
they arrived. `onError` turns a thrown
error into a reply the same way; an `HttpError` is answered as it says, and
anything else is a 500 that leaks nothing, but for a client that hung up
mid-request, a 499 nobody reads. `onRefusal` answers a request
the route's schemas refuse, or whose body passes its `bodyLimit`
([Requests](#requests)); the last one declared
before a route is the one it uses.

Global hooks apply to the whole app, wherever they are declared:

| hook | |
| --- | --- |
| `around(ctx, next)` | around everything else, the first declared outermost: `next()` resolves to the response, and what the hook awaits around it — a span, a transaction — holds for the whole request. `ctx.route` and `ctx.error` say what it reached and how it failed |
| `onRequest(ctx)` | before routing, every request; a `Response` it returns is sent as it is (a CORS preflight) |
| `onResponse(response, ctx)` | every response, 404s included; one it returns replaces it (headers, compression) |
| `onStart(server)`, `onStop()` | with `listen` and `stop` |
| `parser(type, parse)` | a body parser, tried before the built-in ones |

## Groups

```ts
app.group('/admin', (admin) =>
	admin.derive(requireAdmin).get('/stats', ...),   // the guard applies here only
);
```

A group's routes are under its prefix and keep the hooks declared before
it; the hooks it adds stay inside. `group(build)`, without a prefix, is a
scope alone.

## Plugins

A plugin is an app, or a function.

```ts
// an app: its routes, its context, its replies — all typed
const auth = alxia().derive(async ({ request }) => ({ user: await authenticate(request) }));
const users = alxia({ prefix: '/users' }).get('/:id', ...);

const app = alxia({ prefix: '/api' }).use(auth).use(users); // GET /api/users/:id

// a function: global hooks, the app's type unchanged
const poweredBy = (name: string): Plugin => (app) =>
	app.onResponse((response) => { response.headers.set('x-powered-by', name); });
```

`use(app)` mounts its routes under this app's prefix and behind this app's
hooks; its route hooks then apply to the routes declared after it, and its
global hooks become this app's.

A plugin that reads what an earlier one added names it with `definePlugin`,
and an app that does not give it cannot use it:

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

alxia().use(auth).use(tenant); // ok: auth adds a user, or answers 401
alxia().use(tenant);           // compile error: the plugin reads "user", which this app's context does not give
```

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
| `Alxia` | `get` `post` `put` `patch` `delete` `options` `head` `query` `route` `ws`, `static` `file` `page`, `decorate` `derive` `wrap` `onError` `onRefusal` `bodyLimit`, `around` `onRequest` `onResponse` `onStart` `onStop` `parser`, `group` `use`, `fetch` `websocket` `request` `listen` `stop`, `routes` `sockets` `server` |
| `eventStream(schema)`, `EventStreamSchema` | the response schema of a stream of events |
| `isEventStreamSchema(schema)` | whether a schema is one `eventStream(schema)` made |
| `eventStream({ name: schema })`, `NamedEventStreamSchema`, `EventSchemas` | the response schema of a stream of named events, its `event(name, data, fields?)` builder, its schemas by name under `~events` |
| `EventInput<Of>`, `EventOutput<Of>`, `EventFields` | what a handler yields on a named stream, what the client reads of it, and an event's `id` and `retry` |
| `isNamedEventStreamSchema(schema)` | whether a schema is one `eventStream({ … })` made |
| `FileSource`, `StaticOptions`, `FileOptions`, `StaticReply`, `parseRange` | static files |
| `Precompressed`, `FileNotFoundBody`, `RangeNotSatisfiableBody` | a coding stored beside a file, the bodies of the 404 and 416 |
| `Reply`, `HttpError`, `ResponseValidationError` | what a handler returns or throws |
| `ContentTooLargeError`, `ContentTooLargeBody` | what reading a body past its route's `bodyLimit` throws — answered as a `body_limit` refusal — and the body of its default 413: `{ error: 'content_too_large', limit }` |
| `ReplyInit` | a reply's options: `headers` |
| `AnyReply`, `FreeReplyFunction`, `TypedReplyFunction`, `DeclaredReply`, `RedirectFunction` | any reply, `reply` without and with schemas, every reply a route with schemas may return, `redirect` |
| `FreeShortcuts`, `TypedShortcuts`, `SHORTCUTS`, `Shortcuts` | `reply`'s shortcuts without and with schemas, and the status of each |
| `Plugin`, `AnyAlxia` | a function plugin, any app |
| `definePlugin<Requires>()(build)` | an app plugin built on an app whose context has `Requires`; `use` refuses it on an app that does not give them |
| `Requiring<Requires>`, `ProvidedBy<Ctx, Requires>` | the marker on a `definePlugin` plugin, and the check `use` makes of it |
| `RequiresOf<Ctx, Callback?>` | what a callback annotated `Ctx` reads beyond `BaseContext` — `{ user: User }` for `BaseContext & { user: User }`, `Empty` for nothing more: the `Requires` of a plugin that infers it from a callback it is given. A callback annotated `any` is refused on every app, with a message naming `Callback` |
| `ListenOptions` | the options of `listen`: `port`, `hostname`, `development`, `idleTimeout`, `maxRequestBodySize`, `tls` |
| `RequestHook`, `ResponseHook`, `AroundHook`, `StartHook`, `StopHook`, `BodyParser` | the hooks of `onRequest`, `onResponse`, `around`, `onStart`, `onStop`, and a body parser |
| `joinPath(prefix, path)` | a path under a prefix, as the app joins them: `joinPath('/api', '/')` is `'/api'`; typed `JoinPath` |
| `shapeOf(path)` | the path with its parameter names erased, as the router compares them: `shapeOf('/pets/:id') === shapeOf('/pets/:petId')`; throws a `TypeError` for a path no route may be declared at |
| `withHeaders`, `vary`, `check` | for plugins: edit a response's headers (copied when immutable; an error of the edit leaves the body unread), add to `Vary`, run a schema |
| `Checked` | what `check` returns: the value, or its issues |
| `RoutesOf<App>`, `Jsonify<T>` | the route table the client reads, and what a value is on the wire |
| `RouteTable`, `RouteRecord`, `RouteEntryOf`, `RouteInput`, `RouteOutput`, `Outcome`, `OutcomeOf` | a route as the client knows it: the entry one route adds to `RoutesOf`, what it sends, every outcome it may read |
| `ContextOf<App>` | what a route declared next on `App` reads: to type a GraphQL schema, a service |
| `RequestContext`, `BaseContext`, `Context`, `ResponseSettings`, `HandlerResult` | what every hook reads, what a handler reads, what a route sets on its response, what a handler may return |
| `RouteSchema`, `ResponseSchemas`, `RouteDetail`, `ValidSchema`, `RouteMethod`, `RouteDefinition`, `SocketDefinition` | a route: what it validates, what OpenAPI says of it, the checks its schema's type cannot express, a route method, a route and a socket as the app runs them |
| `RouteOperation`, `OperationSchema`, `OperationMethod` | a route as data for `route`: `{ method, path, schema? }`, its schema (or `Empty`), and the type of `route` |
| `SocketSchema`, `SocketContext`, `Socket`, `SocketHandlers`, `SocketSend`, `SocketMessage`, `SocketRecord`, `SocketEntryOf` | sockets: what a socket route validates, what its handlers read, send and receive, the entry one socket adds to `RoutesOf` |
| `StandardSchemaV1`, `StandardResult`, `StandardIssue`, `InferInput`, `InferOutput` | the Standard Schema types |
| `ValidationErrorBody`, `InternalErrorBody`, `RoutingErrorBody` | the bodies of the 400, 500, 404, 405 and 426 |
| `ValidationIssue`, `ValidationTarget` | one issue of a 400, and where the refused value was read from |
| `Refusal`, `ValidationRefusal`, `BodyLimitRefusal`, `RequestPart` | what an `onRefusal` hook reads: the refusal by `kind` — `validation`, with the `part` that failed first and its `issues`, or `body_limit`, with the route's `limit` |
| `RefusalSchema`, `RefusalResponses` | what an `onRefusal` hook may declare: the schema of each 4xx it answers, and its `contentType` |
| `RefusalHook`, `RefusalHandler` | an `onRefusal` hook, and the one in force for a route: `RouteDefinition['refusal']`, what `@alxia/openapi` documents |
| `Refusing`, `FallsBack`, `DefaultRefusalOutcome`, `DefaultLimitOutcome`, `RefusalOutcome`, `RefusalsOf`, `DeclaredRefusal`, `ThenShortcuts`, `BehindShortcuts`, `BodyLimited`, `BodyLimitShortcut`, `IsLimited` | how an app's type carries its `onRefusal` hook and its `bodyLimit()`: the mark of the hook's replies, of the default it falls back to, the default 400 and 413 a plugin's route keeps, how a later scope's and a using app's hooks replace them, the mark of a `bodyLimit()` in force and the shortcut it adds, whether a route is under a limit, the outcomes a refused request may get (`RefusalOutcome`), the replies a hook may answer (`RefusalsOf`) and, for a hook declaring schemas, those replies as its schemas give them back (`DeclaredRefusal`). Exported so an app's type can be named in a declaration file |
| `problem(details, init?)`, `ProblemDetails` | a reply whose body is an RFC 9457 problem — `type`, `title`, `status`, `detail`, `instance` and typed extension members — sent with its `status` as `application/problem+json` |
| `RoutePath`, `JoinPath`, `PathParams`, `PathParamName` | paths: an absolute path, a prefix joined to a path, the parameters a path declares |
| `StatusCode`, `InformationalStatus`, `SuccessStatus`, `RedirectStatus`, `ClientErrorStatus`, `ServerErrorStatus` | every status a route may declare, and each class of them |
| `Method`, `Empty`, `MaybePromise`, `Simplify` | an HTTP method, no properties, a value or its promise, an object type with its intersections flattened |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/core/docs): a page per area — routes and schemas, replies, hooks, groups and plugins, writing a plugin, static files, server-sent events, WebSockets, serving, and the app's type.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/core/docs/troubleshooting.md): an error message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/core/docs/roadmap.md): what is coming, and what is not planned.
