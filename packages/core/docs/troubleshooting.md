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
- [`the plugin reads "…", which this app's context does not give: add the plugin or middleware that gives it first`](#the-plugin-reads--which-this-apps-context-does-not-give-add-the-plugin-or-middleware-that-gives-it-first)
- [`the plugin reads "…", which this app's context gives with another type`](#the-plugin-reads--which-this-apps-context-gives-with-another-type)
- [`this app's context does not give what the plugin reads`](#this-apps-context-does-not-give-what-the-plugin-reads)
- [`the plugin's … reads its context as any: annotate what it reads, or leave it unannotated`](#the-plugins--reads-its-context-as-any-annotate-what-it-reads-or-leave-it-unannotated)
- [`… is not assignable to type 'ProvidedBy<C, …>'`](#-is-not-assignable-to-type-providedbyc-)
- [`the hook reads "…", which this route's context does not give: derive it before this route, or earlier in its list`](#the-hook-reads--which-this-routes-context-does-not-give-derive-it-before-this-route-or-earlier-in-its-list)
- [`the hook reads "…", which this route's context gives with another type`](#the-hook-reads--which-this-routes-context-gives-with-another-type)
- [`the hook reads the path parameter "…", which this route's path does not declare`](#the-hook-reads-the-path-parameter--which-this-routes-path-does-not-declare)
- [`the hook reads the path parameter "…" as another type than the string it arrives as`](#the-hook-reads-the-path-parameter--as-another-type-than-the-string-it-arrives-as)
- [`the hook reads the query parameter "…" as another type than the string | readonly string[] it arrives as`](#the-hook-reads-the-query-parameter--as-another-type-than-the-string--readonly-string-it-arrives-as)
- [`the hook reads the cookie "…" as another type than the string it arrives as`](#the-hook-reads-the-cookie--as-another-type-than-the-string-it-arrives-as)
- [`the hook reads "body", which no hook reads: the body is validated after the hooks, so read it in the handler`](#the-hook-reads-body-which-no-hook-reads-the-body-is-validated-after-the-hooks-so-read-it-in-the-handler)
- [`this route's context does not give what the hook reads`](#this-routes-context-does-not-give-what-the-hook-reads)
- [`a route's hooks are a list written in the call, [first, second]: a list of unknown length cannot be checked`](#a-routes-hooks-are-a-list-written-in-the-call-first-second-a-list-of-unknown-length-cannot-be-checked)
- [`a route takes at most 8 hooks in its list: derive the rest in a group around it`](#a-route-takes-at-most-8-hooks-in-its-list-derive-the-rest-in-a-group-around-it)
- [`Type '…' is not assignable to type 'MaybePromise<unique symbol>'`](#type--is-not-assignable-to-type-maybepromiseunique-symbol), and `Type 'Promise<Next<…>>' is not assignable to type 'unique symbol'`
- [`Types of property 'body' are incompatible. Type 'undefined' is not assignable to type '…'`](#types-of-property-body-are-incompatible-type-undefined-is-not-assignable-to-type-), on `route(operation, …)`
- [`Property 'user' does not exist on type 'RouteBase<…>'`](#property-user-does-not-exist-on-type-routebase)
- [`Property 'user' is missing in type 'RouteBase<…>' but required in type '{ user: User; }'`](#property-user-is-missing-in-type-routebase-but-required-in-type--user-user-)
- [`Property 'id' is missing in type 'Readonly<Record<string, string>> & PathParams<"…">'`](#property-id-is-missing-in-type-readonlyrecordstring-string--pathparams)
- [`Type '…' is not assignable to type 'never'` in a route's options](#type--is-not-assignable-to-type-never-in-a-routes-options)
- [`Type 'Middleware<…>' has no properties in common with type 'OptionsOnly<RouteOptions>'`](#type-middleware-has-no-properties-in-common-with-type-optionsonlyrouteoptions), `Expected 2-11 arguments, but got 12` and, on `route()`, `Expected 2-10 arguments, but got 11`
- [`Type 'string' is not assignable to type 'MiddlewareReturn'`](#type-string-is-not-assignable-to-type-middlewarereturn)
- [`'response' does not exist in type 'RequestSchemas'`](#response-does-not-exist-in-type-requestschemas)
- [`route() needs the path as a literal: declare the operation as const`](#route-needs-the-path-as-a-literal-declare-the-operation-as-const)
- [`route() needs one method: declare the operation as const`](#route-needs-one-method-declare-the-operation-as-const)
- [`Argument of type '"…"' is not assignable to parameter of type '"Invalid path: …"'`](#argument-of-type--is-not-assignable-to-parameter-of-type-invalid-path-)
- [`… is not assignable to type '"Invalid middleware: a middleware given a path may add nothing to the context, …"'`](#-is-not-assignable-to-type-invalid-middleware-a-middleware-given-a-path-may-add-nothing-to-the-context-)
- [`Type 'Reply<500, …>' is not assignable to type 'MaybePromise<void | Reply<ClientErrorStatus, any> | undefined>'`](#type-reply500--is-not-assignable-to-type-maybepromisevoid--replyclienterrorstatus-any--undefined)
- [`'500' does not exist in type 'RefusalResponses'`](#500-does-not-exist-in-type-refusalresponses)
- [`The inferred type of '…' cannot be named without a reference to '…' from '…/@alxia/core/dist/…'`](#the-inferred-type-of--cannot-be-named-without-a-reference-to--from-alxiacoredist)
- [`Argument of type '"validation" | "body_limit"' is not assignable to parameter of type 'never'`](#argument-of-type-validation--body_limit-is-not-assignable-to-parameter-of-type-never)
- [`Property 'part' does not exist on type 'Refusal'`](#property-part-does-not-exist-on-type-refusal)
- [`Module '"@alxia/core"' has no exported member 'RoutesOf'`](#module-alxiacore-has-no-exported-member-routesof)
- [`Generic type 'Alxia<Ctx, Prefix, Shortcuts>' requires between 0 and 3 type arguments`](#generic-type-alxiactx-prefix-shortcuts-requires-between-0-and-3-type-arguments)
- [`'app' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer`](#app-implicitly-has-type-any-because-it-does-not-have-a-type-annotation-and-is-referenced-directly-or-indirectly-in-its-own-initializer), with `Register`
- [`Property '…' does not exist on type 'BaseContext & { readonly 'Register.context must be typeof base, …': never; }'`](#property--does-not-exist-on-type-basecontext---readonly-registercontext-must-be-typeof-base--never-)
- [`Subsequent property declarations must have the same type.  Property 'context' must be of type '…'`](#subsequent-property-declarations-must-have-the-same-type--property-context-must-be-of-type-)
- [`Property 'user' does not exist on type 'MiddlewareContext<Empty>'`](#property-user-does-not-exist-on-type-middlewarecontextempty), with `Register`

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
- [`GET /…: hook 1 of the list is not a hook: make it with defineHook() or defineWrap()`](#get--hook-1-of-the-list-is-not-a-hook-make-it-with-definehook-or-definewrap)
- [`defineHook(): the hook is not a function`](#definehook-the-hook-is-not-a-function)
- [`GET /…: middleware 1 is not a function: make it with defineMiddleware(), validate() or responds()`](#get--middleware-1-is-not-a-function-make-it-with-definemiddleware-validate-or-responds)
- [`GET /…: the options hold no schema: give validate(…) and responds(…) among the middlewares`](#get--the-options-hold-no-schema-give-validate-and-responds-among-the-middlewares)
- [``WS /…: responds() checks replies, and a socket route sends none: check its messages with the `send` option``](#ws--responds-checks-replies-and-a-socket-route-sends-none-check-its-messages-with-the-send-option)
- [`defineMiddleware(): the middleware is not a function`](#definemiddleware-the-middleware-is-not-a-function)
- [`validate(): the schemas are not an object`](#validate-the-schemas-are-not-an-object), and `responds(): …`
- [`GET /…: the handler is missing`](#get--the-handler-is-missing)
- [`POST /…: bodyLimit must be a whole number of bytes, 0 or more; got …`](#post--bodylimit-must-be-a-whole-number-of-bytes-0-or-more-got-)
- [`group(): build is missing`](#group-build-is-missing)
- [`use(): middleware 2 was not made by defineMiddleware()`](#use-middleware-2-was-not-made-by-definemiddleware), and `use(): middleware 1 is a validate() or responds(), which belongs to a route`
- [`use("…"): no middleware is given`](#use-no-middleware-is-given), and `use("/a/*/b"): "/a/*/b": "*" may only end a path`
- [`use("/admin/"): a path given to use() does not end with "/"`](#useadmin-a-path-given-to-use-does-not-end-with-)
- [`plugin(): a plugin is given alone, to app.plugin(); middlewares are made with defineMiddleware() and given to use()`](#plugin-a-plugin-is-given-alone-to-appplugin-middlewares-are-made-with-definemiddleware-and-given-to-use), `plugin(): nothing is given: …`, and the same of `use()`
- [`plugin(): the plugin is neither an app nor a function; a middleware is made with defineMiddleware() and given to use()`](#plugin-the-plugin-is-neither-an-app-nor-a-function-a-middleware-is-made-with-definemiddleware-and-given-to-use), and the same of `use()`
- [`plugin(): a middleware is given to use(), not taken for a plugin`](#plugin-a-middleware-is-given-to-use-not-taken-for-a-plugin)
- [`plugin(): the plugin function returned undefined, not an app: a plugin returns the app it is given; a middleware is made with defineMiddleware() and given to use()`](#plugin-the-plugin-function-returned-undefined-not-an-app-a-plugin-returns-the-app-it-is-given-a-middleware-is-made-with-definemiddleware-and-given-to-use), and `use(): the plugin function returned a promise, …` for a middleware written without `defineMiddleware`
- [`GET /…: a list of hooks and middlewares are two forms, never mixed: give the hooks as middlewares, made by defineMiddleware()`](#get--a-list-of-hooks-and-middlewares-are-two-forms-never-mixed-give-the-hooks-as-middlewares-made-by-definemiddleware)
- [`responds(): the operation GET /… declares no response`](#responds-the-operation-get--declares-no-response)
- [`onRefusal(): the hook is missing`](#onrefusal-the-hook-is-missing)
- [`onRefusal(): "…" is no kind of refusal; expected 'validation' or 'body_limit'`](#onrefusal--is-no-kind-of-refusal-expected-validation-or-body_limit)
- [`page(): /… is already served`](#page--is-already-served)
- [`GET /… is already served by a page`](#get--is-already-served-by-a-page)

**Responses**

- [`400 {"error":"validation","issues":[…]}`](#400-errorvalidationissues)
- [A route still answers `{"error":"validation"}` after `onRefusal`](#a-route-still-answers-errorvalidation-after-onrefusal)
- [`413 {"error":"content_too_large","limit":…}`](#413-errorcontent_too_largelimit)
- [`404 {"error":"not_found"}`](#404-errornot_found)
- [`405 {"error":"method_not_allowed"}`](#405-errormethod_not_allowed)
- [`426 {"error":"upgrade_required"}`](#426-errorupgrade_required)
- [`416 {"error":"range_not_satisfiable"}`](#416-errorrange_not_satisfiable)
- [`500 {"error":"internal"}`](#500-errorinternal)
- [A plugin's route reads a body past the app's `bodyLimit()`](#a-plugins-route-reads-a-body-past-the-apps-bodylimit)

**Middlewares**

- [`set.cookies.get()` returns null in a hook](#setcookiesget-returns-null-in-a-hook)
- [A `use(path)` guard did not run on a request under its path](#a-usepath-guard-did-not-run-on-a-request-under-its-path)
- [A path that does not exist answers `401`, not `404`](#a-path-that-does-not-exist-answers-401-not-404)
- [A middleware's `try`/`catch` never sees the error](#a-middlewares-trycatch-never-sees-the-error)
- [`Type 'string | undefined' is not assignable to type 'string'` on `ctx.route`](#type-string--undefined-is-not-assignable-to-type-string-on-ctxroute)
- [A `use()` did not run for a route](#a-use-did-not-run-for-a-route)

**Routing**

- [A route other than the one declared first answers](#a-route-other-than-the-one-declared-first-answers)

**Server log**

- [`ResponseValidationError: … the 200 reply does not match its schema`](#responsevalidationerror--the-200-reply-does-not-match-its-schema)
- [`ResponseValidationError: … declares no 201 reply`](#responsevalidationerror--declares-no-201-reply)
- [`TypeError: … a middleware (…) returned nothing: return next(), a reply or a Response`](#typeerror--a-middleware--returned-nothing-return-next-a-reply-or-a-response)
- [`TypeError: … a middleware called next() twice`](#typeerror--a-middleware-called-next-twice)
- [`TypeError: … a middleware called next() after it returned`](#typeerror--a-middleware-called-next-after-it-returned)
- [`GET /…: a middleware returned before the next() it called settled: the rest of the route ran anyway; await next(), or return it`](#get--a-middleware-returned-before-the-next-it-called-settled-the-rest-of-the-route-ran-anyway-await-next-or-return-it), a warning
- [`TypeError: validate() runs among a route's middlewares, not called on its own`](#typeerror-validate-runs-among-a-routes-middlewares-not-called-on-its-own), and `responds() …`
- [`TypeError: … the handler returned no reply. Return ctx.reply(status, body).`](#typeerror--the-handler-returned-no-reply-return-ctxreplystatus-body)
- [`TypeError: … the onRefusal hook returned neither a reply nor nothing.`](#typeerror--the-onrefusal-hook-returned-neither-a-reply-nor-nothing)
- [`TypeError: Body already used`](#typeerror-body-already-used), with `500 {"error":"internal"}`
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

**When:** the `params` schema of an operation given to `route()`, or of the
deprecated schema before the handler, expects something other than a
string for a path parameter, or requires a key the path does not have.
The same mistake in `validate({ params })` is reported as
[`Property 'id' is missing in type …`](#property-id-is-missing-in-type-readonlyrecordstring-string--pathparams).

```text
error TS2322: Type 'ZodObject<{ id: ZodNumber; }, $strip>' is not assignable to type 'ZodObject<{ id: ZodNumber; }, $strip> & "the params schema must accept the parameters of \"/users/:id\", which arrive as strings"'.
```

With `exactOptionalPropertyTypes` on, the same message comes as `TS2375`.

**Why:** a path parameter is always a string. `z.number()` refuses `"42"`,
so the route could never match a request.

**Fix:** coerce the string, with `zq` from `@alxia/zod` or with your
validator's own coercion:

```ts
import { validate } from '@alxia/core';
import { zq } from '@alxia/zod';

app.get('/users/:id', validate({ params: z.object({ id: zq.int() }) }), ({ params, reply }) =>
	reply(200, { id: params.id }), // params.id: number
);
app.route({ method: 'GET', path: '/users/:id', schema: { params: z.object({ id: zq.int() }) } }, handler);
```

### `the params schema reads "…", which "…" does not declare`

**When:** the `params` schema of an operation given to `route()`, or of the
deprecated schema before the handler, has an optional key the path does
not declare. In `validate({ params })` the same key is refused as
[`Property 'org' is missing in type …`](#property-id-is-missing-in-type-readonlyrecordstring-string--pathparams).

```text
error TS2322: Type 'ZodObject<{ id: ZodString; org: ZodOptional<ZodString>; }, $strip>' is not assignable to type 'ZodObject<{ id: ZodString; org: ZodOptional<ZodString>; }, $strip> & "the params schema reads \"org\", which \"/users/:id\" does not declare"'.
```

**Why:** `org` is not a parameter of `/users/:id`, so it would always be
`undefined`. A misspelt parameter name lands here too. The message names
each key the path does not declare; with several, TypeScript lists one
message per key.

**Fix:** name the keys the path declares, or add the parameter to the path:

```ts
app.get('/orgs/:org/users/:id', validate({ params: z.object({ org: z.string(), id: z.string() }) }), handler);
```

### `'quey' does not exist in type 'RouteSchema'`

**When:** the deprecated schema before the handler, after a list of
hooks, has a key that is not a part of a route. TypeScript prints it under
`No overload matches this call`:

```text
error TS2769: No overload matches this call.
  …
    Object literal may only specify known properties, but 'quey' does not exist in type 'RouteSchema & NotAFunction'. Did you mean to write 'query'?
```

Without a list, `get(path, { quey }, handler)`, only the last overload is
printed: `'quey' does not exist in type '(readonly [] | readonly AnyRouteHook[]) & …'`.
When the schema object is a variable, the message names the key instead:
`"quey" is not a part of a route: params, query, headers, cookies, body, response, bodyLimit or detail`.
In `validate`, the same key is
[`'quey' does not exist in type 'RequestSchemas'`](#response-does-not-exist-in-type-requestschemas).

**Why:** a misspelt part would never be validated, and the handler would
read the raw value.

**Fix:** give the parts to `validate`, the statuses to `responds`, and
`bodyLimit` and `detail` to the options:

```ts
import { responds, validate } from '@alxia/core';

app.get('/users', { detail: { summary: 'Users' } }, validate({ query: z.object({ page: zq.int().optional() }) }), responds({ 200: z.array(User) }), handler);
```

### `'299' does not exist in type 'ResponseSchemas'`

**When:** `responds(…)` declares a key that is not an HTTP status. The
deprecated `response` of a schema before the handler is refused the same
way.

```text
error TS2353: Object literal may only specify known properties, and '299' does not exist in type 'ResponseSchemas'.
```

When the schemas are a variable, the message is
`"299 is not an HTTP status"`; a variable with no registered status at all
gives `TS2559: Type '{ 299: … }' has no properties in common with type 'ResponseSchemas'`.

**Why:** `responds` is keyed by the statuses a route may answer, the
`StatusCode` type: the registered codes from 100 to 511.

**Fix:** declare a registered status:

```ts
import { responds } from '@alxia/core';

app.get('/users', responds({ 200: z.array(User) }), handler);
```

### `Argument of type '201' is not assignable to parameter of type '200'`

**When:** the handler of a route given `responds(…)` replies with a status
it does not declare.

```text
error TS2345: Argument of type '201' is not assignable to parameter of type '200'.
```

**Why:** with `responds`, the handler's `reply` takes only the declared
statuses, so the route answers only what it declares, as its OpenAPI
document says.

**Fix:** declare the status, then reply with it:

```ts
import { responds, validate } from '@alxia/core';

app.post('/users', validate({ body: NewUser }), responds({ 201: User }), async ({ body, reply }) =>
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

**Why:** a handler returns a `Reply`. A raw `Response` escapes the check
`responds` makes of a reply, and the OpenAPI document cannot describe it.

**Fix:** return `reply`. A string goes as `text/plain`, a `Blob` or a stream
as it is, and anything else as JSON:

```ts
app.get('/health', ({ reply }) => reply(200, 'ok'));
```

A `Response` is only for a middleware, which may return one sent as it is,
outside the typed contract.

### `Property 'user' does not exist on type 'Context<…>'`

**When:** a route declared with the deprecated schema before the handler
reads what a `derive` or `decorate` adds, but the route is declared before
that hook. A route declared by `route(operation, …)` gets the same error
naming another type:
`Property 'user' does not exist on type 'Omit<BaseContext & Empty & { readonly params: PathParams<"/me">; … }, "params" | … | "body"> & { …; }'`;
the fix is the same.

```text
error TS2339: Property 'user' does not exist on type 'Context<Empty, "/me", Empty>'.
```

A route declared by its method, `get(path, …middlewares, handler)`, reports
the same mistake as
[`Property 'user' does not exist on type 'RouteBase<…>'`](#property-user-does-not-exist-on-type-routebase).

**Why:** a `derive`, a `decorate` or a `use` applies only to the routes declared after it. This is
true at runtime too: in JavaScript, `ctx.user` would be `undefined`.

**Fix:** declare the `derive` first ([Hooks](../README.md#context-and-hooks)):

```ts
const app = alxia()
	.derive(async ({ request }) => ({ user: await authenticate(request) }))
	.get('/me', ({ user, reply }) => reply(200, user));
```

The same applies to `plugin(app)`. Its `derive`s and middlewares reach the routes
declared after `plugin`, not before it.

### `the plugin reads "…", which this app's context does not give: add the plugin or middleware that gives it first`

**When:** an app mounts a plugin made by `definePlugin<Requires>()`, or
routes made by `defineRoutes()` (which require the registered context),
with `plugin(…)`, and nothing declared before it adds a key the plugin
requires.

```ts
const tenant = definePlugin<{ user: { tenantId: string } }>()((app) =>
	app.derive(({ user }) => ({ tenant: tenants.get(user.tenantId) ?? null })),
);

alxia().plugin(tenant);
```

```text
error TS2769: No overload matches this call.
  …
  Overload 2 of 2, '(plugin: Alxia<…> & { readonly '~requires'?: { user: { tenantId: string; }; }; } & { ...; }): Alxia<…>', gave the following error.
    …
        Types of property ''~requires'' are incompatible.
          Type '{ user: { tenantId: string; }; }' is not assignable to type '"the plugin reads \"user\", which this app's context does not give: add the plugin or middleware that gives it first"'.
```

The first overload's error, about a function plugin, is noise: the
message on the last line is the one that matters.

Returned from a `group` or a plugin function, `group(() => todos)` or
`plugin(() => todos)`, the error is a `TS2322: Type 'AppWithRoute<…>' is not
assignable to type '… & { readonly '~requires': "the plugin reads …" }'`
on the returned app, with the same message.

For routes made by `defineRoutes()`, the last line reads
`Property ''~requires'' is missing in type 'Alxia<…>' but required in type '{ readonly '~requires': "the plugin reads \"user\", which this app's context does not give: add the plugin or middleware that gives it first"; }'`.

**Why:** the plugin's hooks read `user`, and on this app no plugin or
`derive` before it adds one, so at runtime `user` would be `undefined`. The
message names each key at fault; with several, the error lists one message
per key, joined by `|`, and a key of another type gets the message of the
entry below.

**Fix:** mount the plugin, or give the middleware, that adds the key first:

```ts
alxia().plugin(auth).plugin(tenant); // auth derives user
```

The order is what counts: `alxia().plugin(tenant).plugin(auth)` is refused too.

### `the plugin reads "…", which this app's context gives with another type`

**When:** the app's context has the key the plugin requires, but its type
does not fit, such as a `user` that may be `null` for a plugin that
requires one.

```ts
alxia()
	.derive(async ({ request }) => ({ user: await authenticate(request) })) // user: User | null
	.plugin(tenant);
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
	.plugin(tenant);
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

**When:** an app mounts a plugin whose requirement is inferred from a
callback (with `RequiresOf`), and that callback's parameter is annotated
`any`, or `Record<string, any>`. `@alxia/language`'s `resolve` and
`@alxia/janus`'s `load`, `subject` and `ctx` are such callbacks; the
message names the one at fault.

```ts
const audit = <Ctx extends object = BaseContext>(who: (ctx: BaseContext & Ctx) => string) =>
	definePlugin<RequiresOf<Ctx, 'who'>>()((app) => app /* … */);

alxia().plugin(audit((ctx: any) => ctx.user.id));
```

```text
error TS2769: No overload matches this call.
  …
        Types of property ''~requires'' are incompatible.
          Type '{ readonly '~any': "the plugin's who reads its context as any: annotate what it reads, or leave it unannotated"; }' is not assignable to type '"the plugin's who reads its context as any: annotate what it reads, or leave it unannotated"'.
```

Every app is refused, whatever its context gives.

**Why:** a parameter annotated `any` reads any key, of any type, and says
nothing of what it reads. The plugin would require nothing, so `plugin` would
accept it on an app without the `user` the callback reads, and the request
would throw at runtime. A requirement that turns the check off without a
word is refused instead.

**Fix:** annotate what the callback reads. The app must then give it before
the plugin:

```ts
alxia().plugin(auth).plugin(audit(({ user }: BaseContext & { user: User }) => user.id));
```

Or leave the parameter unannotated, if it reads only the request. It is
then typed `BaseContext` and requires nothing:

```ts
alxia().plugin(audit((ctx) => ctx.ip ?? 'unknown'));
```

A parameter annotated `unknown` or `object` requires nothing, and is not
refused: it reads no key without a check or a cast of its own. A key
annotated `any`, as in `{ user: any }`, is still a key the plugin reads:
an app must give some `user`.

### `… is not assignable to type 'ProvidedBy<C, …>'`

**When:** `plugin(tenant)` with a `definePlugin` plugin, on an app whose
context is a type parameter:

```ts
const withTenant = <C extends { user: { tenantId: string } }>(app: Alxia<C>) =>
	app.plugin(tenant);
```

```text
error TS2769: No overload matches this call.
  …
      Type 'Alxia<{ user: { tenantId: string; }; } & { tenant: …; }, "", never> & Requiring<{ user: { tenantId: string; }; }>' is not assignable to type 'ProvidedBy<C, { user: { tenantId: string; }; }>'.
```

**Why:** the check is a conditional type, and TypeScript does not decide a
conditional type on a type parameter, even when its bound would pass.

**Fix:** type the app with a concrete context, or as `AnyAlxia` and give
the function's return type yourself. `AnyAlxia` is not checked.

### `the hook reads "…", which this route's context does not give: derive it before this route, or earlier in its list`

**When:** a route's deprecated list of hooks holds a hook made by
`defineHook<Requires>()` (or `defineWrap<Requires>()`), and neither the
hooks in force where the route is declared nor the hooks before it in the
list add a key it requires.

```ts
// deprecated: a list of hooks, then a schema
const canView = defineHook<{ user: User; params: { id: string } }>()(({ user, params, reply }) =>
	params.id.startsWith(user.id) ? undefined : reply(403, { error: 'forbidden' as const }));

alxia().patch('/bookmarks/:id', [canView], { body: Update }, handler);
```

```text
error TS2769: No overload matches this call.
  …
  Overload 2 of 21, '(path: "/bookmarks/:id", hooks: [RouteHook<…>] & NoInfer<readonly [{ readonly '~requires': "the hook reads \"user\", …"; }]>, …)', gave the following error.
    …
        Types of property ''~requires'' are incompatible.
          Type '{ user: User; params: { id: string; }; }' is not assignable to type '"the hook reads \"user\", which this route's context does not give: derive it before this route, or earlier in its list"'.
```

Overload 1, about `OptionsOnly<RouteOptions>`, and overload 3, about
`RouteMiddleware<…>`, are the other forms TypeScript tried: noise here.

**Why:** the hook reads `user`, which nothing before it on this route adds,
so at runtime it would be `undefined`. Each hook is checked against the
context the route has built when it runs: the scope's, then the list's up
to it. A hook that reads what a hook **after** it in the list adds is
refused the same way.

**Fix:** make the hooks middlewares, and put the one that adds the key
first. A middleware placed too early is refused as
[`Property 'user' is missing in type 'RouteBase<…>'`](#property-user-is-missing-in-type-routebase-but-required-in-type--user-user-):

```ts
import { defineMiddleware, validate } from '@alxia/core';

const canView = defineMiddleware<{ user: User; pathParams: { id: string } }>()(({ user, pathParams, reply }, next) =>
	pathParams.id.startsWith(user.id) ? next() : reply(403, { error: 'forbidden' as const }));

alxia().patch('/bookmarks/:id', auth, canView, validate({ body: Update }), handler); // auth adds user
```

Keeping the list, derive the key before the route, or put the hook that
adds it earlier in the list: `[loadBookmark, canEdit]`, not
`[canEdit, loadBookmark]`.

### `the hook reads "…", which this route's context gives with another type`

**When:** the route's context has the key a hook in its list requires, but
of a type that does not satisfy it: a `user: string` where the hook reads
`user: User`.

**Why:** the hook would read a value of the wrong shape.

**Fix:** make the `derive` that adds the key return the type the hook
names, or name the type the route gives in the hook's `Requires`.

### `the hook reads the path parameter "…", which this route's path does not declare`

**When:** a hook names `params: { id: string }` in its `Requires`, and is
given in a deprecated list to a route whose path has no `:id`.

```ts
app.get('/bookmarks', [canView], handler); // deprecated list; canView reads params.id
```

**Why:** the hook reads `params.id`, which a request to `/bookmarks` never
has.

**Fix:** give it to a route whose path declares the parameter, under its
name: `/bookmarks/:id`. A route under a group or a prefix is checked by its
whole path, the prefix's parameters included. A middleware made by
`defineMiddleware<{ pathParams: { id: string } }>()` is held to the path
the same way, and refused as
[`Property 'id' is missing in type …`](#property-id-is-missing-in-type-readonlyrecordstring-string--pathparams):

```ts
app.get('/bookmarks/:id', auth, canView, handler);
```

### `the hook reads the path parameter "…" as another type than the string it arrives as`

**When:** a hook of a deprecated list names a path parameter with a type a
string is not, in `params` or `pathParams`:
`defineHook<{ params: { id: number } }>()`.

**Why:** a hook of the list runs before the `params` schema, so
`params.id` is the string the path carried, whatever the schema makes of it
for the handler.

**Fix:** make it a middleware. Read `pathParams`, the string, wherever it
stands, or stand it after a `validate({ params })` and read its output:

```ts
import { defineMiddleware, validate } from '@alxia/core';

const loadBookmark = defineMiddleware<{ pathParams: { id: string } }>()(({ pathParams }, next) =>
	next({ id: Number(pathParams.id) }),
);

app.get('/bookmarks/:id', validate({ params: z.object({ id: z.coerce.number() }) }), ({ params }, next) =>
	next({ id: params.id }), // number
	handler,
);
```

A middleware that names `pathParams: { id: number }` is refused: with
options or a second middleware, TypeScript prints
`The types of 'pathParams.id' are incompatible between these types`.

### `the hook reads the query parameter "…" as another type than the string | readonly string[] it arrives as`

**When:** a hook of a deprecated list names a query parameter as anything
narrower than `string | readonly string[]`, optional or not:
`{ query: { page?: number } }`, or `{ query: { page?: string } }`.

**Why:** the query a hook of the list reads is the query string as it
arrived, and a repeated key — `?page=1&page=2` — arrives as a list. A
`query` schema's output is the handler's alone.

**Fix:** make it a middleware placed after a `validate({ query })`, which
reads the schema's output:

```ts
import { validate } from '@alxia/core';
import { zq } from '@alxia/zod';

app.get('/bookmarks', validate({ query: z.object({ page: zq.int().default(1) }) }), ({ query }, next) =>
	next({ offset: (query.page - 1) * 20 }), // query.page: number
	handler,
);
```

### `the hook reads the cookie "…" as another type than the string it arrives as`

**When:** a hook of a deprecated list names a cookie as anything a string
is not: `{ cookies: { visits?: number } }`.

**Why:** a hook of the list reads the cookies the `Cookie` header sent,
strings; a `cookies` schema's output is the handler's alone.

**Fix:** make it a middleware placed after a `validate({ cookies })`, which
reads the schema's output, or name it `string`
(`{ cookies: { visits?: string } }`) and convert it in the hook.

### `the hook reads "body", which no hook reads: the body is validated after the hooks, so read it in the handler`

**When:** a hook of a deprecated list names `body` in its `Requires`.

**Why:** the hooks of a route's list run before the request is validated,
and the body is read then: no hook ever has one.

**Fix:** make it a middleware placed after `validate({ body })`: it reads
the validated body, and may end the request
([What a middleware reads](guide/middleware.md#what-a-middleware-reads)):

```ts
import { defineMiddleware, validate } from '@alxia/core';

const notReserved = defineMiddleware<{ body: { title: string } }>()(({ body, reply }, next) =>
	body.title === 'admin' ? reply(403, { error: 'reserved' as const }) : next());

app.post('/notes', validate({ body: z.object({ title: z.string() }) }), notReserved, ({ body, reply }) => reply(201, body));
```

### `this route's context does not give what the hook reads`

**When:** a hook's `Requires` is not satisfied, and no key can be named: a
union, or a symbol key.

**Fix:** name the requirement as an object type with string keys.

### `a route's hooks are a list written in the call, [first, second]: a list of unknown length cannot be checked`

**When:** a route is given its deprecated list of hooks as an array typed
`AnyRouteHook[]` — built elsewhere, or annotated — rather than written in
the call.

```ts
const guards: AnyRouteHook[] = [canView];
app.get('/bookmarks/:id', guards, handler); // deprecated list
```

**Why:** each hook is checked against what the hooks before it added, which
takes knowing each one's place: a list of unknown length has none.

**Fix:** make the hooks middlewares, given one by one after the path —
`app.get('/bookmarks/:id', auth, canView, handler)`. Keeping the list,
write it in the call, `[canView]`, or keep it as a tuple:
`const guards = [canView, loadBookmark, canEdit] as const`.

The message most often follows an error of a route **without** a list, as
the last overload TypeScript tried:

- a route with **one middleware** and no options reports any mistake in it
  this way: `The last overload gave the following error`, then
  `Argument of type 'Middleware<…>' is not assignable to parameter of type
  '(readonly [] | readonly AnyRouteHook[]) & …'`. The list is not the
  problem; the middleware's type is. Its first argument names what it
  reads, such as `Middleware<{ readonly pathParams: { readonly id: string; }; }, …>`
  for [a `validate({ params })` the path does not declare](#property-id-is-missing-in-type-readonlyrecordstring-string--pathparams).
  Giving the route its options, `{}`, or a second middleware, makes
  TypeScript print the error of the middleware overloads instead;
- a deprecated schema the route refuses, `get('/a/:id', { params: … }, handler)`,
  is reported only as `'params' does not exist in type '(readonly [] | readonly AnyRouteHook[]) & …'`:
  the schema's own message is not printed. Give the schema to
  `validate(…)` and `responds(…)`, which name what is wrong.

### `a route takes at most 8 hooks in its list: derive the rest in a group around it`

**When:** a route's deprecated list holds nine hooks or more.

```text
Property ''~hooks'' is missing in type '[RouteHook<…>, …]' but required in type '{ readonly '~hooks': "a route takes at most 8 hooks in its list: derive the rest in a group around it"; }'.
```

**Why:** the types thread the list one hook at a time, and the bound keeps
that recursion cheap and finite.

**Fix:** move the hooks every route of a set shares into a `derive` in a
group around them, and give the route, as middlewares, what differs route
by route. A route takes up to 8 middlewares too
([`Expected 2-11 arguments`](#type-middleware-has-no-properties-in-common-with-type-optionsonlyrouteoptions)):

```ts
app.group((g) => g.derive(authenticate).derive(loadTenant)
	.patch('/bookmarks/:id', canView, loadBookmark, canEdit, validate({ body: Update }), handler));
```

### `Type '…' is not assignable to type 'MaybePromise<unique symbol>'`

### `Type 'Promise<Next<…>>' is not assignable to type 'unique symbol'`

**When:** `defineMiddleware<Requires>(middleware)`, or the deprecated
`defineHook<Requires>(hook)`: the requirement and the function in one call.

```ts
defineMiddleware<{ user: User }>(({ user }, next) => next({ id: user.id }));
```

```text
error TS2345: Argument of type '({ user }: MiddlewareContext<{ user: User; }>, next: NextFunction) => Promise<Next<{ id: string; }, Empty>>' is not assignable to parameter of type 'Middleware<{ user: User; }, unique symbol>'.
  Type 'Promise<Next<{ id: string; }, Empty>>' is not assignable to type 'unique symbol'.
```

`defineHook` prints `… parameter of type 'DeriveFn<{ user: User; }, unique symbol>'`,
then `Type '{ id: string; }' is not assignable to type 'MaybePromise<unique symbol>'`.

**Why:** TypeScript infers no type argument once one is given, so the
function's result could not be inferred beside `Requires`.

**Fix:** name the requirement first, then give the function:

```ts
defineMiddleware<{ user: User }>()(({ user }, next) => next({ id: user.id }));
```

### `Types of property 'body' are incompatible. Type 'undefined' is not assignable to type '…'`

**When:** a middleware given to `route(operation, m, handler)` reads `body`,
or the validated `params`, of the operation. The operation's `validate`
stands just before the handler, so a middleware before it reads the
request as it arrived: `body` is `undefined`, `params` strings. TypeScript
reports it on the middleware forms, which come last.

```ts
app.route(op, ({ body }, next) => next({ title: body.title }), handler); // body: undefined here
```

**Fix:** place the operation's validation before the middleware:

```ts
app.route(op, validate(op), ({ body }, next) => next({ title: body.title }), handler);
```

### `Property 'user' does not exist on type 'RouteBase<…>'`

**When:** a middleware written in the route reads a key that only a
middleware **after** it adds:

```ts
app.post('/posts', ({ user }, next) => next({ id: user.id }), auth, handler);
```

```text
error TS2339: Property 'user' does not exist on type 'RouteBase<RouteApp<"POST", …>, "/posts">'.
```

A handler that reads what a `derive` or `decorate` declared **after** the
route adds gets the same error, on `RouteBase<RouteApp<"GET", …>, "/me">`.

**Why:** a route's middlewares run in the order given, and each one reads
only what the hooks in force and the middlewares before it added. A route
hook applies only to the routes declared after it. Here `user` would be
`undefined`.

**Fix:** put the middleware that adds the key first, or declare the hook
before the route:

```ts
app.post('/posts', auth, ({ user }, next) => next({ id: user.id }), handler);

alxia()
	.derive(async ({ request }) => ({ user: await authenticate(request) }))
	.get('/me', ({ user, reply }) => reply(200, user));
```

### `Property 'user' is missing in type 'RouteBase<…>' but required in type '{ user: User; }'`

**When:** a middleware made by `defineMiddleware<Requires>()` is placed
where nothing before it gives what it requires — on a route, a socket,
`route(operation, …)` or `use(…)`. TypeScript prints it under `No overload
matches this call`, on the middleware forms, which it tries last:

```ts
const canPost = defineMiddleware<{ user: User }>()(({ user, reply }, next) =>
	user.banned ? reply(403, { error: 'banned' as const }) : next());

app.post('/posts', canPost, auth, handler);
```

```text
error TS2769: No overload matches this call.
  …
  Overload 3 of 21, '(path: "/posts", m1: RouteMiddleware<…>, m2: RouteMiddleware<…>, handler: RouteHandler<…>): AppWithRoute<…>', gave the following error.
    Argument of type 'Middleware<{ user: User; }, …>' is not assignable to parameter of type 'RouteMiddleware<…>'.
      Types of parameters 'ctx' and 'ctx' are incompatible.
        …
          Property 'user' is missing in type 'RouteBase<…>' but required in type '{ user: User; }'.
```

The overloads before it — one about `OptionsOnly<RouteOptions>`, one about
a list of hooks — are the other forms of a route TypeScript tried; they
are noise here. With more forms in reach, TypeScript prints the last
alone, `The last overload gave the following error.`, and that one is the
middleware form, naming the key.

On `use(canPost)`, the type named is the app's context, `'BaseContext &
Empty'`, rather than `RouteBase<…>`; before 0.4 TypeScript reported there
the plugin form of `use`, `not assignable to parameter of type
'Alxia<object, string, AnyReply> & …'`, which named no key.

**Why:** the error is reported where the middleware stands: at that place
the route's context has no `user`, so it would read `undefined`.

**Fix:** put the middleware that adds the key before it, or derive the key
for every route in a `derive` before them:

```ts
app.post('/posts', auth, canPost, handler);
```

### `Property 'id' is missing in type 'Readonly<Record<string, string>> & PathParams<"…">'`

**When:** `validate({ params })` names a key the path does not declare, on
a route or on a socket's upgrade. Every key counts, optional or not: an
`extra: z.string().optional()` beside `/users/:id` is refused like a
required one. A schema that reads a parameter as something other than the
string it arrives as is refused too.

```ts
app.get('/posts', { bodyLimit: 1024 }, validate({ params: z.object({ id: z.string() }) }), handler);
app.ws('/rooms/:room', validate({ params: z.object({ room: z.string(), extra: z.string().optional() }) }), handlers);
```

```text
error TS2769: No overload matches this call.
  …
              Property 'id' is missing in type 'Readonly<Record<string, string>> & PathParams<"/posts">' but required in type '{ readonly id: string; }'.
```

On the socket, the key is named the same way: `Property 'extra' is missing
in type 'Readonly<Record<string, string>> & PathParams<"/rooms/:room">' but
required in type '{ readonly room: string; readonly extra: string | undefined; }'`.

The middleware forms are the last overloads TypeScript tries, so it names
the key on a route with no options and one middleware too; before 0.4 it
printed the deprecated list of hooks' `'~hooks'` message there instead.

**Why:** `validate`'s `params` schema reads the path's parameters, which
are strings. A key the path does not declare is never there; a schema that
refuses a string refuses every request.

**Fix:** declare the parameter in the path, under the schema's name, and
coerce the string the schema reads:

```ts
app.get('/posts/:id', validate({ params: z.object({ id: z.coerce.number() }) }), handler);
```

### `Type '…' is not assignable to type 'never'` in a route's options

**When:** a route given middlewares also has a schema in the object
before them, `{ body }`, `{ query }` or `{ response }`. TypeScript prints
it as `No overload matches this call`; the first overload adds
`'body' does not exist in type 'RouteMiddleware<…>'`.

```ts
app.post('/posts', { body: Post }, auth, handler);
```

```text
error TS2769: No overload matches this call.
  …
  Overload 2 of 21, '(path: "/posts", options: OptionsOnly<RouteOptions>, m1: RouteMiddleware<…>, handler: RouteHandler<…>): AppWithRoute<…>', gave the following error.
    Type 'ZodObject<{ title: ZodString; }, $strip>' is not assignable to type 'never'.
```

**Why:** with middlewares, the object after the path is the route's
options, `bodyLimit` and `detail`, and nothing else: `{ response }` is refused the
same way, as `Type '{ 201: …; }' is not assignable to type 'never'`. A schema is a
middleware, `validate(…)` or `responds(…)`, so it stands where it runs.

**Fix:** keep the options for the configuration, and move the schemas
among the middlewares:

```ts
import { responds, validate } from '@alxia/core';

app.post('/posts', { bodyLimit: 1024 * 1024 }, auth, validate({ body: Post }), responds({ 201: Post }), handler);
```

### `Type 'Middleware<…>' has no properties in common with type 'OptionsOnly<RouteOptions>'`
### `Expected 2-11 arguments, but got 12`
### `Expected 2-10 arguments, but got 11`

**When:** a route is given nine middlewares or more. Without options,
TypeScript reports the first, `TS2559`, on the first middleware; with
options, it counts the arguments, `TS2554`. `route(operation, …)` counts
them too, `Expected 2-10 arguments`.

```ts
app.get('/', m1, m2, m3, m4, m5, m6, m7, m8, m9, handler);
```

**Why:** the types thread the context one middleware at a time, through
eight at most, to keep the check cheap and finite.

**Fix:** move what every route of a set shares into a `derive` in a group
around them, or join two middlewares into one, and keep in the route what
differs route by route:

```ts
app.group((g) => g.derive(authenticate).derive(loadTenant)
	.patch('/posts/:id', canEdit, loadPost, validate({ body: Update }), handler));
```

### `Type 'string' is not assignable to type 'MiddlewareReturn'`

**When:** a middleware returns something other than what `next()`
resolves to, a reply or a `Response`: a plain value, an object, or
nothing. Made by `defineMiddleware`, the message ends in
`'unique symbol | MiddlewareReturn'`:

```ts
defineMiddleware(() => 'nothing');
```

```text
error TS2345: Argument of type '() => string' is not assignable to parameter of type 'Middleware<Empty, unique symbol | MiddlewareReturn>'.
  Type 'string' is not assignable to type 'unique symbol | MiddlewareReturn'.
```

A middleware that returns nothing, alone in a route, is reported against
the last overload, the list of hooks, as described
[above](#a-routes-hooks-are-a-list-written-in-the-call-first-second-a-list-of-unknown-length-cannot-be-checked).

**Why:** a middleware either passes the request on, `next(added?)`, or ends
it, with a reply or a `Response`. Anything else would leave the request
without an answer: at runtime it is
[a `TypeError` and a 500](#typeerror--a-middleware--returned-nothing-return-next-a-reply-or-a-response).

**Fix:** return `next()`, or a reply:

```ts
const logged = defineMiddleware(async ({ request }, next) => {
	console.log(request.method, request.url);
	return next();
});
```

### `'response' does not exist in type 'RequestSchemas'`

**When:** `validate` is given a key that is not a part of the request,
such as `response`, or a misspelt `quey`.

```text
error TS2353: Object literal may only specify known properties, and 'response' does not exist in type 'RequestSchemas'.
```

When the schemas are a variable that also holds a part, the message is
`"response" is not a part validate() reads: params, query, headers, cookies or body`;
one holding only unknown keys, `const s = { response: Post }`, gives
`TS2559: Type '…' has no properties in common with type 'RequestSchemas'`.

**Why:** `validate` reads the request: `params`, `query`, `headers`,
`cookies` and `body`. The statuses a route answers are `responds`'.

**Fix:**

```ts
app.post('/posts', validate({ body: Post }), responds({ 201: Post }), handler);
```

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
cannot name would be typed under every method while being served under
one. A route with a path it
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
| `use('/admin/', guard)` | `"/admin/": a path given to use() does not end with "/"` ([below](#useadmin-a-path-given-to-use-does-not-end-with-)) |

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

A plugin given to `plugin` is not checked under the prefix `plugin` puts its
routes at: `alxia({ prefix: '/users/:id' }).plugin(alxia().get('/:id', …))`
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

### `… is not assignable to type '"Invalid middleware: a middleware given a path may add nothing to the context, …"'`

```text
error TS2769: No overload matches this call.
  …
      Type 'Middleware<Empty, Reply<401, …> | Promise<Next<{ user: User; }, Empty>>> & MiddlewareMark' is not assignable to type '"Invalid middleware: a middleware given a path may add nothing to the context, and this one passes \"user\" to next(): give it to the routes of a group instead, app.group(path, (group) => group.use(middleware))"'.
```

**When:** `use(path, ...middlewares)` is given a middleware that passes
`next` an object — `next({ user })` — such as an `auth`:

```ts
app.use('/admin', auth); // auth returns next({ user })
```

**Why:** a middleware given a path runs on some of the routes declared
after it and not on others, which the app's type cannot follow: what it
adds would be typed on every route, or on none. So it may add nothing:
`next()`, a reply or a `Response`.

**Fix:** to add to a subtree's context, `use` the middleware in a group,
whose routes are that subtree, typed:

```ts
app.group('/admin', (admin) => admin.use(auth).get('/me', ({ user, reply }) => reply(200, user)));
```

A guard that only answers or passes, `next()`, can stay on the path:
`app.use('/admin', requireAdmin)`.

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

### `Module '"@alxia/core"' has no exported member 'RoutesOf'`

**When:** code written for 0.3 imports `RoutesOf`, or another type that
described a route to a client — `RouteEntryOf`, `RouteRecord`,
`RouteTable`, `RouteInput`, `RouteOutput`, `Outcome`, `OutcomeOf`,
`SocketRecord`, `SocketEntryOf`, `RefusalOutcome`, `KindOutcome`,
`DefaultRefusalOutcome`, `DefaultLimitOutcome`, `IsLimited`,
`BehindShortcuts`, `AppWithSocket`, or `@alxia/graphql`'s `GraphQLRoutes`
— from `@alxia/core` 0.4 or later:

```text
error TS2305: Module '"@alxia/core"' has no exported member 'RoutesOf'.
```

**Why:** alxia is OpenAPI spec first. A route adds nothing to the app's
type, and the route table, its types and the typed client are gone: a
client is generated from the OpenAPI document.

**Fix:** generate the client from the document, for example with
`@nxgt/openapi-codegen`; check a route in a test with `app.request()`, and
what its handler reads with `expectTypeOf` inside it. See
[No more client: spec first](upgrading.md#no-more-client-spec-first).

### `Generic type 'Alxia<Ctx, Prefix, Shortcuts>' requires between 0 and 3 type arguments`

**When:** code written for 0.3 names an app with four type arguments:

```ts
type Fresh = Alxia<Empty, Empty, '', never>;
```

```text
error TS2707: Generic type 'Alxia<Ctx, Prefix, Shortcuts>' requires between 0 and 3 type arguments.
```

**Why:** the second parameter, `Routes`, is gone: `Alxia` is
`Alxia<Ctx, Prefix, Shortcuts>`.

**Fix:** drop the second argument:

```ts
type Fresh = Alxia<Empty, '', never>;
```

See [No more client: spec first](upgrading.md#no-more-client-spec-first).

### `'app' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer`

**When:** `Register` names the app that mounts the route files, rather
than the base that builds the context:

```ts
export const app = alxia().derive(auth).plugin(todos); // todos = defineRoutes(…)

declare module '@alxia/core' {
	interface Register {
		context: typeof app;
	}
}
```

```text
app.ts(1,14): error TS7022: 'app' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
app.ts(5,3): error TS2502: 'context' is referenced directly or indirectly in its own type annotation.
todos.ts(3,14): error TS7022: 'todos' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
```

The same happens when the registered chain itself reads `Register`: a
`defineMiddleware<AppContext>()` or a `defineRoutes()` given to `base`.
(A `contextStorage()` given to `base` compiles, but its `context()` reads
`BaseContext`: give it to the app after `base`.)

**Why:** `todos`' type reads `Register`, which is `typeof app`, whose type
is what `plugin(todos)` returns: each needs the other first, so TypeScript
gives both `any`.

**Fix:** register the chain that builds the context, and mount the routes
on the app after it:

```ts
// src/context.ts
export const base = alxia().derive(auth);

declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}

// src/app.ts
export const app = base.plugin(todos);
```

Give `base` nothing that reads `Register`; give those to `app`.

### `Property '…' does not exist on type 'BaseContext & { readonly 'Register.context must be typeof base, …': never; }'`

**When:** every read of `AppContext`, and of a `defineRoutes` route's
context, fails with it.

```text
error TS2339: Property 'user' does not exist on type 'BaseContext & { readonly 'Register.context must be typeof base, the alxia() chain that decorates and derives the context': never; }'.
```

**Why:** `Register`'s `context` is not an alxia app: its context
(`ContextOf<typeof base>`), the module (`typeof import('./context')`), or
a type written by hand. What it names is read as `InvalidRegister`, whose
only key is this message, so the mistake shows on the first read rather
than as an `any`.

**Fix:** name the app, `typeof base`:

```ts
declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}
```

### `Subsequent property declarations must have the same type.  Property 'context' must be of type '…'`

**When:** two files of one TypeScript program declare `Register`'s
`context`, with different apps.

```text
error TS2717: Subsequent property declarations must have the same type.  Property 'context' must be of type 'Alxia<Empty & { user: string; }, "", never>', but here has type 'Alxia<Empty & { tenant: string; }, "", never>'.
```

**Why:** a program has one `Register`, and it names one context.

**Fix:** keep one declaration, beside the base. Two apps in one
repository each get their own `tsconfig.json`, so each is its own program;
a package shared by both names what it reads with
`definePlugin<Requires>()`, not `Register`.

### `Property 'user' does not exist on type 'MiddlewareContext<Empty>'`

**When:** with `Register` augmented, a `defineMiddleware(fn)` reads a key
of the registered context.

```ts
const owner = defineMiddleware(({ user }, next) => next({ owner: user.id }));
```

**Why:** a middleware may be given to a route before `base` adds
anything, so with no type argument it reads `BaseContext` alone,
registered or not.

**Fix:** name the registered context as what it requires; a route or a
`use` whose context does not give it then refuses the middleware:

```ts
import { type AppContext, defineMiddleware } from '@alxia/core';

const owner = defineMiddleware<AppContext>()(({ user }, next) => next({ owner: user.id }));
```

## Building the app

These are `TypeError`s thrown when a route is declared, so the app fails at
startup, not on a request. Six of them — `"*" may only end a path`, `is
not a parameter name`, `":" may only start a segment`, `"*" may only be a
whole segment`, `is a dot segment` and `declares ":…" twice` — are refused
by the type first when the path is a literal, with the same message after
`Invalid path:`
([the compile error](#argument-of-type--is-not-assignable-to-parameter-of-type-invalid-path-)). The eight about a path's syntax are also thrown
by `shapeOf(path)`, and so by a tool that calls it: `@alxia/openapi`'s
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
and once through `plugin(app)` or a `group`, or as `static` beside a
`GET /…/*`.

**Fix:** keep one. `HEAD` runs the `GET` route, so you do not need to
declare it.

### `GET /…: hook 1 of the list is not a hook: make it with defineHook() or defineWrap()`

**When:** a route's list holds something `defineHook` or `defineWrap` did
not make: a bare function, an object cast to a hook.

**Fix:** wrap it: `[defineHook(({ request }) => …)]`.

### `defineHook(): the hook is not a function`

**When:** `defineHook(value)` or `defineWrap(value)` is given something that
is not a function — `defineWrap()` reports `defineWrap(): …`. Calling
either with nothing at all is not this error: `defineHook<Requires>()`
returns the function that takes the hook.

**Fix:** give it the hook, `defineHook(({ request }) => …)`, or name the
requirement and give the hook next, `defineHook<{ user: User }>()((ctx) => …)`.

### `GET /…: middleware 1 is not a function: make it with defineMiddleware(), validate() or responds()`

**When:** a route is given, between its path (or options) and its handler,
something that is not a function: a string, an object, a schema handed
bare instead of `validate({ body: Post })`. The count starts after the
options, so `middleware 1` is the first middleware. A socket route reports
`WS /…: …`.

**Why:** each argument between the options and the last is a middleware,
run in turn. Only the first object after the path is read as the options.

**Fix:** make it a middleware, or wrap the schema:

```ts
import { validate } from '@alxia/core';

app.post('/posts', auth, validate({ body: Post }), handler);   // not app.post('/posts', auth, { body: Post }, handler)
```

### `GET /…: the options hold no schema: give validate(…) and responds(…) among the middlewares`

**When:** a route given middlewares also has a schema part — `params`,
`query`, `headers`, `cookies`, `body` or `response` — in its options. The
types refuse it ([`… is not assignable to type 'never'`](#type--is-not-assignable-to-type-never-in-a-routes-options));
plain JavaScript or a cast reaches the runtime, which refuses it where the
route is declared.

**Why:** the options are the route's configuration, `bodyLimit` and
`detail`. A schema there would validate after the middlewares and undo
what a `validate` among them did.

**Fix:** move the schemas into middlewares:

```ts
app.post('/posts', { bodyLimit: 1024 }, auth, validate({ body: Post }), responds({ 201: Post }), handler);
```

### ``WS /…: responds() checks replies, and a socket route sends none: check its messages with the `send` option``

**When:** `responds(…)` is given to `ws(…)`. The types refuse it too: the
handlers object is then typed by this message.

**Why:** a socket route answers its upgrade by opening the socket; it has
no reply for `responds` to check. What it sends is checked by its `send`
schema.

**Fix:**

```ts
app.ws('/rooms/:room', { message: Chat, send: Chat }, auth, {
	message: (socket, chat) => socket.send(chat),
});
```

### `defineMiddleware(): the middleware is not a function`

**When:** `defineMiddleware(value)` is given something that is not a
function. Calling it with nothing at all is not this error:
`defineMiddleware<Requires>()` returns the function that takes the
middleware.

**Fix:** give it the middleware, or name what it reads and give the
middleware next:

```ts
const canPost = defineMiddleware<{ user: User }>()(({ user, reply }, next) =>
	user.banned ? reply(403, { error: 'banned' as const }) : next());
```

### `validate(): the schemas are not an object`

**When:** `validate(value)` is given `null` or something that is not an
object, such as a schema itself: `validate(Post)`. `responds(value)`
reports `responds(): the schemas are not an object`.

**Why:** both take an object keyed by what they check: the request's part
for `validate`, the status for `responds`.

**Fix:**

```ts
app.post('/posts', validate({ body: Post }), responds({ 201: Post }), handler);
```

### `GET /…: a list of hooks and middlewares are two forms, never mixed: give the hooks as middlewares, made by defineMiddleware()`

**When:** a route is given a list of hooks, the form of 0.3, and
middlewares after it: `app.get('/', [hook], auth, handler)`, or `[hook],
schema, auth, handler`. `route(operation, [hook], auth, handler)` throws
the same, named by the operation: `GET /pets/:petId: a list of hooks and
middlewares are two forms, …`. The types refuse both, so this comes from
JavaScript or a cast. It throws where the route is declared.

**Why:** the two forms read the arguments differently. Before 0.4 the
route kept one of them: `route(operation, [hook], auth, handler)` took
`auth` for the handler and dropped the real one without a word.

**Fix:** give the hooks as middlewares, after the path:

```ts
const loadPost = defineMiddleware(async ({ pathParams }, next) =>
	next({ post: await posts.find(pathParams.id) }),
);
app.get('/posts/:id', loadPost, auth, handler);
```

See [Upgrading](upgrading.md#3-the-list-of-hooks-becomes-middlewares-after-the-path).

### `responds(): the operation GET /… declares no response`

**When:** `responds(operation)` is given an operation whose `schema` has no
`response`: `responds({ method: 'GET', path: '/health' })`. It throws
where it is called.

**Why:** `responds(operation)` checks the replies the operation declares;
with none, it would type `reply` by no status and refuse every reply.

**Fix:** declare the responses in the document, regenerate the
operations, or leave `responds` out: `route(operation, …)` checks the
handler's reply by the operation's responses on its own, and an operation
without them adds no check.

### `GET /…: the handler is missing`

**When:** a route method's last argument is not a function:
`app.get('/a')`, `app.get('/a', { bodyLimit: 1024 })`, or a handler
passed as a variable that is `undefined`. Or its last argument is a
`validate(…)` or a `responds(…)`, the handler forgotten after it:
TypeScript refuses that too, `… is not assignable to parameter of type
'RouteHandler<…>'`, and past the types the route throws this when it is
declared.

**Fix:** pass the handler last:

```ts
app.get('/a', validate({ query: Query }), ({ query, reply }) => reply(200, query));
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

### `use(): middleware 2 was not made by defineMiddleware()`

**When:** `use(first, second, …)`, whose first argument is a middleware
made by `defineMiddleware` or a path, is given something else among them:
a plain function, or — as `use(): middleware 1 is a validate() or
responds(), which belongs to a route` says — a `validate(…)` or
`responds(…)`. The types refuse both, so this comes from JavaScript or a
cast. Given a path first, the message starts with it:
`use("/admin"): middleware 1 was not made by defineMiddleware()`.

**Why:** `use` tells a middleware from a plugin by the mark
`defineMiddleware` puts on it. `validate` and `responds` declare one
route's schemas, and belong among its middlewares.

**Fix:** wrap the function, and give the schemas to the route:

```ts
const timed = defineMiddleware(async (_ctx, next) => next());
app.use(auth, timed).post('/posts', validate({ body: Post }), handler);
```

### `use("…"): no middleware is given`

**When:** `use(path)` is called with a path and no middleware, or with a
path a route could not be declared at: `use("/a/*/b"): "/a/*/b": "*" may
only end a path` gives the reason, as [Building the app](#building-the-app)
lists them for a route.

**Why:** a string first is read as the path of the middlewares after it,
checked as a route path is; with none after it, `use` would do nothing.

**Fix:** give the middlewares after the path, and a path written as a
route's: `app.use('/admin/*', requireAdmin)`.

### `use("/admin/"): a path given to use() does not end with "/"`

**When:** `use` is given a path that ends with `/`, other than `/` itself.
Written as a literal, the types refuse it first: `Invalid path: "/admin/":
a path given to use() does not end with "/"`.

**Why:** a path given to `use` is matched segment by segment against the
routes' declared paths, and `/admin/` asks for an empty last segment no
route has: the middleware would run on no route, a guard guarding
nothing.

**Fix:** drop the slash: `use('/admin', guard)` for `/admin` and under,
`use('/admin/*', guard)` for under it alone.

### `plugin(): a plugin is given alone, to app.plugin(); middlewares are made with defineMiddleware() and given to use()`

**When:** `plugin` is given more than one argument, or `use` an app or a
plugin function followed by more — `use(auth, logger)` where `auth` is a
plain function or an app, which `use` reads in its deprecated plugin form
and says `use(): a plugin is given alone, …`. Given nothing, `plugin()`
says `plugin(): nothing is given: a plugin, an app or a function`, and
`use()` says `use(): nothing is given: middlewares`.

**Fix:** one plugin per call, `plugin(a).plugin(b)`; middlewares, several
to a `use`, made by `defineMiddleware`.

### `plugin(): the plugin is neither an app nor a function; a middleware is made with defineMiddleware() and given to use()`

**When:** `plugin` — or `use`, in its deprecated plugin form, `use(): the
plugin is neither …` — is given what is neither an app nor a function: a
hook made by `defineHook` or `defineWrap`, an object, `null`. The types
refuse it, so this comes from JavaScript or a cast.

**Fix:** give `plugin` an app or a function `(app) => app`; a hook of
`defineHook` goes in a route's list, or better rewritten as a middleware
([Upgrading](upgrading.md#migrating-to-middlewares)).

### `plugin(): a middleware is given to use(), not taken for a plugin`

**When:** `plugin` is given a middleware made by `defineMiddleware`, or a
`validate(…)` or `responds(…)`. The types refuse it first.

**Why:** a middleware runs on requests, a plugin once, on the app: called
as a plugin, a guard would guard nothing.

**Fix:** give it to `use`, or to the route:

```ts
app.use(auth).get('/me', ({ user, reply }) => reply(200, user));
```

### `plugin(): the plugin function returned undefined, not an app: a plugin returns the app it is given; a middleware is made with defineMiddleware() and given to use()`

**When:** a function given to `plugin` returns anything but an app —
`undefined`, a promise, a reply — and, the most common case, a middleware
written without `defineMiddleware`, `(ctx, next) => …`, given to `use`,
which reads it in its deprecated plugin form and says `use(): the plugin
function returned a promise, not an app: …`:

```ts
const auth = async ({ request, reply }, next) => { … }; // a plain function
app.use(auth); // called once as a plugin, auth(app): it returns a promise, and use throws
```

A middleware that calls `ctx.reply` or `next` before its first `await`
throws first, `TypeError: next is not a function` or the like, from the
function run with the app as `ctx`.

**Why:** a plugin is a function too, `(app) => app`. `use` tells the two
apart by the mark `defineMiddleware` puts on a middleware; any other
function is a plugin, called with the app. Before 0.4 `use` returned what
it returned, so a guard ran on no request without a word; now a result
that is not an app throws, and a promise it returned is left handled. A
route's own middlewares take a plain function: only `use` needs the mark.

**Fix:** make a middleware with `defineMiddleware`, and return the app
from a plugin function:

```ts
const auth = defineMiddleware(async ({ request, reply }, next) => { … });
app.use(auth);
app.plugin((app) => app.onStop(close)); // onStop returns the app
```

The types say so first: a plain `(ctx, next) => …` given to `use` does not
compile, since a plugin takes the app alone and returns an app. In the
next minor, `use` takes any `(ctx, next)` function as a middleware.

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

**When:** a request reaches a `validate(…)` whose `params`, `query`,
`headers`, `cookies` or `body` schema refuses it — or a deprecated schema
before the handler. Every issue is listed, each with the part it was read
from:

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
import { validate } from '@alxia/core';
import { zq } from '@alxia/zod';

app.get(
	'/items',
	validate({ query: z.object({ page: zq.int().optional(), tag: zq.array(z.string()).optional() }) }),
	handler,
);
```

```ts
await fetch('/users', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ name: 'Ada' }),
});
```

A client generated from the OpenAPI document sets the `content-type` for
you.

To answer it in another format, such as an RFC 9457 problem, give a
middleware before the routes that catches the `ValidationError` and reads
`refusalOf(error)` ([Routes](guide/routes.md#refusals-in-your-own-format)).
The `onRefusal` hook does the same and is deprecated for it.

### A route still answers `{"error":"validation"}` after `onRefusal`

**When:** an app declares `onRefusal`, and a refused request to one of its
routes still gets the default 400.

**Why**, by what you find:

- The route is declared **before** the hook. A hook applies to the
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
	.post('/users', validate({ body: NewUser }), handler);
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

To answer in another format, such as an RFC 9457 problem, return it from a
middleware given before the route that catches the `ContentTooLargeError`,
for the refusal of kind `body_limit`. The `onError` hooks never see it:

```ts
import { defineMiddleware, problem, refusalOf, validate } from '@alxia/core';

const limits = defineMiddleware(async (_ctx, next) => {
	try {
		return await next();
	} catch (error) {
		if (refusalOf(error)?.kind !== 'body_limit') throw error;
		return problem({ type: 'urn:ietf:params:jmap:error:limit', status: 413, limit: 'maxSizeRequest' });
	}
});

app
	.use(limits)
	.post('/api', { bodyLimit: 10_000_000 }, validate({ body: z.unknown() }), handler);
```

The deprecated `onRefusal` hook answers it too.

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
end of the file, or, on an empty file, any range but a non-zero suffix
(`bytes=-5` is served whole, as a 200). The response carries
`Content-Range: bytes */<size>`.

**Why:** the client's idea of the file is stale (the file shrank), or it
computed the range wrongly.

**Fix:** read the size from `Content-Range` and ask again, or drop the
`Range` header, as for an empty file (`bytes */0`). `ranges: false` turns range support off for that route:

```ts
app.static('/media', join(import.meta.dir, 'media'), { ranges: false });
```

### `500 {"error":"internal"}`

**When:** a handler or a hook throws, or a reply breaks its schema. The
body never says why, by design.

**Why:** the app prints the error with `console.error`, then answers 500.
The next section lists the messages it prints. An error thrown in a route
rejects `next()` through the middlewares, which may answer it; one nobody
catches reaches the route's deprecated `onError` hooks. An `HttpError` is
answered with its own status and body.

A request that fails because its client hung up (its `request.signal`
aborted, and the error is the `AbortError` a body read then throws) is
not an error of the app: nothing is printed, no `onError` hook runs, and
a middleware that settles `next()`, a logger's, sees a `499` with no body. Any other
error is printed and answered 500, a bug thrown after the client left
included. A handler that ignores the abort and replies gets its own
status.

**Fix:** read the server log for the real error. To answer a known failure
with a status of your own, return a declared reply, or turn the error into
one in a middleware that catches it:

```ts
const notFound = defineMiddleware(async ({ reply }, next) => {
	try {
		return await next();
	} catch (error) {
		if (!(error instanceof NotFoundError)) throw error;
		return reply(404, { error: 'not_found' as const });
	}
});

app
	.use(notFound)
	.get('/users/:id', handler);
```

Prefer a declared `reply` to `throw new HttpError(…)`: a thrown status is
not declared, so a client generated from the OpenAPI document does not
expect it.

### A plugin's route reads a body past the app's `bodyLimit()`

**When:** an app calls `bodyLimit(bytes)` and then `plugin(app)` with an
app plugin, and a route of that plugin accepts a larger body.

**Why:** an app's `bodyLimit()` reaches the routes declared on it and in
its groups, never a plugin's. A plugin's route keeps the limit it was
declared with. A plugin route with no `onRefusal` of
its own is still answered by the app's hook. A function plugin that declares its routes on the app is
bounded like any of them.

**Fix:** give the plugin's route a `bodyLimit` of its own:

```ts
const uploads = alxia().post('/upload', { bodyLimit: 25 * 1024 * 1024 }, handler);
const app = alxia().bodyLimit(64 * 1024).plugin(uploads);
```

A `bodyLimit()` the plugin calls instead also applies to the app's routes
declared after `plugin`, as its hooks do. Call the app's own after `plugin`
to keep it.

## Middlewares

Traps that print nothing: a middleware runs where you did not expect, or does not run where you did.

### `set.cookies.get()` returns null in a hook

**When:** a `derive` or a middleware reads a cookie the request sent
through `set.cookies` — a session id — and always gets `null`, so every
request looks signed out:

```ts
.derive(({ set }) => ({ user: sessions.get(set.cookies.get('sid') ?? '') })) // always null
```

**Why:** `set.cookies` is the **response's** cookie map. It starts empty,
and `get` reads back only what this response set with `set.cookies.set`;
it never holds the `Cookie` header the request sent.

**Fix:** read the request's cookies from `ctx.cookies`, which every
middleware has:

```ts
.derive(({ cookies }) => ({ user: sessions.get(cookies['sid'] ?? '') }))
```

A `validate({ cookies })` validates them for the middlewares after it and
the handler; a middleware before it reads them as they arrived
([Hooks](guide/hooks.md#reading-the-requests-cookies)).

### A `use(path)` guard did not run on a request under its path

**When:** `use('/admin', guard)` is in force, yet a request to `/admin` or
`/admin/x` is answered without the guard:

```ts
app.get('/admin/stats', handler).use('/admin', guard); // GET /admin/stats: no guard
```

**Why:** the path is matched against the request's path, with the syntax of a
route's, so it covers a route declared as `/:section`, a wildcard route and
a request no route matches, whichever way the route is declared. What it
does not do is reach back: a `use` is part of the chain of the routes declared
after it, so a route declared before it never runs it. And a path is read
segment by segment: `'/admin'` covers `/admin` and `/admin/x`, not
`/administrators`; `'/admin/*'` covers what is under `/admin`, not `/admin`
itself.

**Fix:** declare the guard before the routes it covers, and pick the path
that names them:

```ts
app.use('/admin', guard).get('/admin/stats', handler); // guarded
```

### A path that does not exist answers `401`, not `404`

**When:** `GET /nowhere` with no credentials answers
`401 {"error":"unauthorized"}`, or `429`, where you expected the 404, and
`GET /nowhere` with credentials answers 404:

```ts
const app = alxia()
	.use(bearer({ jwt }))                         // a guard on the app
	.get('/users', ({ reply }) => reply(200, []));
```

**Why:** a middleware given to `use` runs on **every** request, the ones no
route matches included, before the router's 404 or 405. A guard on the
app — `bearer`, a required `session`, `rateLimit` — answers an anonymous
request to a missing path before the router does.

**Fix:** if only some routes should be guarded, guard them in a group, which
runs on its own routes alone:

```ts
const app = alxia()
	.get('/health', ({ reply }) => reply(200, 'ok'))
	.group('/api', (api) =>
		api.use(bearer({ jwt })).get('/users', ({ reply }) => reply(200, [])),
	);
// GET /nowhere → 404; GET /api/users without a token → 401
```

`use('/api', guard)` also scopes a guard to a path, but only a middleware
that adds nothing to the context: `bearer` and `session` add, so they take a
group ([`Invalid middleware: …`](#-is-not-assignable-to-type-invalid-middleware-a-middleware-given-a-path-may-add-nothing-to-the-context-)).

### A middleware's `try`/`catch` never sees the error

**When:** a middleware catches what `next()` throws, and the error never
reaches it: the response is the 500 or the `onError` reply, and the `catch`
does not run:

```ts
const app = alxia()
	.use(errors)    // try { return await next() } catch { … }
	.use(logger())  // an observer, after it
	.get('/boom', () => { throw new Error('boom'); });
```

**Why:** `logger()`, `telemetry()`, `secureHeaders()` and `cors()` settle
`next()`: they answer an error with the route's `onError` hooks, its
`HttpError` or a 500 so that they can see and decorate the response. The
error is already an answer when it reaches a middleware outside them.

**Fix:** give the observers first and the middleware that answers errors
after them, so it is inside:

```ts
const app = alxia()
	.use(logger())  // observers, first
	.use(errors)    // sees the error before the observer settles it
	.get('/boom', () => { throw new Error('boom'); });
```

The same holds for `janusErrors()`: it answers what is thrown **behind**
it, so `app.use(janusErrors(), session(accounts))`.

### `Type 'string | undefined' is not assignable to type 'string'` on `ctx.route`

```text
error TS2322: Type 'string | undefined' is not assignable to type 'string'.
```

**When:** a middleware given to `use` reads `ctx.route`, the route's path as
declared, and passes it where a `string` is expected — or logs
`undefined`.

**Why:** a `use` middleware also runs on a request no route matches — a 404,
a 405, a preflight — where there is no route: `BaseContext.route` is
`string | undefined`. A route's own middlewares and its handler read a
`string`.

**Fix:** handle the missing route, or leave the request to the router:

```ts
const timed = defineMiddleware(async ({ route, request }, next) => {
	const response = await next();
	console.log(route ?? `no route for ${request.method}`, response.status);
	return response;
});
```

### A `use()` did not run for a route

**When:** a middleware given to `use` does nothing for a route, and runs for
a request to a path that does not exist:

```ts
const app = alxia()
	.get('/early', handler)
	.use(audit); // GET /early: not audited; GET /missing: audited
```

**Why:** a route runs the middlewares declared **before** it. A `use` after
a route is not part of that route's chain; it runs for a request no route
matches, where every top-level `use` runs, wherever declared. A group's
`use` stays with the group's routes.

**Fix:** declare the middleware before the routes it should cover, first
when it is an observer:

```ts
const app = alxia()
	.use(audit)
	.get('/early', handler);
```

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

**When:** the handler of a route given `responds(…)` replies with a status
it does not declare. The types refuse that, so this comes from JavaScript
or a cast. Redirects (3xx without a body) are exempt, and so is a reply
returned by `onError`, a `derive`, or a middleware with a status `responds`
does not declare, which is sent as it is
([Where `validate` stands](guide/middleware.md#where-validate-stands)).
An `onRefusal` hook given schemas that replies with a status they do not
declare fails the same way, naming the refused route: declare the status
in the hook's `response`.

**Fix:** declare the status in `responds`:

```ts
import { responds } from '@alxia/core';

app.post('/users', responds({ 201: User, 409: Conflict }), handler);
```

### `TypeError: … a middleware (…) returned nothing: return next(), a reply or a Response`

```text
TypeError: GET /posts: a middleware returned nothing: return next(), a reply or a Response
```

**When:** a middleware that never called `next()` returns something other
than a reply or a `Response`. The message names what it returned,
`nothing` for a missing `return`, or its type, `returned string`,
`returned object`; it names the middleware when its function has a name,
and leaves the parentheses out when not. TypeScript
[refuses it](#type-string-is-not-assignable-to-type-middlewarereturn), so
this comes from JavaScript or a cast. A middleware that called `next()`
and returns nothing is not refused: it answers with the rest's response,
as Koa and Hono do.

**Fix:** return what `next()` resolves to:

```ts
const audit = defineMiddleware(async ({ request }, next) => {
	const response = await next();
	console.log(request.method, request.url, response.status);
	return response;
});
```

### `TypeError: … a middleware called next() twice`

```text
TypeError: GET /posts: a middleware called next() twice
```

**When:** a middleware calls `next` a second time: a retry around it, or
`await next()` and then `return next()`.

**Why:** `next()` runs the rest of the route, its handler included, once.
The second call would run the handler again for the same request.

**Fix:** keep the response of the first call and return it:

```ts
const timed = defineMiddleware(async (_ctx, next) => {
	const started = performance.now();
	const response = await next();
	response.headers.set('server-timing', `app;dur=${performance.now() - started}`);
	return response;
});
```

### `TypeError: … a middleware called next() after it returned`

```text
TypeError: GET /posts: a middleware called next() after it returned
```

**When:** a middleware returned a reply or a `Response`, and called
`next()` later — from a timer, a promise it did not await. The request was
already answered.

**Why:** `next()` runs the rest of the route; once the middleware has
returned, its answer is sent and the rest must not run.

**Fix:** return what `next()` resolves to, or do the late work without it:

```ts
const audit = defineMiddleware(async (ctx, next) => {
	const response = await next();
	queueMicrotask(() => record(ctx.route, response.status));
	return response;
});
```

### `GET /…: a middleware returned before the next() it called settled: the rest of the route ran anyway; await next(), or return it`

```text
GET /posts: a middleware returned before the next() it called settled: the rest of the route ran anyway; await next(), or return it
```

A warning, by `console.warn`; the request is answered with the
middleware's own reply.

**When:** a middleware calls `next()` without awaiting or returning it,
then returns a reply of its own:

```ts
const guard = defineMiddleware((ctx, next) => {
	next(); // the handler starts here
	return ctx.reply(403, { error: 'forbidden' as const });
});
```

**Why:** `next()` runs the rest of the route — the middlewares after it
and the handler — the moment it is called, and nothing can stop it once
started. The handler runs, with whatever it writes, though the client gets
a 403. alxia sends the middleware's reply once the rest has run, so that
nothing the handler sets on the response leaks into it, and logs an error
the rest throws with `console.error` rather than leave it an unhandled
rejection. Not every such middleware is caught: one whose rest settles
before it returns is taken for one that awaited it, and an error of that
rest for one it read, as `try { return await next() } catch { … }` does —
not logged, and never an unhandled rejection either.

**Fix:** decide before calling `next()`, and return or await it:

```ts
const guard = defineMiddleware((ctx, next) =>
	allowed(ctx) ? next() : ctx.reply(403, { error: 'forbidden' as const }),
);
```

A middleware that calls `next()` and returns nothing — `next()` not
awaited, or `await next()` with no `return` — is no mistake: it answers
with the rest's response.

### `TypeError: validate() runs among a route's middlewares, not called on its own`

**When:** the middleware made by `validate(…)` is called as a function,
from your own middleware: `validate({ body })(ctx, next)`. Standing last,
where the handler goes, it is refused when the route is declared instead:
[the handler is missing](#get--the-handler-is-missing). The one made by
`responds(…)` reports `responds() runs among a route's middlewares, not
called on its own`.

**Why:** `validate` and `responds` are steps the route runs itself, where
they stand in its arguments; their function only marks the place.

**Fix:** give them to the route, among its middlewares:

```ts
app.post('/posts', auth, validate({ body: Post }), handler);
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

### `TypeError: Body already used`

```text
TypeError: Body already used
 code: "ERR_BODY_ALREADY_USED"
      at readBody (…/@alxia/core/dist/index.js)
      at validateBody (…/@alxia/core/dist/index.js)
      at validateStep (…/@alxia/core/dist/index.js)
```

**When:** a route with a `validate({ body })` answers
`500 {"error":"internal"}`, and the server log prints this. Something
before the `validate` — a middleware placed before it, a `derive`, a
`wrap` — read the body itself, with `request.json()`,
`request.text()` or `request.formData()`.

**Why:** `derive`s, and the middlewares before a `validate`, run before
it. A request's body can be read once: the hook used it up, and the
`validate`, which reads it next, fails. Two `validate`s of the body are
not this: the second checks the body the first read.

**Fix:** let the `validate` read the body, and do a check that needs it in
a middleware placed after it, or in the handler: both read `body`, the
schema's output. Before it, decide on what can be read without the body,
such as `pathParams`, `cookies` and the headers
([What a middleware reads](guide/middleware.md#what-a-middleware-reads)):

```ts
import { alxia, defineMiddleware, validate } from '@alxia/core';
import { z } from 'zod';

const notAdmin = defineMiddleware<{ body: { title: string } }>()(({ body, reply }, next) =>
	body.title === 'admin' ? reply(403, { error: 'forbidden' as const }) : next());

const app = alxia().post('/notes', validate({ body: z.object({ title: z.string() }) }), notAdmin, ({ body, reply }) =>
	reply(201, body),
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
