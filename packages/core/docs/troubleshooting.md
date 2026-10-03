# Troubleshooting

Each entry is headed by the text you see: a TypeScript error, an exception
thrown when the app is built, a response body, or a line in the server log;
a trap that prints nothing is headed by its symptom.

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
- [`the plugin's … reads its context as any: annotate what it reads, or leave it unannotated`](#the-plugins--reads-its-context-as-any-annotate-what-it-reads-or-leave-it-unannotated)
- [`… is not assignable to type 'ProvidedBy<C, …>'`](#-is-not-assignable-to-type-providedbyc-)
- [`route() needs one method: declare the operation as const`](#route-needs-one-method-declare-the-operation-as-const)
- [`Type 'Reply<500, …>' is not assignable to type 'MaybePromise<void | Reply<ClientErrorStatus, any> | undefined>'`](#type-reply500--is-not-assignable-to-type-maybepromisevoid--replyclienterrorstatus-any--undefined)
- [`'500' does not exist in type 'RefusalResponses'`](#500-does-not-exist-in-type-refusalresponses)
- [`The inferred type of '…' cannot be named without a reference to '…' from '…/@alxia/core/dist/…'`](#the-inferred-type-of--cannot-be-named-without-a-reference-to--from-alxiacoredist)
- [`Argument of type '"validation" | "body_limit"' is not assignable to parameter of type 'never'`](#argument-of-type-validation--body_limit-is-not-assignable-to-parameter-of-type-never)
- [`Property 'part' does not exist on type 'Refusal'`](#property-part-does-not-exist-on-type-refusal)

**Building the app**

- [`The route path "…" must start with "/"`](#the-route-path--must-start-with-)
- [`The prefix "…" must start with "/" and not end with one`](#the-prefix--must-start-with--and-not-end-with-one)
- [`"…": "*" may only end a path`](#--may-only-end-a-path)
- [`"…": ":…" is not a parameter name`](#--is-not-a-parameter-name)
- [`"…": ":" may only start a segment, as a parameter`](#--may-only-start-a-segment-as-a-parameter)
- [`"…": "*" may only be a whole segment, as a wildcard`](#--may-only-be-a-whole-segment-as-a-wildcard)
- [`"…": "…" is a dot segment, which a request's URL never keeps`](#--is-a-dot-segment-which-a-requests-url-never-keeps)
- [`"…" is not encoded as a request's URL carries it: declare "…"`](#-is-not-encoded-as-a-requests-url-carries-it-declare-)
- [`"…" declares ":…" twice`](#-declares--twice)
- [`"…" has the shape of "…" with other parameter names`](#-has-the-shape-of--with-other-parameter-names)
- [`GET /… is declared twice`](#get--is-declared-twice)
- [`GET /…: the handler is missing`](#get--the-handler-is-missing)
- [`group(): build is missing`](#group-build-is-missing)
- [`onRefusal(): the hook is missing`](#onrefusal-the-hook-is-missing)
- [`onRefusal(): "…" is no kind of refusal; expected 'validation' or 'body_limit'`](#onrefusal--is-no-kind-of-refusal-expected-validation-or-body_limit)
- [`page(): /… is already served`](#page--is-already-served)
- [`GET /… is already served by a page`](#get--is-already-served-by-a-page)

**Responses**

- [`400 {"error":"validation","issues":[…]}`](#400-errorvalidationissues)
- [A route still answers `{"error":"validation"}` after `onRefusal`](#a-route-still-answers-errorvalidation-after-onrefusal)
- [`404 {"error":"not_found"}`](#404-errornot_found)
- [`405 {"error":"method_not_allowed"}`](#405-errormethod_not_allowed)
- [`426 {"error":"upgrade_required"}`](#426-errorupgrade_required)
- [`416 {"error":"range_not_satisfiable"}`](#416-errorrange_not_satisfiable)
- [`500 {"error":"internal"}`](#500-errorinternal)

**Hooks**

- [`set.cookies.get()` returns null in a hook](#setcookiesget-returns-null-in-a-hook)

**Routing**

- [A route other than the one declared first answers](#a-route-other-than-the-one-declared-first-answers)

**Server log**

- [`ResponseValidationError: … the 200 reply does not match its schema`](#responsevalidationerror--the-200-reply-does-not-match-its-schema)
- [`ResponseValidationError: … declares no 201 reply`](#responsevalidationerror--declares-no-201-reply)
- [`TypeError: … the handler returned no reply. Return ctx.reply(status, body).`](#typeerror--the-handler-returned-no-reply-return-ctxreplystatus-body)
- [`TypeError: … the onRefusal hook returned neither a reply nor nothing.`](#typeerror--the-onrefusal-hook-returned-neither-a-reply-nor-nothing)
- [`TypeError: An event does not match its schema`](#typeerror-an-event-does-not-match-its-schema)
- [`TypeError: An event id must not hold a line break or a NUL`](#typeerror-an-event-id-must-not-hold-a-line-break-or-a-nul), and `An event id must be a string`
- [`TypeError: An event retry must be a whole number of milliseconds, 0 or more`](#typeerror-an-event-retry-must-be-a-whole-number-of-milliseconds-0-or-more)
- [`TypeError: The event "…" is not declared: …`](#typeerror-the-event--is-not-declared-), and `An event of a named stream is an object { event, data }`
- [`TypeError: An event name must not hold a line break or a NUL`](#typeerror-an-event-name-must-not-hold-a-line-break-or-a-nul), and `An event name must not be empty`, `A named event stream declares at least one event`, `The event "…" is not a Standard Schema`
- [`Type 'string' is not assignable to type '"ping"'` on a named stream](#type-string-is-not-assignable-to-type-ping-on-a-named-stream)

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
`"quey" is not a part of a route: params, query, headers, cookies, body, response, bodyLimit or detail`.
A variable with no known key at all gives
`TS2559: Type '{ quey: … }' has no properties in common with type 'RouteSchema'`.

**Why:** a misspelt part would never be validated, and the handler would
read the raw value.

**Fix:** use one of `params`, `query`, `headers`, `cookies`, `body`,
`response`, `bodyLimit` or `detail`:

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

### `the plugin's … reads its context as any: annotate what it reads, or leave it unannotated`

**When:** an app uses a plugin whose requirement is inferred from a
callback (with `RequiresOf`), and that callback's parameter is annotated
`any`, or `Record<string, any>`. `@alxia/language`'s `resolve` and
`@alxia/janus`'s `load`, `subject` and `ctx` are such callbacks; the
message names the one at fault.

```ts
const audit = <Ctx extends object = BaseContext>(who: (ctx: BaseContext & Ctx) => string) =>
	definePlugin<RequiresOf<Ctx, 'who'>>()((app) => app /* … */);

alxia().use(audit((ctx: any) => ctx.user.id));
```

```text
error TS2769: No overload matches this call.
  …
        Types of property ''~requires'' are incompatible.
          Type '{ readonly '~any': "the plugin's who reads its context as any: annotate what it reads, or leave it unannotated"; }' is not assignable to type '"the plugin's who reads its context as any: annotate what it reads, or leave it unannotated"'.
```

Every app is refused, whatever its context gives.

**Why:** a parameter annotated `any` reads any key, of any type, and says
nothing of what it reads. The plugin would require nothing, so `use` would
accept it on an app without the `user` the callback reads, and the request
would throw at runtime. A requirement that turns the check off without a
word is refused instead.

**Fix:** annotate what the callback reads. The app must then give it before
the plugin:

```ts
alxia().use(auth).use(audit(({ user }: BaseContext & { user: User }) => user.id));
```

Or leave the parameter unannotated, if it reads only the request. It is
then typed `BaseContext` and requires nothing:

```ts
alxia().use(audit((ctx) => ctx.ip ?? 'unknown'));
```

A parameter annotated `unknown` or `object` requires nothing, and is not
refused: it reads no key without a check or a cast of its own. A key
annotated `any`, as in `{ user: any }`, is still a key the plugin reads:
an app must give some `user`.

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

### `route() needs the path as a literal: declare the operation as const`

The same mistake as the entry below: with the path widened, the method
widened or not, this is the only message. The fix is below.

### `route() needs one method: declare the operation as const`

**When:** the operation given to `app.route` has a method or a path that is
not a literal:

- it is declared in a variable of its own, without `as const`;
- it is typed `RouteOperation`;
- or its method is a union, `'GET' | 'POST'`.

```text
error TS2345: Argument of type '{ method: string; path: string; }' is not assignable to parameter of type '{ readonly path: "route() needs the path as a literal: declare the operation as const"; }'.
```

With a literal path and a union method, it reads:

```text
error TS2345: Argument of type '{ readonly method: "GET" | "POST"; readonly path: "/w"; }' is not assignable to parameter of type 'never'.
  The intersection '… & { readonly method: "route() needs one method: declare the operation as const"; readonly schema?: unknown; }' was reduced to 'never' …
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

### `Argument of type '"…"' is not assignable to parameter of type '"Invalid path: …"'`

```text
error TS2345: Argument of type '"/at/10:30"' is not assignable to parameter of type '"Invalid path: \"/at/10:30\": \":\" may only start a segment, as a parameter"'.
```

**When:** a route, socket, page, file or static path written as a literal,
or the literal path of an operation given to `route()`, is one the app
would refuse when the route is declared. After `Invalid path:` comes the
`TypeError` it would throw, so the entries under
[Building the app](#building-the-app) give the fix:

| Path | After `Invalid path:` |
| --- | --- |
| `'/a/*/b'` | `"/a/*/b": "*" may only end a path` |
| `'/a/:pet-id'` | `"/a/:pet-id": ":pet-id" is not a parameter name` |
| `'/a/:id/:id'` | `"/a/:id/:id" declares ":id" twice` |
| `'/at/10:30'` | `"/at/10:30": ":" may only start a segment, as a parameter` |
| `'/*.js'` | `"/*.js": "*" may only be a whole segment, as a wildcard` |
| `'/a/./b'` | `"/a/./b": "." is a dot segment, which a request's URL never keeps` |
| `static('/assets/*', …)` | `"/assets/*/*": "*" may only end a path`: `static` adds the `/*` |

For `route()` the message is on the operation's `path`:

```text
error TS2322: Type '"/at/10:30"' is not assignable to type '"Invalid path: \"/at/10:30\": \":\" may only start a segment, as a parameter"'.
```

Under a prefix, the joined path is checked. When the path is fine on its
own but not under the prefix — `/:id` in a group at `/users/:id` — the
message names the path alone:

```text
error TS2345: Argument of type '"/:id"' is not assignable to parameter of type '"Invalid path: \"/:id\" is refused under its prefix: the two declare one parameter twice, or the prefix holds a refused segment"'.
```

A handler's parameters can then read as `any` on the same call
(`TS7031`): that goes away with the path's fix.

A plugin given to `use` is not checked under the prefix `use` puts its
routes at: `alxia({ prefix: '/users/:id' }).use(alxia().get('/:id', …))`
compiles, then throws `"/users/:id/:id" declares ":id" twice` at startup.

**Why:** the app throws on these paths at startup; the types refuse them
first, so the mistake shows in the editor. A literal the URL
percent-encodes, such as `/café`, is still left to the `TypeError`, as is
a path typed `string` or `` `/${string}` ``.

**Fix:** the fix of the `TypeError` after `Invalid path:`, such as a
parameter for the varying part:

```ts
app.get('/at/:time', ({ params, reply }) => reply(200, params.time)); // GET /at/10:30 → "10:30"
```

A function that takes a path generic in `P` and declares a route at it
cannot have it checked until `P` is known, so the call refuses it:

```text
error TS2345: Argument of type 'P' is not assignable to parameter of type 'PathAt<"", P, StaticPath<P>>'.
  Type '`/${string}`' is not assignable to type 'PathAt<"", P, StaticPath<P>>'.
```

(`PathAt<"", P, P>` for `get`, `ws` and the others.) Type the wrapper's
parameter with the check of the method it forwards to: `PathAt<Prefix, P>`,
and `PathAt<Prefix, P, StaticPath<P>>` for `static`. The path is then
checked where the wrapper is called, and the route keeps its literal path:

```ts
import { alxia, type PathAt, type RoutePath, type StaticPath } from '@alxia/core';

export function routedAt<const P extends RoutePath>(path: PathAt<'', P>) {
	return alxia().get(path, ({ reply }) => reply(200, 'x'));
}
export function servedAt<const P extends RoutePath>(path: PathAt<'', P, StaticPath<P>>) {
	return alxia().static(path, './public');
}

routedAt('/pets/:id'); // routes '/pets/:id'
routedAt('/at/10:30'); // does not compile: Invalid path: …
```

### `Type 'Reply<500, …>' is not assignable to type 'MaybePromise<void | Reply<ClientErrorStatus, any> | undefined>'`

**When:** an `onRefusal` hook returns a reply whose status is not a client
error, such as a 500 or a 200.

```text
error TS2322: Type 'Reply<500, { readonly status: 500; }>' is not assignable to type 'MaybePromise<void | Reply<ClientErrorStatus, any> | undefined>'.
```

**Why:** a refused request is the client's error. A 5xx would tell a client
to retry a request that will be refused again, and a 2xx would say it
succeeded.

**Fix:** answer with a 4xx, such as 400 or 422:

```ts
app.onRefusal((refusal) => problem({ status: 422, detail: `the request is refused: ${refusal.kind}` }));
```

### `Argument of type '"validation" | "body_limit"' is not assignable to parameter of type 'never'`

**When:** `onRefusal` is given a kind typed as a union, `RefusalKind`, or
as a generic parameter, as a plugin's helper may:

```text
error TS2769: No overload matches this call.
  …
    Argument of type '"validation" | "body_limit"' is not assignable to parameter of type 'never'.
```

For a generic `K extends RefusalKind`, the line reads
`Argument of type 'K' is not assignable to parameter of type 'K & OneKind<K>'`.

**Why:** the hook is registered for the one string it is given, so the
types could not say which kind's replies it answers.

**Fix:** write the kind out, or one call per kind:

```ts
app
	.onRefusal('validation', (refusal) => problem({ status: 422, detail: refusal.part }))
	.onRefusal('body_limit', (refusal) => problem({ status: 413, limit: refusal.limit }));
```

### `Property 'part' does not exist on type 'Refusal'`

**When:** an `onRefusal` hook reads `part` or `issues` without checking
the refusal's `kind`, often by destructuring it:

```text
error TS2339: Property 'part' does not exist on type 'Refusal'.
  Property 'part' does not exist on type 'BodyLimitRefusal'.
```

**Why:** a hook answers every kind of refusal. A `body_limit` refusal, a
body past the route's `bodyLimit`, has a `limit` and no `part` or
`issues`.

**Fix:** check `kind` first. Return nothing for a kind you leave to its
default:

```ts
app.onRefusal((refusal) =>
	refusal.kind === 'validation' ? problem({ status: 400, detail: `the ${refusal.part} is invalid` }) : undefined,
);
```

Or give the kind first: that hook answers it alone and reads it narrowed.

```ts
app.onRefusal('validation', (refusal) => problem({ status: 400, detail: `the ${refusal.part} is invalid` }));
```

### `'500' does not exist in type 'RefusalResponses'`

**When:** the schemas given to `onRefusal` declare a status that is not a
client error. `onRefusal` has several forms, so TypeScript reports it
under the call, as no overload matching, with this line among each form's:

```text
error TS2769: No overload matches this call.
  Overload 1 of 4, '(schema: RefusalSchema<RefusalResponses>, hook: …)', gave the following error.
    Object literal may only specify known properties, and '500' does not exist in type 'RefusalResponses'.
```

**Fix:** declare the 4xx the hook answers:

```ts
app.onRefusal({ response: { 400: Problem } }, (_, { reply }) =>
	reply(400, { type: 'urn:example:invalid', status: 400, detail: 'invalid' }),
);
```

### `The inferred type of '…' cannot be named without a reference to '…' from '…/@alxia/core/dist/…'`

**When:** `tsc` with `declaration: true` (a library, or a project with
`composite`), on an exported function or constant whose type is an app
inferred from its builders: TS2883, *"This is likely not portable. A type
annotation is necessary."*

**Why:** the declaration of that export must name every type the app's
type is made of, through `@alxia/core` itself. Before 0.2.1,
`RefusalsOf`, `RefusalOutcome` and `DeclaredRefusal` were not exported, so
an app with an `onRefusal` hook could not be named.

**Fix:** upgrade to `@alxia/core` 0.2.1 or later. A type core still fails
to export is a bug: report it with the code. Until then, annotate the
export or the hook's return type, e.g. `Reply<400 | 413, ProblemDetails>`, with `Reply` and `ProblemDetails` from `@alxia/core`.

## Building the app

These are `TypeError`s thrown when a route is declared, so the app fails at
startup, not on a request. Six of them — `"*" may only end a path`, `is
not a parameter name`, `":" may only start a segment`, `"*" may only be a
whole segment`, `is a dot segment` and `declares ":…" twice` — are refused
by the type first when the path is a literal, with the same message after
`Invalid path:`
([the compile error](#argument-of-type--is-not-assignable-to-parameter-of-type-invalid-path-)). The eight about a path's syntax are also thrown
by `shapeOf(path)`, and so by a tool that calls it: `@alxia/openapi-routes`'
`implemented` and `matchesSpec` throw them for an operation path no route may
be declared at, after their own name (`implemented(): …`; `exactly(): …` from the
deprecated `exactly`).

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

### `"…": ":" may only start a segment, as a parameter`

```text
"/at/10:30": ":" may only start a segment, as a parameter
```

**When:** a route, socket or page path's literal segment holds a `:`
anywhere but at its start:
`/at/10:30`, `/ns/a:b`, `/x:`.

**Why:** `Bun.serve`'s router reads a `:` anywhere in a segment as the start
of a parameter. Given `/at/10:30` it throws at `listen`
(`Route parameter names cannot start with a number`); given `/at/x:y` it
takes `y` for a parameter, where `fetch` would take the segment as a
literal. Refusing the path when it is declared keeps the two from routing
apart.

**Fix:** make the varying part a parameter, a whole `:name` segment, and
read it from `params`; a request for `/at/10:30` reaches it:

```ts
app.get('/at/:time', ({ params, reply }) => reply(200, params.time)); // "10:30"
```

Or spell the literal without a colon: `/at/10h30`.

### `"…": "*" may only be a whole segment, as a wildcard`

```text
"/*.js": "*" may only be a whole segment, as a wildcard
```

**When:** a segment of a route, socket or page path holds a `*` beside
something else: `/*.js`, `/v*`,
`/a*b`.

**Why:** `Bun.serve`'s router takes a segment that starts with `*` for a
wildcard — `/*.js` matches every path, `.js` or not — while `fetch` would
take it as a literal. A `*` is only ever a whole last segment.

**Fix:** take the rest of the path with a wildcard, and test what it holds
in the handler:

```ts
// GET /assets/app.js → "app.js"; check the extension here.
app.get('/assets/*', ({ params, reply }) => reply(200, params['*']));
```

### `"…": "…" is a dot segment, which a request's URL never keeps`

```text
"/a/./b": "." is a dot segment, which a request's URL never keeps
```

**When:** a segment of a route, socket or page path is `.` or `..`, or one
of their encodings, `%2e` and
`%2E%2E` among them: `/a/./b`, `/a/..`.

**Why:** a URL resolves its dot segments away, so a request's pathname
never holds one: `fetch` would never reach the route, and `Bun.serve`,
which compares the request's target as it was sent, only for a client that
sends `/a/./b` unresolved.

**Fix:** declare the path the URL resolves it to: `/a/b` for `/a/./b`. A
segment that merely contains dots, such as `/.well-known` or `/a..b`, is
not one.

### `"…" is not encoded as a request's URL carries it: declare "…"`

```text
"/café" is not encoded as a request's URL carries it: declare "/caf%C3%A9"
```

**When:** a literal segment of a route, socket or page path holds what a
URL percent-encodes: non-ASCII
(`é`), a space, a control character, `"`, `<`, `>`, `` ` ``, `{`, `}`, `^`,
or a `?`, `#` or `\` that the URL would cut or read as a `/`.

**Why:** `Bun.serve` throws at `listen` for a non-ASCII path
(`Please encode all non-ASCII characters in the path`), and matches every
other one against the request's target as sent, where `fetch` reads the
URL's pathname, which carries `/café` as `/caf%C3%A9`. Declared in that
form, the path matches the same requests in both.

**Fix:** declare the path the message gives. A client encodes the request
as its URL does, so a request for `/café` still reaches it:

```ts
app.get('/caf%C3%A9', ({ reply }) => reply(200, 'café'));
await app.request('/café'); // 200
```

An escape is compared as written, case and all: `/caf%c3%a9` is another
path, which a request for `/café` does not reach.

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

### `POST /…: bodyLimit must be a whole number of bytes, 0 or more; got …`

**When:** a route's `bodyLimit` is negative, fractional, `NaN` or
`Infinity`. `bodyLimit()` throws the same message, prefixed
`bodyLimit():`.

**Fix:** give a byte count, or leave `bodyLimit` out for no limit beyond
the server's:

```ts
app.post('/upload', { bodyLimit: 25 * 1024 * 1024 }, handler);
```

### `group(): build is missing`

**When:** `group('/admin')` is called without its function.

**Fix:**

```ts
app.group('/admin', (admin) => admin.derive(requireAdmin).get('/stats', stats));
```

### `onRefusal(): the hook is missing`

**When:** `onRefusal` is given its schemas but no hook, or a kind with no
hook — `onRefusal('validation')`, `onRefusal('validation', schema)`. The
types refuse that, so this comes from JavaScript or a cast.

**Fix:** pass the hook last:

```ts
app.onRefusal({ response: { 400: Problem } }, (_, { reply }) =>
	reply(400, { type: 'urn:example:invalid', status: 400, detail: 'invalid' }),
);
app.onRefusal('validation', { response: { 400: Problem } }, (refusal, { reply }) =>
	reply(400, { type: 'urn:example:invalid', status: 400, detail: refusal.part }),
);
```

### `onRefusal(): "…" is no kind of refusal; expected 'validation' or 'body_limit'`

**When:** `onRefusal` is given a string that is not a kind of refusal, a
typo such as `'body-limit'`. The types refuse that too, so this comes from
JavaScript or a cast.

**Fix:** give one of the two kinds, with an underscore in `body_limit`:

```ts
app.onRefusal('body_limit', (refusal) => problem({ status: 413, limit: refusal.limit }));
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
`ValidationErrorBody`, `ContentTooLargeBody`, `RoutingErrorBody`,
`FileNotFoundBody`, `RangeNotSatisfiableBody` and `InternalErrorBody`.

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

To answer it in another format, such as an RFC 9457 problem, declare
[`onRefusal`](guide/hooks.md#onrefusal) before the routes.

### A route still answers `{"error":"validation"}` after `onRefusal`

**When:** an app declares `onRefusal`, and a refused request to one of its
routes still gets the default 400.

**Why**, by what you find:

- The route is declared **before** the hook. A route hook applies to the
  routes declared after it, never before: move the hook up the chain.
- The hook is declared inside a `group`. A group's hooks stay inside it:
  declare the hook on the app, before the group.
- The hook returned nothing, `undefined`, for this refusal. Nothing means
  the default: return a reply for every refusal you want answered.
- The hook is a hook of the other kind, `onRefusal('body_limit', …)`. It
  answers that kind alone: declare one for `'validation'`, or a general
  `onRefusal(hook)`.
- A general `onRefusal(hook)` declared after `onRefusal('validation', …)`
  replaces it: declare the hook of the kind last.

**Fix:** declare the hook first, and return a reply:

```ts
const app = alxia()
	.onRefusal((refusal) =>
		refusal.kind === 'validation' ? problem({ status: 400, detail: `the ${refusal.part} is invalid` }) : undefined,
	)
	.post('/users', { body: NewUser }, handler);
```

A body past the route's `bodyLimit` still gets the default
`413 {"error":"content_too_large","limit":…}` from that hook, which returns nothing
for a `body_limit`. Return a reply for it too to answer it in your format
([`413`](#413-errorcontent_too_largelimit)).

### `413 {"error":"content_too_large","limit":…}`

**When:** a request's body is larger than its route's `bodyLimit`: the
route's own, or the one a `bodyLimit(bytes)` before it set. Either its
`Content-Length` says so, and the body is not read, or the bytes counted as
it was read passed the limit:

```json
{ "error": "content_too_large", "limit": 65536 }
```

**Why:** `limit` is the route's limit, in bytes. The count covers every
reader of the body: the JSON, form and text parsers, a `parser` of the
app's, and a handler reading `ctx.request.body`. A body of exactly `limit`
bytes is accepted.

**Fix:** send a smaller body, or raise the limit for that route alone. A
route's own `bodyLimit` wins over the default:

```ts
app
	.bodyLimit(64 * 1024)
	.post('/attachments', { bodyLimit: 25 * 1024 * 1024 }, async ({ request, reply }) => {
		await Bun.write('attachment.bin', new Response(request.body));
		return reply(204);
	});
```

To answer in another format, such as an RFC 9457 problem, return it from
an [`onRefusal`](guide/hooks.md#onrefusal) hook declared before the route,
for the refusal of kind `body_limit`. The `onError` hooks never see it:

```ts
import { problem } from '@alxia/core';

app
	.onRefusal((refusal) =>
		refusal.kind === 'body_limit'
			? problem({ type: 'urn:ietf:params:jmap:error:limit', status: 413, limit: 'maxSizeRequest' })
			: undefined,
	)
	.post('/api', { body: z.unknown(), bodyLimit: 10_000_000 }, handler);
```

A 413 with no JSON body comes from Bun itself. The body passed `listen`'s
`maxRequestBodySize`, which applies to every route, before any route's
`bodyLimit`.

### `404 {"error":"not_found"}`

**When:** a request matches no route, or a `static` or `file` route finds
no file.

**Why**, most often:

- The path lacks the app's or the group's prefix: with
  `alxia({ prefix: '/api' })`, the route is `/api/users`.
- The path is a `page(…)`, or a page's path ranks before the route's
  ([Which route answers](guide/routes.md#which-route-answers)): with
  `page('/', index)` and a `/*` route, `GET /` is the page. Pages are
  served by `Bun.serve` itself, so `app.fetch` and `app.request` answer 404
  for them. Only `listen` serves them.
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

**Why**, when another route takes that method: the path is chosen before
the method, as `Bun.serve` chooses it. With `GET /users/:id` and
`POST /users/me`, `GET /users/me` reaches `/users/me`, which has no `GET`.

**Fix:** call it with a method in `Allow`, or declare the route for the
method you call at the path that answers. `HEAD` is answered by the `GET`
route.

### `426 {"error":"upgrade_required"}`

**When:** a request reaches a `ws` route without a WebSocket upgrade, or
through `app.fetch` / `app.request`, which have no server to upgrade with.

**Why:** a socket needs `Bun.serve`'s upgrade.

**Fix:** serve the app with `listen`, or with `Bun.serve` given `fetch`
and `websocket`, and connect with a WebSocket
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

A request that fails because its client hung up (its `request.signal`
aborted, and the error is the `AbortError` a body read then throws) is
not an error of the app: nothing is printed, no `onError` hook runs, and
an `onResponse` hook, a logger's, sees a `499` with no body. Any other
error is printed and answered 500, a bug thrown after the client left
included. A handler that ignores the abort and replies gets its own
status.

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

### A plugin's route reads a body past the app's `bodyLimit()`

**When:** an app calls `bodyLimit(bytes)` and then `use(plugin)` with an
app plugin, and a route of that plugin accepts a larger body.

**Why:** an app's `bodyLimit()` reaches the routes declared on it and in
its groups, never a plugin's. A plugin's route keeps the limit it was
declared with, and its type with it. A plugin route with no `onRefusal` of
its own is still answered by the app's hook. A function plugin that declares its routes on the app is
bounded like any of them.

**Fix:** give the plugin's route a `bodyLimit` of its own:

```ts
const uploads = alxia().post('/upload', { bodyLimit: 25 * 1024 * 1024 }, handler);
const app = alxia().bodyLimit(64 * 1024).use(uploads);
```

A `bodyLimit()` the plugin calls instead also applies to the app's routes
declared after `use`, as its hooks do. Call the app's own after `use` to
keep it.

## Hooks

A trap that prints nothing: a hook reads a value that is never there.

### `set.cookies.get()` returns null in a hook

**When:** a `derive`, `wrap`, `onError`, `onRefusal` or guard reads a
cookie the request sent through `set.cookies` — a session id — and always
gets `null`, so every request looks signed out:

```ts
.derive(({ set }) => ({ user: sessions.get(set.cookies.get('sid') ?? '') })) // always null
```

**Why:** `set.cookies` is the **response's** cookie map. It starts empty,
and `get` reads back only what this response set with `set.cookies.set`;
it never holds the `Cookie` header the request sent.

**Fix:** read the request's cookies from `ctx.cookies`, which every hook
has:

```ts
.derive(({ cookies }) => ({ user: sessions.get(cookies['sid'] ?? '') }))
```

A route's `cookies` schema validates them for its handler; a hook reads
them as they arrived ([Hooks](guide/hooks.md#reading-the-requests-cookies)).

## Routing

A trap that prints nothing: the answer comes from another route than the
one you expected.

### A route other than the one declared first answers

**When:** two routes match a request, and the one that answers is not the
one declared first: `/api/*` answers `GET /api/users` although `/*` was
declared before it, or, with `/a` and `/a/*` declared, `GET /a/` reaches
`/a/*`.

**Why:** `app.fetch`, `app.request` and `listen` all rank the matching
paths as `Bun.serve`'s router does: segment by segment, a literal before a
parameter before a wildcard, with a trailing slash as a segment of its own.
The order of declaration plays no part
([Which route answers](guide/routes.md#which-route-answers)).

**Fix:** make the path you mean to answer the more specific one, rather
than declaring it first:

```ts
app
	.get('/*', ({ reply }) => reply(200, 'page'))
	.get('/api/*', ({ reply }) => reply(200, 'api')); // answers /api/…, declared last
```

## Server log

Each of these is printed by `console.error`, and the request is answered
`500 {"error":"internal"}`. A client that hung up mid-request prints
nothing: see [`500 {"error":"internal"}`](#500-errorinternal).

### `ResponseValidationError: … the 200 reply does not match its schema`

```text
ResponseValidationError: GET /r: the 200 reply does not match its schema: n: Invalid input: expected number, received string
```

**When:** a handler replies with a body that the status's schema refuses
at runtime. Data from a database, `JSON.parse` or `any` gets past the types.

**Why:** what leaves the server is the schema's output. A body the schema
refuses is never sent, so the client never reads an undeclared shape.

An `onRefusal` hook given schemas is checked the same way: the message
names the route that was refused and the status the hook replied with.

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
`onError` or a `derive`. An `onRefusal` hook given schemas that replies
with a status they do not declare fails the same way, naming the refused
route: declare the status in the hook's `response`.

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

### `TypeError: … the onRefusal hook returned neither a reply nor nothing.`

**When:** an `onRefusal` hook returns something that is neither a `Reply`
nor `undefined`, such as a plain object or a `Response`. TypeScript
refuses it, so this comes from JavaScript or a cast.

**Fix:** return `reply(…)` or `problem(…)`, or nothing for the default:

```ts
app.onRefusal((refusal) =>
	refusal.kind === 'validation' && refusal.part === 'body' ? problem({ status: 400, detail: 'bad body' }) : undefined,
);
```

### `TypeError: An event does not match its schema`

```text
TypeError: An event does not match its schema: n: Invalid input: expected number, received string
```

**When:** a value yielded by an `eventStream` reply is refused by the
event's schema. On a named stream, the path starts with the event's name:
`ping.interval: …`. The response has already started with a 200, so the stream
is cut, and the client reads an error mid-stream instead of a 500.

**Fix:** yield values the event's schema accepts, mapping them inside the
generator ([Server-sent events](../README.md#server-sent-events)):

```ts
reply(200, (async function* () {
	for await (const row of rows) yield { n: Number(row.n) };
})());
```

### `TypeError: An event id must not hold a line break or a NUL`

```text
TypeError: An event id must not hold a line break or a NUL: "1\ndata: forged"
```

**When:** an event yielded on a named `eventStream({ … })` has an `id`
holding a CR, an LF or a NUL (`An event id must be a string` when it is
not a string at all). Its type is `string`, so this comes from data
that reached the id unchecked: a client's input, a database row.

**Why:** a line break would end the `id:` line and start a field the
handler never yielded, and an `EventSource` ignores an id holding a NUL. The
stream ends before the event is written; the events already sent stay sent.

**Fix:** make the id from something without line breaks — a counter, a
state string you issue — or encode it:

```ts
yield Push.event('state', change, { id: encodeURIComponent(state) });
```

### `TypeError: An event retry must be a whole number of milliseconds, 0 or more`

**When:** an event's `retry` is a fraction, negative, `NaN` or not a number.

**Why:** an `EventSource` reads `retry:` as ASCII digits only, and ignores
anything else; the stream ends rather than send a field no client reads.

**Fix:** round it:

```ts
yield Push.event('ping', { interval: 30 }, { retry: Math.round(seconds * 1000) });
```

### `TypeError: The event "…" is not declared: …`

**When:** a value yielded on a named stream has an `event` that is not one
of the names its `eventStream({ … })` declares. The types refuse it, so this
comes from a cast or from JavaScript. `TypeError: An event of a named stream
is an object { event, data }` is its sibling, for a value that has no
`event` at all.

**Fix:** declare the event, or yield one that is:

```ts
const Push = eventStream({ state: StateChange, ping: Ping });
yield Push.event('ping', { interval: 30 });
```

### `TypeError: An event name must not hold a line break or a NUL`

**When:** `eventStream({ … })` is given a name holding a CR, an LF or a
NUL, or an empty one (`An event name must not be empty`). It throws when the
app is built, as do `A named event stream declares at least one event` and
`The event "…" is not a Standard Schema`.

**Fix:** name each event with a single line, and give each a schema:

```ts
const Push = eventStream({ state: StateChange, ping: Ping });
```

### `Type 'string' is not assignable to type '"ping"'` on a named stream

**When:** a generator handed to `reply(200, …)` yields a plain
`{ event: 'ping', data }` object: TypeScript widens its `event` to `string`,
which no declared name is.

**Fix:** build the event with the stream's `event`, which keeps the name,
or annotate the generator:

```ts
yield Push.event('ping', { interval: 30 });
// or
async function* pings(): AsyncGenerator<EventInput<typeof Push>> {
	yield { event: 'ping', data: { interval: 30 } };
}
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
