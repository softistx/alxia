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
		path: Path,
		schema: Schema & ValidSchema<JoinPath<Prefix, Path>, Schema>,
		handler: (ctx: Context<Ctx, JoinPath<Prefix, Path>, Schema>) => MaybePromise<Result>,
	): Alxia</* … the route added … */>;
	<const Path extends RoutePath, Result extends AnyReply>(
		path: Path,
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
error's message.

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
