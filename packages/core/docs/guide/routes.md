# Routes and schemas

This page covers declaring a route: its path, what its schema validates,
how each part of the request is read, and what the app answers when a
request matches nothing or is refused.

```ts
import { alxia } from '@alxia/core';
import { z } from 'zod';

const app = alxia().get(
	'/users/:id/posts',
	{
		params: z.object({ id: z.coerce.number().int() }),
		query: z.object({ tag: z.string().optional() }),
		response: { 200: z.array(z.object({ id: z.number(), title: z.string() })) },
	},
	({ params, query, reply }) => reply(200, findPosts(params.id, query.tag)),
);
```

## The route methods

```ts
app.get(path, schema, handler);
app.get(path, handler); // no schema: nothing validated, any reply
```

`get`, `post`, `put`, `patch`, `delete`, `options`, `head` and `query` take
the same arguments. `ws` declares a socket ([WebSockets](websockets.md)); `static`,
`file` and `page` serve files ([Static files](static-files.md)).

```ts
interface RouteMethod<M, Ctx, Routes, Prefix, Shortcuts> {
	<const Path extends RoutePath, Schema extends RouteSchema, Result extends HandlerResult<Schema>>(
		path: Path, // a literal the app would refuse does not compile: `Invalid path: …`
		schema: Schema & ValidSchema<JoinPath<Prefix, Path>, Schema>,
		handler: (ctx: Context<Ctx, JoinPath<Prefix, Path>, Schema>) => MaybePromise<Result>,
	): Alxia</* … the route added … */>;
	<const Path extends RoutePath, Result extends AnyReply>(
		path: Path, // checked as above
		handler: (ctx: Context<Ctx, JoinPath<Prefix, Path>, Empty>) => MaybePromise<Result>,
	): Alxia</* … */>;
}
```

A handler must return a reply. One that returns anything else is answered
with a 500, and the server logs
`GET /path: the handler returned no reply. Return ctx.reply(status, body).`

### `QUERY`

`query` declares a route for the HTTP `QUERY` method: a read, safe and
idempotent like a `GET`, whose criteria travel in the body — a search too
long or too structured for a query string. Its body is read and validated
like a `POST`'s, and a refused one is the same [400](#the-400).

```ts
const app = alxia().query(
	'/users/search',
	{
		body: z.object({ name: z.string().min(1), roles: z.array(z.string()).default([]) }),
		response: { 200: z.array(z.object({ id: z.number(), name: z.string() })) },
	},
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

It is exactly the route `app[method](path, schema, handler)` declares: the
same context, the same entry in `RoutesOf` (`'/api/pets/:petId'` above, the
prefix applied), and the same compile errors — a params schema that does not
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

// app.route: OperationMethod<Ctx, Routes, Prefix, Shortcuts>
<const Operation extends RouteOperation, Result extends HandlerResult<OperationSchema<Operation>>>(
	operation: Operation & {
		readonly schema?: ValidSchema<JoinPath<Prefix, Operation['path']>, OperationSchema<Operation>>;
	},
	handler: (
		ctx: Context<Ctx, JoinPath<Prefix, Operation['path']>, OperationSchema<Operation>>,
	) => MaybePromise<Result>,
) => Alxia</* … the route added … */>;
```

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
| a method with no handler | `GET /a: the handler is missing` |

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

## The schema

Every part is optional, and each one is any Standard Schema.

| Part | Validates | What the handler reads without it |
| --- | --- | --- |
| `params` | the path parameters, which arrive as strings | `{ readonly id: string }`, from the path |
| `query` | the query string | `Readonly<Record<string, string \| readonly string[]>>` |
| `headers` | the request headers, names lowercased | `Readonly<Record<string, string>>` |
| `cookies` | the `Cookie` header, by name | `Readonly<Record<string, string>>` |
| `body` | the body, parsed by its `content-type` | `undefined`: read `ctx.request` yourself |
| `response` | the body of each status the route may answer | any status, any body ([Replies](replies.md)) |
| `bodyLimit` | not a schema: the most bytes the body may hold, a 413 past it ([Body size](#body-size-bodylimit)) | no limit beyond `listen`'s `maxRequestBodySize` |
| `detail` | nothing at runtime: what [`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi) says of the route | — |

The handler reads each part as its schema's **output**: a schema that
coerces turns `"7"` into `7`, a default fills a missing key.

```ts
app.get(
	'/search',
	{
		query: z.object({ q: z.string(), page: z.coerce.number().int().default(1) }),
		headers: z.object({ 'accept-language': z.string().optional() }),
		cookies: z.object({ session: z.string() }),
		detail: { summary: 'Search', tags: ['search'] },
	},
	({ query, headers, reply }) =>
		reply(200, { q: query.q, page: query.page, language: headers['accept-language'] ?? 'en' }),
);
```

`detail` takes `summary`, `description`, `operationId`, `tags` and
`deprecated`.

### Query strings

A key given once is a string; given more than once, an array. So
`?tag=a&tag=b` reads `{ tag: ['a', 'b'] }` and `?tag=a` reads
`{ tag: 'a' }`. A list that may hold one item has to accept both:

```ts
const Tags = z.union([z.string().transform((tag) => [tag]), z.array(z.string())]);

app.get('/posts', { query: z.object({ tag: Tags.optional() }) }, ({ query, reply }) =>
	reply(200, query.tag ?? []), // string[]
);
```

`zq` in [`@alxia/zod`](https://www.npmjs.com/package/@alxia/zod) has
ready-made coercions for this, and keeps the client's side typed as the
value it means to send — `{ page: 2 }` rather than `unknown`.

### Bodies

The body is read only when the route has a `body` schema, by its
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
	{ body: z.object({ name: z.string(), file: z.instanceof(File) }) },
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
	.post('/csv', { body: z.array(z.string()) }, ({ body, reply }) => reply(200, body.length));
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
| `bodyLimit` in a route's schema | that route, whatever `bodyLimit()` was called before it |
| `app.bodyLimit(bytes)` | every route declared after it on the app, a group's included |
| `group.bodyLimit(bytes)` inside a group | the group's routes declared after it, never the app's |
| a plugin's routes, given to `use` | their own limit only: the app's `bodyLimit()` never reaches them. A `bodyLimit()` the plugin calls applies to the app's routes declared after `use`, as its hooks do |

```ts
import { alxia } from '@alxia/core';
import { z } from 'zod';

const Note = z.object({ text: z.string() });

const app = alxia()
	.bodyLimit(64 * 1024) // the app's default: 64 KiB
	.post('/notes', { body: Note }, ({ body, reply }) => reply(201, body))
	.group('/import', (bulk) =>
		bulk
			.bodyLimit(4 * 1024 * 1024) // this group only: 4 MiB
			.post('/notes', { body: z.array(Note) }, ({ body, reply }) => reply(200, body.length)),
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
hook (`derive`, `wrap`), and a handler that reads `ctx.request.body` as a stream, as `/upload` does
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
import { alxia, problem } from '@alxia/core';
import { z } from 'zod';

const api = alxia()
	.onRefusal((refusal) =>
		refusal.kind === 'body_limit'
			? problem({ type: 'urn:ietf:params:jmap:error:limit', status: 413, limit: 'maxSizeRequest' })
			: undefined,
	)
	.post('/api', { body: z.unknown(), bodyLimit: 10_000_000 }, ({ reply }) => reply(200, 'ok'));
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

A request any part refuses is answered with a 400 before the handler runs,
naming every issue in every part at once. `GET /users/abc?upper=maybe`, to a
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
that validates part of its request, so a client reads it.

The 400 is the default. [`onRefusal`](hooks.md#onrefusal) answers a refused
request in your own format for the routes declared after it, such as an RFC
9457 problem sent as `application/problem+json`. Its reply then takes the
400's place in those routes' types.

## What the types refuse

The schema argument is checked against the path and against
`RouteSchema`. Each of these is a compile error; the comment is what
TypeScript reports:

```ts
// the params schema must accept the parameters of "/users/:id", which arrive as strings
app.get('/users/:id', { params: z.object({ name: z.string() }) }, ({ reply }) => reply(200));

// the same, for a schema that does not coerce: the path gives "7", not 7
app.get('/users/:id', { params: z.object({ id: z.number() }) }, ({ reply }) => reply(200));

// 'quey' does not exist in type 'RouteSchema'. Did you mean to write 'query'?
app.get('/users', { quey: z.object({}) }, ({ reply }) => reply(200));

// '999' does not exist in type 'ResponseSchemas'
app.get('/users', { response: { 999: z.string() } }, ({ reply }) => reply(200, ''));
```

A params schema with an optional key the path does not declare —
`/users/:id` with `{ id, extra? }` — is refused with
`the params schema reads "extra", which "/users/:id" does not declare`. What
`reply` refuses is on [Replies](replies.md#with-response-schemas).

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
import { alxia, type StandardSchemaV1 } from '@alxia/core';

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

const app = alxia().get('/items', { query: Page }, ({ query, reply }) =>
	reply(200, query.page), // number
);
```

`InferInput<Schema>` is what a schema accepts — what a client sends, what a
handler passes to `reply` — and `InferOutput<Schema>` what it gives back.

## See also

- [Replies](replies.md): what a handler returns.
- [Hooks](hooks.md): what runs before validation, and what it adds to the
  context.
- [The app's type](types.md): what a client reads of each route.
