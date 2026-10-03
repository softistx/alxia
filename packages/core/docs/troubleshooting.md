# Troubleshooting

Each entry is headed by the text you see: a TypeScript error, an exception
thrown when the app is built, a response body, or a line in the server log.

**Types**

- [`the params schema must accept the parameters of "…", which arrive as strings`](#the-params-schema-must-accept-the-parameters-of--which-arrive-as-strings)
- [`the params schema reads "…", which "…" does not declare`](#the-params-schema-reads--which--does-not-declare)
- [`'quey' does not exist in type 'RouteSchema'`](#quey-does-not-exist-in-type-routeschema)
- [`'299' does not exist in type 'ResponseSchemas'`](#299-does-not-exist-in-type-responseschemas)
- [`Argument of type '201' is not assignable to parameter of type '200'`](#argument-of-type-201-is-not-assignable-to-parameter-of-type-200)
- [`Type 'string' is not assignable to type 'number'` on a `reply`](#type-string-is-not-assignable-to-type-number-on-a-reply)
- [`Type 'Response' is not assignable to type 'MaybePromise<AnyReply>'`](#type-response-is-not-assignable-to-type-maybepromiseanyreply)
- [`Property 'user' does not exist on type 'Context<…>'`](#property-user-does-not-exist-on-type-context)
- [`the plugin reads "…", which this app's context does not give: use the plugin that adds it first`](#the-plugin-reads--which-this-apps-context-does-not-give-use-the-plugin-that-adds-it-first)
- [`the plugin reads "…", which this app's context gives with another type`](#the-plugin-reads--which-this-apps-context-gives-with-another-type)
- [`this app's context does not give what the plugin reads`](#this-apps-context-does-not-give-what-the-plugin-reads)
- [`… is not assignable to type 'ProvidedBy<C, …>'`](#-is-not-assignable-to-type-providedbyc-)
- [`route() needs one method: declare the operation as const`](#route-needs-one-method-declare-the-operation-as-const)

**Building the app**

- [`The route path "…" must start with "/"`](#the-route-path--must-start-with-)
- [`The prefix "…" must start with "/" and not end with one`](#the-prefix--must-start-with--and-not-end-with-one)
- [`"…": "*" may only end a path`](#--may-only-end-a-path)
- [`"…": ":…" is not a parameter name`](#--is-not-a-parameter-name)
- [`"…" declares ":…" twice`](#-declares--twice)
- [`"…" has the shape of "…" with other parameter names`](#-has-the-shape-of--with-other-parameter-names)
- [`GET /… is declared twice`](#get--is-declared-twice)
- [`GET /…: the handler is missing`](#get--the-handler-is-missing)
- [`group(): build is missing`](#group-build-is-missing)
- [`page(): /… is already served`](#page--is-already-served)
- [`GET /… is already served by a page`](#get--is-already-served-by-a-page)

**Responses**

- [`400 {"error":"validation","issues":[…]}`](#400-errorvalidationissues)
- [`404 {"error":"not_found"}`](#404-errornot_found)
- [`405 {"error":"method_not_allowed"}`](#405-errormethod_not_allowed)
- [`426 {"error":"upgrade_required"}`](#426-errorupgrade_required)
- [`416 {"error":"range_not_satisfiable"}`](#416-errorrange_not_satisfiable)
- [`500 {"error":"internal"}`](#500-errorinternal)

**Server log**

- [`ResponseValidationError: … the 200 reply does not match its schema`](#responsevalidationerror--the-200-reply-does-not-match-its-schema)
- [`ResponseValidationError: … declares no 201 reply`](#responsevalidationerror--declares-no-201-reply)
- [`TypeError: … the handler returned no reply. Return ctx.reply(status, body).`](#typeerror--the-handler-returned-no-reply-return-ctxreplystatus-body)
- [`TypeError: An event does not match its schema`](#typeerror-an-event-does-not-match-its-schema)

**WebSockets**

- [`{"error":"validation", … "code":"invalid_json","message":"The message is not valid JSON"}`](#errorvalidation--codeinvalid_jsonmessagethe-message-is-not-valid-json)
- [Close code `1011`, `internal error`](#close-code-1011-internal-error)

## Types

These are compile errors on purpose: the types refuse a route the runtime
could not honour. Each one below is what `tsc` prints.

### `the params schema must accept the parameters of "…", which arrive as strings`

**When:** a route's `params` schema expects something other than a string
for a path parameter, or requires a key the path does not have.

```text
error TS2322: Type 'ZodObject<{ id: ZodNumber; }, $strip>' is not assignable to type 'ZodObject<{ id: ZodNumber; }, $strip> & "the params schema must accept the parameters of \"/users/:id\", which arrive as strings"'.
```

With `exactOptionalPropertyTypes` on, the same message comes as `TS2375`.

**Why:** a path parameter is always a string. `z.number()` refuses `"42"`,
so the route could never match a request.

**Fix:** coerce the string, with `zq` from `@alxia/zod` or with your
validator's own coercion:

```ts
import { zq } from '@alxia/zod';

app.get('/users/:id', { params: z.object({ id: zq.int() }) }, ({ params, reply }) =>
	reply(200, { id: params.id }), // params.id: number
);
```

### `the params schema reads "…", which "…" does not declare`

**When:** a route's `params` schema has an optional key the path does not
declare.

```text
error TS2322: Type 'ZodObject<{ id: ZodString; org: ZodOptional<ZodString>; }, $strip>' is not assignable to type 'ZodObject<{ id: ZodString; org: ZodOptional<ZodString>; }, $strip> & "the params schema reads \"org\", which \"/users/:id\" does not declare"'.
```

**Why:** `org` is not a parameter of `/users/:id`, so it would always be
`undefined`. A misspelt parameter name lands here too. The message names
each key the path does not declare; with several, TypeScript lists one
message per key.

**Fix:** name the keys the path declares, or add the parameter to the path:

```ts
app.get('/orgs/:org/users/:id', { params: z.object({ org: z.string(), id: z.string() }) }, handler);
```

### `'quey' does not exist in type 'RouteSchema'`

**When:** the route's schema object has a key that is not a part of a route.

```text
error TS2561: Object literal may only specify known properties, but 'quey' does not exist in type 'RouteSchema'. Did you mean to write 'query'?
```

When the schema object is a variable, the message names the key instead:
`"quey" is not a part of a route: params, query, headers, cookies, body, response or detail`.
A variable with no known key at all gives
`TS2559: Type '{ quey: … }' has no properties in common with type 'RouteSchema'`.

**Why:** a misspelt part would never be validated, and the handler would
read the raw value.

**Fix:** use one of `params`, `query`, `headers`, `cookies`, `body`,
`response` or `detail`:

```ts
app.get('/users', { query: z.object({ page: zq.int().optional() }) }, handler);
```

### `'299' does not exist in type 'ResponseSchemas'`

**When:** `response` declares a key that is not an HTTP status.

```text
error TS2353: Object literal may only specify known properties, and '299' does not exist in type 'ResponseSchemas'.
```

When the schema object is a variable, the message is
`"299 is not an HTTP status"`.

**Why:** `response` is keyed by the statuses a route may answer, the
`StatusCode` type: the registered codes from 100 to 511.

**Fix:** declare a registered status:

```ts
app.get('/users', { response: { 200: z.array(User) } }, handler);
```

### `Argument of type '201' is not assignable to parameter of type '200'`

**When:** a handler of a route with `response` schemas replies with a status
it did not declare.

**Why:** with schemas, `reply` takes only the declared statuses, so the
client's type lists every status it can read.

**Fix:** declare the status, then reply with it:

```ts
app.post('/users', { body: NewUser, response: { 201: User } }, async ({ body, reply }) =>
	reply(201, await createUser(body)),
);
```

### `Type 'string' is not assignable to type 'number'` on a `reply`

**When:** the body handed to `reply` does not match the schema declared
for that status, for instance `reply(200, { id: '1', name: 'x' })` when
`id` is a number.

**Why:** the body is checked against the input type of the status's schema.

**Fix:** reply with the shape the schema accepts, or change the schema:

```ts
reply(200, { id: Number(row.id), name: row.name });
```

### `Type 'Response' is not assignable to type 'MaybePromise<AnyReply>'`

**When:** a handler returns a `Response`, for example `new Response('ok')`
or `Response.json(data)`.

**Why:** a handler returns a `Reply`. A raw `Response` has no type the
client could read.

**Fix:** return `reply`. A string goes as `text/plain`, a `Blob` or a stream
as it is, and anything else as JSON:

```ts
app.get('/health', ({ reply }) => reply(200, 'ok'));
```

A `Response` is only for global hooks (`onRequest`, `onResponse`,
`around`), outside the typed contract.

### `Property 'user' does not exist on type 'Context<…>'`

**When:** a route reads what a `derive` or `decorate` adds, but the route
is declared before that hook.

```text
error TS2339: Property 'user' does not exist on type 'Context<Empty, "/me", Empty>'.
```

**Why:** a route hook applies only to the routes declared after it. This is
true at runtime too: in JavaScript, `ctx.user` would be `undefined`.

**Fix:** declare the hook first ([Hooks](../README.md#hooks)):

```ts
const app = alxia()
	.derive(async ({ request }) => ({ user: await authenticate(request) }))
	.get('/me', ({ user, reply }) => reply(200, user));
```

The same applies to `use(plugin)`. Its route hooks reach the routes
declared after `use`, not before it.

### `the plugin reads "…", which this app's context does not give: use the plugin that adds it first`

**When:** an app uses a plugin made by `definePlugin<Requires>()`, and
nothing declared before that `use` adds a key the plugin requires.

```ts
const tenant = definePlugin<{ user: { tenantId: string } }>()((app) =>
	app.derive(({ user }) => ({ tenant: tenants.get(user.tenantId) ?? null })),
);

alxia().use(tenant);
```

```text
error TS2769: No overload matches this call.
  …
  Overload 2 of 2, '(plugin: Alxia<…> & { readonly '~requires'?: { user: { tenantId: string; }; }; } & { ...; }): Alxia<…>', gave the following error.
    …
        Types of property ''~requires'' are incompatible.
          Type '{ user: { tenantId: string; }; }' is not assignable to type '"the plugin reads \"user\", which this app's context does not give: use the plugin that adds it first"'.
```

The first overload's error, about a function plugin, is noise: the
message on the last line is the one that matters.

**Why:** the plugin's hooks read `user`, and on this app no plugin or
`derive` before it adds one, so at runtime `user` would be `undefined`. The
message names each key at fault; with several, the error lists one message
per key, joined by `|`, and a key of another type gets the message of the
entry below.

**Fix:** use the plugin that adds the key first:

```ts
alxia().use(auth).use(tenant); // auth derives user
```

The order is what counts: `alxia().use(tenant).use(auth)` is refused too.

### `the plugin reads "…", which this app's context gives with another type`

**When:** the app's context has the key the plugin requires, but its type
does not fit, such as a `user` that may be `null` for a plugin that
requires one.

```ts
alxia()
	.derive(async ({ request }) => ({ user: await authenticate(request) })) // user: User | null
	.use(tenant);
```

```text
          Type '{ user: { tenantId: string; }; }' is not assignable to type '"the plugin reads \"user\", which this app's context gives with another type"'.
```

**Why:** with `user: User | null`, the plugin's `user.tenantId` would throw
on an anonymous request.

**Fix:** give the type the plugin requires, here by answering 401 when
there is no user:

```ts
alxia()
	.derive(async ({ request, reply }) => {
		const user = await authenticate(request);
		return user ? { user } : reply(401, { error: 'unauthenticated' as const });
	})
	.use(tenant);
```

If you wrote the plugin, you can instead widen its requirement
(`{ user: { tenantId: string } | null }`) and handle the `null` in it.

### `this app's context does not give what the plugin reads`

**When:** as for the two entries above, but the plugin's `Requires` has no
key the message can name: a symbol key, or a union such as
`{ a: string } | { b: string }`.

```text
          Type '{ a: string; } | { b: string; }' is not assignable to type '"this app's context does not give what the plugin reads"'.
```

**Why:** the app's context fits no member of the union, or lacks the
symbol key, and a message can only name a string or number key.

**Fix:** give what the plugin requires before using it, or, if you wrote
the plugin, name its requirement with string keys.

### `… is not assignable to type 'ProvidedBy<C, …>'`

**When:** `use(plugin)` with a `definePlugin` plugin, on an app whose
context is a type parameter:

```ts
const withTenant = <C extends { user: { tenantId: string } }>(app: Alxia<C>) =>
	app.use(tenant);
```

```text
error TS2769: No overload matches this call.
  …
      Type 'Alxia<{ user: { tenantId: string; }; } & { tenant: …; }, Empty, "", never> & Requiring<{ user: { tenantId: string; }; }>' is not assignable to type 'ProvidedBy<C, { user: { tenantId: string; }; }>'.
```

**Why:** the check is a conditional type, and TypeScript does not decide a
conditional type on a type parameter, even when its bound would pass.

**Fix:** type the app with a concrete context, or as `AnyAlxia` and give
the function's return type yourself. `AnyAlxia` is not checked.

### `route() needs one method: declare the operation as const`

**When:** the operation given to `app.route` has a method or a path that is
not a literal:

- it is declared in a variable of its own, without `as const`;
- it is typed `RouteOperation`;
- or its method is a union, `'GET' | 'POST'`.

```text
error TS2345: Argument of type '{ method: string; path: string; }' is not assignable to parameter of type 'never'.
  The intersection 'RouteOperation & { readonly method: "route() needs one method: declare the operation as const"; readonly path: "route() needs the path as a literal: declare the operation as const"; readonly schema?: unknown; }' was reduced to 'never' …
```

**Why:** TypeScript widens the properties of an object in a variable:
`'GET'` and `'/pets/:petId'` both become `string`. A route under a method it
cannot name would be typed under every method while being served under one,
so the client would offer calls that answer 404. A route with a path it
cannot name has no parameters to read. An operation written inline in the
call is not widened.

**Fix:** keep the literals, with `as const` or `satisfies RouteOperation`
([Routes as data](guide/routes.md#routes-as-data-route)):

```ts
export const getPet = {
	method: 'GET',
	path: '/pets/:petId',
	schema: { params: z.object({ petId: z.coerce.number().int() }) },
} as const;
```

## Building the app

These are `TypeError`s thrown when a route is declared, so the app fails at
startup, not on a request.

### `The route path "…" must start with "/"`

**When:** a route path is relative, `app.get('users', …)`. TypeScript
refuses it first:

```text
error TS2345: Argument of type '"users"' is not assignable to parameter of type '`/${string}`'.
```

**Why:** paths are absolute. A prefix is set with `alxia({ prefix })` or
`group(prefix, …)`.

**Fix:**

```ts
app.get('/users', handler);
```

### `The prefix "…" must start with "/" and not end with one`

**When:** `alxia({ prefix })` with `'api'` or `'/api/'`.

**Why:** the prefix is joined to paths that start with `/`. A trailing
slash would give `//`.

**Fix:**

```ts
const app = alxia({ prefix: '/api' });
```

### `"…": "*" may only end a path`

**When:** a path has `*` before its last segment, such as `/files/*/raw`.

**Why:** `*` takes the rest of the path, so nothing can follow it.

**Fix:** end the path with `*` and read the rest from `params['*']`, or
name the segment:

```ts
app.get('/files/:name/raw', handler);
```

### `"…": ":…" is not a parameter name`

**When:** a `:` segment is not a JavaScript identifier: `/a/:1d`,
`/a/:user-id`, or a lone `:`.

**Why:** the name becomes a key of `params`, so it has to be one you can
write as `params.name`.

**Fix:**

```ts
app.get('/users/:userId', handler);
```

### `"…" declares ":…" twice`

**When:** one path names a parameter twice, `/a/:id/b/:id`.

**Fix:** give each parameter its own name: `/a/:aId/b/:bId`.

### `"…" has the shape of "…" with other parameter names`

```text
"/users/:userId" has the shape of "/users/:id" with other parameter names. Use the same names: the two would match the same requests.
```

**When:** two routes, of any methods, differ only in their parameter names:
`GET /users/:id` and `PATCH /users/:userId`. Mounting a plugin or a group
can bring the second one in.

**Why:** both would match the same requests, so one path would have two
sets of parameter names.

**Fix:** use the same names on every route of that shape:

```ts
app.get('/users/:id', getUser).patch('/users/:id', updateUser);
```

### `GET /… is declared twice`

**When:** the same method and path are declared twice, often once directly
and once through `use(plugin)` or a `group`, or as `static` beside a
`GET /…/*`.

**Fix:** keep one. `HEAD` runs the `GET` route, so you do not need to
declare it.

### `GET /…: the handler is missing`

**When:** a route method gets a schema but no handler,
`app.get('/a', { query })`, often because the handler was passed as a
third argument that is `undefined`.

**Fix:** pass the handler last:

```ts
app.get('/a', { query: Query }, ({ query, reply }) => reply(200, query));
```

### `group(): build is missing`

**When:** `group('/admin')` is called without its function.

**Fix:**

```ts
app.group('/admin', (admin) => admin.derive(requireAdmin).get('/stats', stats));
```

### `page(): /… is already served`

**When:** `page(path, bundle)` names a path that another `page` or a
route already serves, or one of the same shape (`/u/:id` where `/u/:name`
is served), on the app, in a group or in a plugin it uses.

**Fix:** serve the page at its own path, or remove the route. Note that
`static('/', …)` declares `/*`, not `/`, so it leaves `/` free for a page.

### `GET /… is already served by a page`

**When:** a route — `get`, `post`, any method, or `ws` — is declared at a
path a `page` already serves, on the app, in a group or in a plugin it
uses. The message names the method. A path of the same shape counts:
`/users/:name` where a page serves `/users/:id`.

**Why:** `listen` gives the page that path in Bun's routes, and the page
then answers every method there, so the route would never be reached.

**Fix:** move the route, or the page:

```ts
app.page('/dashboard', dashboard).get('/api/dashboard', ({ reply }) => reply(200, stats()));
```

## Responses

The app answers these itself. Their bodies are the exported
`ValidationErrorBody`, `RoutingErrorBody`, `FileNotFoundBody`,
`RangeNotSatisfiableBody` and `InternalErrorBody`.

### `400 {"error":"validation","issues":[…]}`

**When:** a request reaches a route whose `params`, `query`, `headers`,
`cookies` or `body` schema refuses it. Every issue is listed, each with the
part it was read from:

```json
{ "error": "validation", "issues": [{ "target": "query", "path": ["tag"], "code": "invalid_type", "message": "Invalid input: expected array, received string" }] }
```

**Why**, by the issue you read:

- `"target":"query"`, `expected number, received string`: query values
  are strings, like path parameters.
- `"target":"query"`, `expected array, received string`: a key given once
  is a string. Only a key given more than once is an array.
- `"target":"body"`, `"code":"invalid_json"`, `The body is not valid JSON`:
  the `content-type` says JSON and the body does not parse.
- `"target":"body"`, `expected object, received undefined`: the body was
  empty, or its `content-type` was missing, so it was read as bytes and the
  fields are missing. The body is read by `content-type`: JSON, a form,
  `text/*`, or the bytes.
- `"code":"unreadable_body"`: a parser added with `parser(type, parse)`
  threw, and `message` is its error's.

**Fix:** coerce strings, accept one or many, and send the `content-type`:

```ts
import { zq } from '@alxia/zod';

app.get('/items', {
	query: z.object({ page: zq.int().optional(), tag: zq.array(z.string()).optional() }),
}, handler);
```

```ts
await fetch('/users', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ name: 'Ada' }),
});
```

[`@alxia/client`](https://www.npmjs.com/package/@alxia/client) sets the
`content-type` for you.

### `404 {"error":"not_found"}`

**When:** a request matches no route, or a `static` or `file` route finds
no file.

**Why**, most often:

- The path lacks the app's or the group's prefix: with
  `alxia({ prefix: '/api' })`, the route is `/api/users`.
- The path is a `page(…)`. Pages are served by `Bun.serve` itself, so
  `app.fetch` and `app.request` answer 404 for them. Only `listen` serves
  them.
- `static` was given a relative directory, which is resolved from the
  process's working directory, not from the file that declares it.
- The file is a dotfile (`.env`, `.well-known/…`), or the path leaves the
  source with `..`, a backslash or an encoded slash. These are refused on
  purpose.
- A function source returned `null` or `undefined`.

**Fix:** anchor the directory to the module, and opt in to dotfiles where
you mean it:

```ts
import { join } from 'node:path';

app.static('/assets', join(import.meta.dir, 'public'));
app.static('/', join(import.meta.dir, 'site'), { dotfiles: true }); // serves /.well-known/…
```

`dotfiles` applies to the path under the route, not to the route's own
path: `static('/.well-known', dir)` serves the files in `dir` without it.

### `405 {"error":"method_not_allowed"}`

**When:** the path matches a route, but not with that method. The `Allow`
header lists the methods it does take.

**Fix:** call it with a method in `Allow`, or declare the route for the
method you call. `HEAD` is answered by the `GET` route.

### `426 {"error":"upgrade_required"}`

**When:** a request reaches a `ws` route without a WebSocket upgrade, or
through `app.fetch` / `app.request`, which have no server to upgrade with.

**Why:** a socket needs `Bun.serve`'s upgrade.

**Fix:** serve the app with `listen` and connect with a WebSocket
([WebSockets](../README.md#websockets)):

```ts
const server = app.listen(3000);
const socket = new WebSocket(new URL('/rooms/lobby', server.url.href.replace('http', 'ws')));
```

### `416 {"error":"range_not_satisfiable"}`

**When:** a `static` or `file` route gets a `Range` that starts past the
end of the file. The response carries `Content-Range: bytes */<size>`.

**Why:** the client's idea of the file is stale (the file shrank), or it
computed the range wrongly.

**Fix:** read the size from `Content-Range` and ask again, or drop the
`Range` header. `ranges: false` turns range support off for that route:

```ts
app.static('/media', join(import.meta.dir, 'media'), { ranges: false });
```

### `500 {"error":"internal"}`

**When:** a handler or a hook throws, or a reply breaks its schema. The
body never says why, by design.

**Why:** the app prints the error with `console.error`, then answers 500.
The next section lists the messages it prints. An error thrown in a route
first goes through that route's `onError` hooks. An `HttpError` is answered
with its own status and body.

**Fix:** read the server log for the real error. To answer a known failure
with a status of your own, return a declared reply, or turn the error into
one with `onError`:

```ts
app
	.onError((error, { reply }) =>
		error instanceof NotFoundError ? reply(404, { error: 'not_found' as const }) : undefined,
	)
	.get('/users/:id', handler);
```

Prefer a declared `reply` to `throw new HttpError(…)`: a thrown status is
not in the route's type, so a typed client does not expect it.

## Server log

Each of these is printed by `console.error`, and the request is answered
`500 {"error":"internal"}`.

### `ResponseValidationError: … the 200 reply does not match its schema`

```text
ResponseValidationError: GET /r: the 200 reply does not match its schema: n: Invalid input: expected number, received string
```

**When:** a handler replies with a body that the status's schema refuses
at runtime. Data from a database, `JSON.parse` or `any` gets past the types.

**Why:** what leaves the server is the schema's output. A body the schema
refuses is never sent, so the client never reads an undeclared shape.

**Fix:** map the data to the schema before replying. To skip the check in
a hot path you trust, turn it off for the app; the declared status is still
enforced:

```ts
const app = alxia({ validateResponses: false });
```

### `ResponseValidationError: … declares no 201 reply`

```text
ResponseValidationError: GET /u declares no 201 reply
```

**When:** a route with `response` schemas replies with a status it did not
declare. The types refuse that, so this comes from JavaScript or a cast.
Redirects (3xx without a body) are exempt, and so is a reply returned by
`onError` or a `derive`.

**Fix:** declare the status in `response`:

```ts
app.post('/users', { response: { 201: User, 409: Conflict } }, handler);
```

### `TypeError: … the handler returned no reply. Return ctx.reply(status, body).`

**When:** a handler returns something that is not a `Reply`: a plain value,
a `Response`, or nothing at all (a missing `return`). TypeScript refuses
it, so this comes from JavaScript or a cast.

**Fix:**

```ts
app.get('/users', async ({ reply }) => {
	const users = await listUsers();
	return reply(200, users);
});
```

### `TypeError: An event does not match its schema`

```text
TypeError: An event does not match its schema: n: Invalid input: expected number, received string
```

**When:** a value yielded by an `eventStream` reply is refused by the
event's schema. The response has already started with a 200, so the stream
is cut, and the client reads an error mid-stream instead of a 500.

**Fix:** yield values the event's schema accepts, mapping them inside the
generator ([Server-sent events](../README.md#server-sent-events)):

```ts
reply(200, (async function* () {
	for await (const row of rows) yield { n: Number(row.n) };
})());
```

## WebSockets

### `{"error":"validation", … "code":"invalid_json","message":"The message is not valid JSON"}`

**When:** a socket route with a `message` schema receives a message that is
not JSON. A message that parses but that the schema refuses is answered the
same way, with the schema's issues and `"target":"message"`.

**Why:** with a `message` schema, each text message is parsed as JSON, then
checked. The refusal is sent back on the socket, and the socket stays open.

**Fix:** send JSON:

```ts
socket.send(JSON.stringify({ text: 'hello' }));
```

### Close code `1011`, `internal error`

**When:** a socket handler (`open`, `message`, `close`, `drain`) throws,
including when an awaited `socket.send` / `socket.publish` is given a
message that the `send` schema refuses. The server log shows the error, for
the latter
`ResponseValidationError: WS /…: the 101 reply does not match its schema`.
Outside a handler, from a timer for instance, that refusal is a rejected
promise of yours, and the socket stays open.

**Fix:** send what the `send` schema accepts, and catch errors you expect
inside the handler:

```ts
app.ws('/rooms/:room', { message: Chat, send: Chat }, {
	message: (socket, chat) => socket.publish(socket.data.params.room, chat),
});
```
