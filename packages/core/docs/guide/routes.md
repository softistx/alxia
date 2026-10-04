# Routes and validation

This page covers declaring a route: its path, its options and middlewares,
what `validate` and `responds` check, how each part of the request is read,
and what the app answers when a request matches nothing or is refused.

```ts
import { alxia, responds, validate } from '@alxia/core';
import { z } from 'zod';

const app = alxia().get(
	'/users/:id/posts',
	validate({
		params: z.object({ id: z.coerce.number().int() }),
		query: z.object({ tag: z.string().optional() }),
	}),
	responds({ 200: z.array(z.object({ id: z.number(), title: z.string() })) }),
	({ params, query, reply }) => reply(200, findPosts(params.id, query.tag)),
);
```

## The route methods

```ts
app.get(path, handler);                              // nothing validated, any reply
app.get(path, ...middlewares, handler);              // up to 8, run in the order given
app.get(path, options, ...middlewares, handler);     // options: bodyLimit, detail
app.get(path, auth, validate(schemas), responds(responses), handler);
```

The last argument is the handler, which returns the route's reply. Before
it, the route's middlewares: functions made by `defineMiddleware`, written
inline, or made by `validate` and `responds`. Each reads what the ones
before it passed `next`; they run after the hooks in force, in the order
given ([Middleware](middleware.md#a-routes-middlewares)). An object right
after the path is the route's options.

`get`, `post`, `put`, `patch`, `delete`, `options`, `head` and `query` take
the same arguments. `ws` declares a socket ([WebSockets](websockets.md)); `static`,
`file` and `page` serve files ([Static files](static-files.md)).

```ts
interface RouteMethod<M, Ctx, Routes, Prefix, Shortcuts>
	extends MiddlewareForms<RouteApp<M, Ctx, Routes, Prefix, Shortcuts>>,
		OptionsForms<RouteApp<M, Ctx, Routes, Prefix, Shortcuts>>,
		DeprecatedForms<M, Ctx, Routes, Prefix, Shortcuts> {}

// MiddlewareForms: one overload per count of middlewares, 0 to 8. With two:
<const Path extends RoutePath, R1 extends MiddlewareReturn, R2 extends MiddlewareReturn, Result extends …>(
	path: Path, // a literal the app would refuse does not compile: `Invalid path: …`
	m1: (ctx: /* the hooks' context, and the request as it arrived */, next: NextFunction) => R1,
	m2: (ctx: /* the same, and what m1 passed `next` */, next: NextFunction) => R2,
	handler: (ctx: /* the same, and what m2 passed `next`; `reply` typed by a `responds` */) => MaybePromise<Result>,
): Alxia</* … the route added: validate's input and 400, responds' statuses, the middlewares' replies */>;

// OptionsForms: the same, with the options after the path
<const Path extends RoutePath, const Options extends RouteOptions, R1 extends MiddlewareReturn, Result extends …>(
	path: Path,
	options: Options, // no schema: a key of one does not compile
	m1: (ctx: …, next: NextFunction) => R1,
	handler: (ctx: …) => MaybePromise<Result>,
): Alxia</* … the route added, with the 413 of a bodyLimit */>;
```

A route method checks its arguments when the route is declared, and a
mistake throws a `TypeError` at startup:

| Declared | Thrown |
| --- | --- |
| no handler last | `GET /a: the handler is missing` |
| something other than a function among the middlewares | `GET /a: middleware 1 is not a function: make it with defineMiddleware(), validate() or responds()` |
| a schema in the options beside middlewares, past the types | `GET /a: the options hold no schema: give validate(…) and responds(…) among the middlewares` |

A handler must return a reply. One that returns anything else is answered
with a 500, and the server logs
`GET /path: the handler returned no reply. Return ctx.reply(status, body).`
What a middleware may return, and the errors of one that returns anything
else, are on [Middleware](middleware.md#a-routes-middlewares).

### `QUERY`

`query` declares a route for the HTTP `QUERY` method: a read, safe and
idempotent like a `GET`, whose criteria travel in the body — a search too
long or too structured for a query string. Its body is read and validated
like a `POST`'s, and a refused one is the same [400](#the-400).

```ts
const app = alxia().query(
	'/users/search',
	validate({ body: z.object({ name: z.string().min(1), roles: z.array(z.string()).default([]) }) }),
	responds({ 200: z.array(z.object({ id: z.number(), name: z.string() })) }),
	({ body, reply }) => reply.ok(searchUsers(body.name, body.roles)),
);
// QUERY /users/search, content-type: application/json, {"name":"A"} → 200
// QUERY /users/search, {"name":""}                                    → 400
```

It is in the app's type like any route — `RoutesOf<App>['/users/search']['QUERY']`,
called as `api.query(path, { body })` by
[`@alxia/client`](https://www.npmjs.com/package/@alxia/client) — and in the
`Allow` of a 405 on its path. `@alxia/openapi` documents it as the path's
`query` operation, and `@alxia/cors` allows it by default. A cache does not:
`@alxia/cache` keys `GET` and `HEAD` only, as a `QUERY`'s key would have to
include its body.

### Routes as data: `route`

`route(operation, handler)` declares a route whose method, path and schema
are plain data — `{ method, path, schema? }` — instead of arguments: an
operation written once and shared between modules, or one a code generator
writes from an OpenAPI document.
`route(operation, ...middlewares, handler)` takes the middlewares of any
route, up to 8, and reads the operation's `schema` as two of them: a
`responds` of its `response`, first, which checks every reply with a status
it declares, a middleware's included; and a `validate` of its request
parts, just before the handler, so a middleware placed before it reads the
request as it arrived and an `auth` answers 401 before the body is read.
Given `validate(operation)` among the middlewares, the route validates
there instead, once ([Middlewares on a route declared as data](#middlewares-on-a-route-declared-as-data)).
`route(operation, [hooks], handler)`, a list of hooks, is the form of 0.3,
deprecated ([Hooks on one route](hooks.md#hooks-on-one-route)).

```ts
// operations.ts: data, importing only the schemas
import { z } from 'zod';

const Pet = z.object({ id: z.number(), name: z.string() });

export const getPet = {
	method: 'GET',
	path: '/pets/:petId',
	schema: {
		params: z.object({ petId: z.coerce.number().int() }),
		response: { 200: Pet, 404: z.object({ error: z.literal('not_found') }) },
	},
} as const;

export const health = { method: 'GET', path: '/health' } as const;
```

```ts
// app.ts
import { alxia } from '@alxia/core';
import { getPet, health } from './operations';

const app = alxia({ prefix: '/api' })
	.route(getPet, ({ params, reply }) => {
		const pet = findPet(params.petId); // params.petId: number
		return pet ? reply.ok(pet) : reply.notFound({ error: 'not_found' });
	})
	.route(health, ({ reply }) => reply(200, 'ok'));
// GET /api/pets/1 → 200, GET /api/pets/x → 400, GET /api/health → "ok"
```

It is exactly the route `app[method](path, options, responds(…), validate(…), handler)`
declares from the same schemas: the same context, the same entry in
`RoutesOf` (`'/api/pets/:petId'` above, the prefix applied), and the same
checks, at compile time — a params schema that does not
read the path, an unknown schema key, a status the operation does not declare.
`method` is any `Method`, `QUERY` included; an operation without `schema` is
a route without one.

**Keep the literals.** An operation in a variable of its own needs `as const`
— or `satisfies RouteOperation` — so that its `method` and `path` stay
`'GET'` and `'/pets/:petId'` rather than `string`; without it, `route`
refuses the operation with
[`route() needs one method: declare the operation as const`](../troubleshooting.md#route-needs-one-method-declare-the-operation-as-const).
An operation written inline, `app.route({ method: 'GET', path: '/x' }, …)`,
needs neither. An operation typed `RouteOperation`, or whose method is a union,
is refused the same way: its route would be typed under every method while
being served under one.

```ts
interface RouteOperation {
	readonly method: Method;
	readonly path: RoutePath;
	readonly schema?: RouteSchema;
}
/** The operation's `schema`, or `Empty`. */
type OperationSchema<Operation> = Operation extends { readonly schema: infer Schema extends RouteSchema }
	? Schema
	: Empty;

// app.route: OperationMethod, whose forms are OperationForms<App>, one per count of middlewares
<const Op extends RouteOperation, R1 extends MiddlewareReturn, Result>(
	operation: CheckedOperation<Prefix, Op>, // one method, a literal path, a schema that reads it
	m1: Middleware</* the route's context before the operation's validate */, R1>,
	handler: (ctx: /* … what m1 added, the validated parts, reply typed by the responses */) => MaybePromise<Result>,
) => Alxia</* … the route added … */>;
```

### Middlewares on a route declared as data

The operation's `validate` stands just before the handler unless you place
it: `validate(operation)` validates the operation's request parts where it
stands, and the route runs no other. A `validate` counts as the
operation's when it checks each of those parts by the very schema the
operation names, so `validate(renamePet)` on a route declared from a copy,
`{ ...renamePet, path }`, counts too. A `validate` of other schemas is one
more middleware: the route still validates the operation's parts before the
handler, and the body, read once, is checked by both.

Two things the types of `route` say differently from the runtime, both
rare. A middleware placed after `validate(operation)` that passes
`next({ body })` (or `params`, `query`, `headers`) is typed, in the
handler, by the operation's schema, though the handler receives what the
middleware passed. And on a route whose operation has no schema for a
part, a middleware that passes that part to `next` sees it typed, in the
handler, as the request's own: `query` raw, `body` `undefined`. Give such
a value another name — `next({ page })` — and both are typed as they run.

```ts
import { alxia, defineMiddleware, validate } from '@alxia/core';
import { z } from 'zod';

const Pet = z.object({ id: z.number(), name: z.string() });
export const renamePet = {
	method: 'PATCH',
	path: '/pets/:petId',
	schema: {
		params: z.object({ petId: z.coerce.number().int() }),
		body: z.object({ name: z.string().min(1) }),
		response: { 200: Pet, 401: z.object({ error: z.literal('unauthorized') }) },
	},
} as const;

export const renameDraft = { ...renamePet, path: '/drafts/:petId' } as const;

const auth = defineMiddleware(({ request, reply }, next) => {
	const user = request.headers.get('x-user');
	return user === null ? reply(401, { error: 'unauthorized' as const }) : next({ user });
});

const app = alxia()
	// auth first: a stranger gets 401 before his body is read
	.route(renamePet, auth, ({ user, params, body, reply }) =>
		reply(200, { id: params.petId, name: `${body.name} (by ${user})` }),
	)
	// validate first: a bad body gets 400 before anyone is asked
	.route(renameDraft, validate(renameDraft), auth, ({ params, body, reply }) =>
		reply(200, { id: params.petId, name: body.name }),
	);
```

The operation's `responds` stands first, so it checks `auth`'s 401 too,
against the schema the operation declares for it: a reply a middleware
makes with a declared status is sent as its schema's output, or refused
with a 500. A status the operation does not declare is sent as it is.
Before the operation's `validate`, a middleware reads `params` as strings
and `body` as `undefined`, as on any route.

## Paths

| Segment | Matches | Read as |
| --- | --- | --- |
| `/users` | that segment | — |
| `/:id` | one segment | `params.id`, a string, URL-decoded |
| `/*` | the rest of the path, possibly empty; last segment only | `params['*']` |

```ts
app.get('/files/*', ({ params, reply }) => reply(200, params['*']));
// GET /files/a/b.txt → "a/b.txt"
```

Paths are checked when the route is declared, and a mistake throws a
`TypeError` at startup:

| Declared | Thrown |
| --- | --- |
| `'users'` | `The route path "users" must start with "/"` |
| `'/a/*/b'` | `"/a/*/b": "*" may only end a path` |
| `'/a/:id/:id'` | `"/a/:id/:id" declares ":id" twice` |
| `'/at/10:30'` | `"/at/10:30": ":" may only start a segment, as a parameter` |
| `'/*.js'` | `"/*.js": "*" may only be a whole segment, as a wildcard` |
| `'/a/./b'` | `"/a/./b": "." is a dot segment, which a request's URL never keeps` |
| `'/café'` | `"/café" is not encoded as a request's URL carries it: declare "/caf%C3%A9"` |
| `'/users/:userId'` after `'/users/:id'` | `"/users/:userId" has the shape of "/users/:id" with other parameter names. Use the same names: the two would match the same requests.` |
| the same method and path twice | `GET /a is declared twice` |

A path written as a literal is refused by its type first: the call does
not compile, and the message is the `TypeError` above after
`Invalid path:`, so the mistake shows in the editor before the app runs:

```ts
app.get('/at/10:30', handler);
// error TS2345: Argument of type '"/at/10:30"' is not assignable to parameter of type
// '"Invalid path: \"/at/10:30\": \":\" may only start a segment, as a parameter"'.
```

The type reads a path's own syntax — the rows from `'/a/*/b'` to
`'/a/./b'`; `'users'` fails on `RoutePath` instead — under the app's
prefix and the group's. Left to the `TypeError` are a literal the URL
percent-encodes (`/café`), a path typed `string` or holding a
`` `${string}` ``, a plugin's routes under the prefix `use` gives them, and
what takes two routes: a shape or a method and path declared twice
([troubleshooting](../troubleshooting.md#argument-of-type--is-not-assignable-to-parameter-of-type-invalid-path-)).

The middle four keep a path one that `Bun.serve` accepts at `listen` and
reads as `fetch` does. Bun's router takes a `:` anywhere in a segment for
a parameter and a segment starting with `*` for a wildcard, throws on a
non-ASCII path, and compares a literal with the request's target as it was
sent, where `fetch` reads the URL's pathname. So a path is declared as a
request's URL carries it: percent-encoded where the URL encodes,
`/caf%C3%A9` for `/café`, and with no `.` or `..` segment, which the URL
resolves away. A client encodes what it asks for, so a request for `/café`
reaches `/caf%C3%A9`, through `fetch` and `listen` alike. What a URL leaves
as it is stays allowed: `%` and escapes, compared as written (`/caf%c3%a9`
is another path), `|`, `~`, `'`, `/.well-known`, an empty segment as in
`/a//b`.

A request whose target is not as its URL carries it, such as
`GET /files/../admin` sent unresolved by a raw client, is routed by its
URL, `/admin`, under `listen` as through `fetch`: a route with parameters
or a wildcard that Bun's router hands such a request to routes it again,
as `fetch` does. A [page](static-files.md) is the exception: `Bun.serve`
serves it itself, so it is matched on the target as sent.

### Which route answers

When several paths match a request, the one chosen is the one `Bun.serve`'s
router chooses under `listen`, and `app.fetch` and `app.request` choose it
the same way, so a test, a dev server going through `fetch` and production
route alike. The order of declaration plays no part:

- **Segment by segment, a literal beats a parameter, which beats a
  wildcard.** The first segment where two paths differ decides: `/users/me`
  over `/users/:id`, `/users/:id` over `/users/*`, `/api/*` over `/*`, and
  `/a/:id` over `/:x/b` for `/a/b`.
- **A path that leads nowhere gives way.** For `/a/b/d`, `/a/b/c` does not
  match, so `/:x/b/d` answers.
- **A trailing slash is a segment of its own.** `/a/*` matches `/a/` and
  `/a/x`, not `/a`; `/:id` does not match an empty segment. Only when no
  path matches that strictly is a trailing slash forgiven: `/users/`
  reaches `/users`, `/files` reaches `/files/*`.
- **The path is chosen before the method.** With `GET /users/:id` and
  `POST /users/me`, `GET /users/me` is a 405 that allows `POST`: `/users/me`
  is the path, and it has no `GET`.

```ts
app
	.get('/*', ({ reply }) => reply(200, 'page'))
	.get('/api/*', ({ reply }) => reply(200, 'api'));
// GET /api/users → "api", through fetch and listen alike
```

<a id="the-schema"></a>

## `validate` and `responds`

Two middlewares the core runs itself, placed among the route's others:

```ts
validate(schemas: { params?, query?, headers?, cookies?, body? }): Middleware; // each any Standard Schema
responds(responses: { [status: number]: StandardSchemaV1 }): Middleware;
```

`validate` reads each part it is given a schema for, and passes the
schema's **output** on, typed, to the middlewares after it and the handler:
a schema that coerces turns `"7"` into `7`, a default fills a missing key.

| Part | Validates | What is read without it, or before it |
| --- | --- | --- |
| `params` | the path parameters, which arrive as strings; a key the path lacks, optional or not, does not compile ([below](#what-the-types-refuse)) | `{ readonly id: string }`, from the path; `pathParams` holds them, after a `validate` too |
| `query` | the query string | `Readonly<Record<string, string \| readonly string[]>>` |
| `headers` | the request headers, names lowercased | `Readonly<Record<string, string>>` |
| `cookies` | the `Cookie` header, by name | `Readonly<Record<string, string>>`; the hooks, `onError` and `onRefusal` always read these |
| `body` | the body, parsed by its `content-type` | `undefined`: read `ctx.request` yourself |

`responds` declares the body of each status the route may answer. The
handler's `reply` is then typed by it — a declared status only, with a body
its schema takes — and its reply is checked by that schema and sent as its
output: an unknown key the schema strips never leaves the server
([Replies](replies.md#with-response-schemas)). A middleware placed after it
that replies with a declared status is checked the same way; one with
another status, or placed before it, is sent as it is
([Where `validate` stands](middleware.md#where-validate-stands)).

```ts
import { alxia, responds, validate } from '@alxia/core';
import { z } from 'zod';

const app = alxia().get(
	'/search',
	{ detail: { summary: 'Search', tags: ['search'] } },
	validate({
		query: z.object({ q: z.string(), page: z.coerce.number().int().default(1) }),
		headers: z.object({ 'accept-language': z.string().optional() }),
		cookies: z.object({ session: z.string() }),
	}),
	responds({ 200: z.object({ q: z.string(), page: z.number(), language: z.string() }) }),
	({ query, headers, reply }) =>
		reply(200, { q: query.q, page: query.page, language: headers['accept-language'] ?? 'en' }),
);
```

Both declare their schemas on the route, `app.routes[i].schema`, so
[`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi) documents
them, and the route's type reads them: `validate`'s input is what the
client sends, its 400 and `responds`' statuses are what it may read. Where
each stands changes which answer comes first, a 401 or a 400
([Middleware](middleware.md#where-validate-stands)).

### The options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `bodyLimit` | `number` | the `bodyLimit()` in force, or none | the most bytes the body may hold, a 413 past it ([Body size](#body-size-bodylimit)) |
| `detail` | `RouteDetail` | none | nothing at runtime: what `@alxia/openapi` says of the route — `summary`, `description`, `operationId`, `tags`, `deprecated` |

```ts
interface RouteOptions {
	readonly bodyLimit?: number;
	readonly detail?: RouteDetail;
}
```

The options hold no schema. `{ body: Post }` there beside a middleware does
not compile, and throws where the route is declared when the types are
passed by: give `validate({ body: Post })` among the middlewares.

### Query strings

A key given once is a string; given more than once, an array. So
`?tag=a&tag=b` reads `{ tag: ['a', 'b'] }` and `?tag=a` reads
`{ tag: 'a' }`. A list that may hold one item has to accept both:

```ts
const Tags = z.union([z.string().transform((tag) => [tag]), z.array(z.string())]);

app.get('/posts', validate({ query: z.object({ tag: Tags.optional() }) }), ({ query, reply }) =>
	reply(200, query.tag ?? []), // string[]
);
```

`zq` in [`@alxia/zod`](https://www.npmjs.com/package/@alxia/zod) has
ready-made coercions for this, and keeps the client's side typed as the
value it means to send — `{ page: 2 }` rather than `unknown`.

### Bodies

The body is read only by a `validate` given a `body` schema, by its
`content-type`:

| `content-type` | Read as |
| --- | --- |
| one a [`parser`](#body-parsers) was added for | what the parser returns |
| any containing `json` | `JSON.parse` of the text; an empty body is `undefined` |
| `multipart/form-data`, `application/x-www-form-urlencoded` | an object of its fields; a field given more than once an array; a file a `File` |
| `text/*` | the text |
| anything else | an `ArrayBuffer`, or `undefined` when there is no body |

```ts
app.post(
	'/avatar',
	validate({ body: z.object({ name: z.string(), file: z.instanceof(File) }) }),
	async ({ body, reply }) => {
		await Bun.write(`uploads/${body.name}`, body.file);
		return reply(204);
	},
);
```

### Body parsers

`parser(type, parse)` reads a `content-type` the built-in parsers do not —
a prefix, or a pattern — and is tried before them, for every route of the
app, wherever it is declared.

```ts
const app = alxia()
	.parser('application/csv', async (request) => (await request.text()).split(','))
	.post('/csv', validate({ body: z.array(z.string()) }), ({ body, reply }) => reply(200, body.length));
// POST /csv, content-type: application/csv, body "a,b,c" → 3
```

A parser that throws is a 400 with the code `unreadable_body` and the
error's message. A parser that reads past the route's
[`bodyLimit`](#body-size-bodylimit) gets a 413.

### Body size: `bodyLimit`

`listen`'s `maxRequestBodySize` caps every body the server takes. A route can
cap its own body below that limit:

| Where | Applies to |
| --- | --- |
| `bodyLimit` in a route's options | that route, whatever `bodyLimit()` was called before it |
| `app.bodyLimit(bytes)` | every route declared after it on the app, a group's included |
| `group.bodyLimit(bytes)` inside a group | the group's routes declared after it, never the app's |
| a plugin's routes, given to `use` | their own limit only: the app's `bodyLimit()` never reaches them. A `bodyLimit()` the plugin calls applies to the app's routes declared after `use`, as its hooks do |

```ts
import { alxia, validate } from '@alxia/core';
import { z } from 'zod';

const Note = z.object({ text: z.string() });

const app = alxia()
	.bodyLimit(64 * 1024) // the app's default: 64 KiB
	.post('/notes', validate({ body: Note }), ({ body, reply }) => reply(201, body))
	.group('/import', (bulk) =>
		bulk
			.bodyLimit(4 * 1024 * 1024) // this group only: 4 MiB
			.post('/notes', validate({ body: z.array(Note) }), ({ body, reply }) => reply(200, body.length)),
	)
	.post(
		'/upload',
		{ bodyLimit: 25 * 1024 * 1024 }, // this route only: 25 MiB
		async ({ request, reply }) => {
			let bytes = 0;
			for await (const chunk of request.body ?? []) bytes += chunk.byteLength;
			return reply(200, bytes);
		},
	);
```

The limit is a whole number of bytes, 0 or more. Any other value throws a
`TypeError` when the route is declared:
`POST /upload: bodyLimit must be a whole number of bytes, 0 or more; got -1`.

How a body is held to it, without reading it whole:

1. **`Content-Length` first.** A declared length over the limit is refused
   without reading a byte.
2. **Then a count.** Without a `Content-Length`, as with a chunked upload,
   or with a false one, the bytes are counted as they arrive. The read fails
   at the first chunk that passes the limit and the rest is never pulled. A
   body of exactly `bodyLimit` bytes is read.

The count covers every reader of the body. That means the built-in JSON,
form and text parsers, a [`parser`](#body-parsers) of the app's, a route
hook (`derive`, `wrap`), a middleware, and a handler that reads `ctx.request.body` as a stream, as `/upload` does
above. That handler sees a stream like any other, and the stream fails once
the count passes the limit. Measured on a 25 MiB limit through `listen`,
with 256 MiB offered: the handler read 25 MiB, the client had sent about
25.3 MiB when the request was refused, and the process grew by about 2 MiB.
[`body-limit.spec.ts`](https://github.com/softistx/alxia/blob/develop/packages/core/src/app/body-limit.spec.ts)
repeats that run: it holds the read and the growth under the limit, and the
bytes sent within 8 MiB of it.

A global hook, `onRequest` or `around`, runs before the route is known, so
it reads the body whole. If one has read it, the route's limit is skipped:
cap such a hook with `maxRequestBodySize`.

Past the limit the request is answered with a 413:

```json
{ "error": "content_too_large", "limit": 65536 }
```

Its body is the exported `ContentTooLargeBody`. The 413 is in the type of
every route under a limit, so a typed client reads it, and
[`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi) documents
it. A route with no limit has no default 413 in its type, and reads its
body as it always has.

What the read throws is a `ContentTooLargeError`, an `HttpError` with the
route's `limit`. The route answers it as a refusal, as it answers a 400:
the [`onRefusal`](hooks.md#onrefusal) hook in force reads
`{ kind: 'body_limit', limit }` and may answer in another format, such as
an RFC 9457 problem. The `onError` hooks never see it.

```ts
import { alxia, problem, validate } from '@alxia/core';
import { z } from 'zod';

const api = alxia()
	.onRefusal((refusal) =>
		refusal.kind === 'body_limit'
			? problem({ type: 'urn:ietf:params:jmap:error:limit', status: 413, limit: 'maxSizeRequest' })
			: undefined,
	)
	.post('/api', { bodyLimit: 10_000_000 }, validate({ body: z.unknown() }), ({ reply }) => reply(200, 'ok'));
// a body past 10 MB → 413, application/problem+json:
// { "type": "urn:ietf:params:jmap:error:limit", "status": 413, "limit": "maxSizeRequest" }
```

The hook's replies then take the default 413's place in the type of every
route under a limit. A hook that returns nothing for a `body_limit` sends
the default 413, which stays in the type beside them
([Hooks](hooks.md#onrefusal)).

A handler that streams its own response while it reads the body may have
sent its headers before the count passes the limit. In that case its
response stream fails instead of answering a 413.

## The 400

A request a `validate` refuses is answered with a 400 where the `validate`
stands, before anything after it runs, naming every issue in every part it
checks at once. `GET /users/abc?upper=maybe`, to a
route with a numeric `id` and `upper: z.enum(['yes', 'no']).optional()`:

```json
{
	"error": "validation",
	"issues": [
		{ "target": "params", "path": ["id"], "code": "invalid_type", "message": "…" },
		{ "target": "query", "path": ["upper"], "code": "invalid_value", "message": "…" }
	]
}
```

```ts
interface ValidationErrorBody {
	readonly error: 'validation';
	readonly issues: readonly ValidationIssue[];
}
interface ValidationIssue {
	readonly target: 'params' | 'query' | 'headers' | 'cookies' | 'body' | 'message';
	readonly path: readonly (string | number)[];
	readonly code: string; // the validator's own; `custom` for a vendor without one
	readonly message: string;
}
```

Two codes are the framework's: `invalid_json` (the body is not JSON) and
`unreadable_body` (a parser threw). The 400 is in the type of every route
with a `validate`, so a client reads it. The middlewares before the
`validate` see it as the response of `next()`.

The 400 is the default. [`onRefusal`](hooks.md#onrefusal) answers a refused
request in your own format for the routes declared after it, such as an RFC
9457 problem sent as `application/problem+json`. Its reply then takes the
400's place in those routes' types.

## What the types refuse

`validate`'s schemas are checked against the path and against
`RequestSchemas`, `responds`' against the statuses, and each middleware
against what the route gives it where it stands. Each of these is a compile
error; the comment is what TypeScript reports:

```ts
// No overload matches this call. … Argument of type 'Middleware<{ readonly pathParams: { readonly name: string; }; }, …>' is not assignable to parameter of type …
app.get('/users/:id', validate({ params: z.object({ name: z.string() }) }), ({ reply }) => reply(200));

// the same, 'pathParams: { readonly id: number; }', for a schema that does not coerce: the path gives "7", not 7
app.get('/users/:id', validate({ params: z.object({ id: z.number() }) }), ({ reply }) => reply(200));

// the same, 'pathParams: { readonly id: string; }', for a path with no parameter
app.get('/users', validate({ params: z.object({ id: z.string() }) }), ({ reply }) => reply(200));

// the same, 'pathParams: { readonly id: string; readonly extra: string | undefined; }', for a key the path lacks, optional or not
app.get('/users/:id', validate({ params: z.object({ id: z.string(), extra: z.string().optional() }) }), ({ reply }) => reply(200));

// 'quey' does not exist in type 'RequestSchemas'. Did you mean to write 'query'?
app.get('/users', validate({ quey: z.object({}) }), ({ reply }) => reply(200));

// '999' does not exist in type 'ResponseSchemas'
app.get('/users', responds({ 999: z.string() }), ({ reply }) => reply(200, ''));

// No overload matches this call: a schema in the options — Type 'ZodString' is not assignable to type 'never'
app.post('/users', { body: z.string() }, auth, ({ reply }) => reply(200));

// Property 'user' does not exist: no middleware before this one added it
app.get('/me', ({ user }, next) => next({ id: user.id }), auth, ({ reply }) => reply(200));
```

A ninth middleware does not compile either: the types thread eight. With
the params, the message TypeScript prints is that of the last overload it
tried; the argument it names is the `validate(…)` whose `pathParams` the
path does not give. A `params` schema reads the path's parameters and no
other: every key it declares, an optional one included, must be a
parameter of the path, as a string. What `reply` refuses is on
[Replies](replies.md#with-response-schemas).

## Answered outside every route

| Request | Status | Body |
| --- | --- | --- |
| a path no route declares | 404 | `{ "error": "not_found" }` |
| the path that answers ([Which route answers](#which-route-answers)), by a method it does not have | 405, with `Allow` | `{ "error": "method_not_allowed" }` |
| a socket's path, without an upgrade | 426 | `{ "error": "upgrade_required" }` |

`HEAD` on a path with a `GET` and no `HEAD` of its own runs the `GET` route
and sends its headers without the body.

## Any Standard Schema

The core calls `~standard.validate` and nothing else. A schema written by
hand types the route like a Zod one:

```ts
import { alxia, type StandardSchemaV1, validate } from '@alxia/core';

const Page: StandardSchemaV1<unknown, { page: number }> = {
	'~standard': {
		version: 1,
		vendor: 'hand',
		validate: (value) => {
			const page = Number((value as { page?: unknown }).page);
			return Number.isInteger(page) && page > 0
				? { value: { page } }
				: { issues: [{ message: 'Expected a positive page', path: ['page'] }] };
		},
	},
};

const app = alxia().get('/items', validate({ query: Page }), ({ query, reply }) =>
	reply(200, query.page), // number
);
```

`InferInput<Schema>` is what a schema accepts — what a client sends, what a
handler passes to `reply` — and `InferOutput<Schema>` what it gives back.

## The forms of 0.3, deprecated

A schema before the handler, and a list of hooks after the path, still
compile and run as they did in 0.3, and will be removed in a later minor:

```ts
app.get(path, schema, handler);                  // deprecated: validate(…) and responds(…), options for bodyLimit and detail
app.get(path, [canView, loadPet], schema, handler); // deprecated: middlewares, made by defineMiddleware
app.get(path, [canView], handler);
```

A schema there validates the request just before the handler, after the
list, with `responds` checking the handler's reply: at runtime it becomes
`validate(…)` and `responds(…)` placed last, so the route answers exactly as
it did. Its `bodyLimit` and `detail` move to the options:

```ts
// deprecated
app.post('/upload', { body: Upload, response: { 201: Stored }, bodyLimit: 25 * 1024 * 1024 }, handler);
// now
app.post('/upload', { bodyLimit: 25 * 1024 * 1024 }, validate({ body: Upload }), responds({ 201: Stored }), handler);
```

A schema there is checked against the path as `validate`'s is, an optional
key the path does not declare included. After a list of hooks, TypeScript
names the key — `/users/:id` with `{ id, extra? }` is refused with
`the params schema reads "extra", which "/users/:id" does not declare`.
Each change is on [Upgrading](../upgrading.md); the list's hooks on
[Hooks on one route](hooks.md#hooks-on-one-route).

## See also

- [Replies](replies.md): what a handler returns.
- [Middleware: which way to use](middleware.md): where `validate` and
  `responds` stand among the route's middlewares, and the order a request
  runs them in.
- [Hooks](hooks.md): what runs before the route's middlewares, and what it
  adds to the context.
- [The app's type](types.md): what a client reads of each route.
