# Troubleshooting

Each entry is headed by the text you see: a TypeScript error, an exception
thrown when the app is built, a response body, or a line in the server log;
a trap that prints nothing is headed by its symptom.

**Types**

- [`the params schema must accept the parameters of "…", which arrive as strings`](#the-params-schema-must-accept-the-parameters-of--which-arrive-as-strings)
- [`the params schema reads "…", which "…" does not declare`](#the-params-schema-reads--which--does-not-declare)
- [`'quey' does not exist in type 'OptionsOnly<FunctionLike | RouteOptions>'`](#quey-does-not-exist-in-type-optionsonlyfunctionlike--routeoptions)
- [`'299' does not exist in type 'RouteOperation | ResponseSchemas'`](#299-does-not-exist-in-type-routeoperation--responseschemas)
- [`Argument of type '201' is not assignable to parameter of type '200'`](#argument-of-type-201-is-not-assignable-to-parameter-of-type-200)
- [`Type 'string' is not assignable to type 'number'` on a `reply`](#type-string-is-not-assignable-to-type-number-on-a-reply)
- [`Type 'Response' is not assignable to type 'MaybePromise<AnyReply>'`](#type-response-is-not-assignable-to-type-maybepromiseanyreply)
- [`Property 'user' does not exist on type 'RouteBase<…>'`](#property-user-does-not-exist-on-type-routebase), and `… on type 'BaseContext & Empty'`
- [``… is not assignable to type '"`user` is missing from the context: add a middleware that gives it before this one"'``](#-is-not-assignable-to-type-user-is-missing-from-the-context-add-a-middleware-that-gives-it-before-this-one)
- [``… is not assignable to type '"`user` is in the context with another type than this middleware reads"'``](#-is-not-assignable-to-type-user-is-in-the-context-with-another-type-than-this-middleware-reads)
- [`… is not assignable to type '"the context in force here does not give what this middleware reads"'`](#-is-not-assignable-to-type-the-context-in-force-here-does-not-give-what-this-middleware-reads)
- [``… is not assignable to type '"the path parameter `id` is not in this route's path"'``](#-is-not-assignable-to-type-the-path-parameter-id-is-not-in-this-routes-path)
- [`… is not assignable to type '"the path parameters are read with another type than the strings they arrive as"'`](#-is-not-assignable-to-type-the-path-parameters-are-read-with-another-type-than-the-strings-they-arrive-as)
- [`the plugin reads "…", which this app's context does not give: add the plugin or middleware that gives it first`](#the-plugin-reads--which-this-apps-context-does-not-give-add-the-plugin-or-middleware-that-gives-it-first)
- [`the plugin reads "…", which this app's context gives with another type`](#the-plugin-reads--which-this-apps-context-gives-with-another-type)
- [`this app's context does not give what the plugin reads`](#this-apps-context-does-not-give-what-the-plugin-reads)
- [`the plugin's … reads its context as any: annotate what it reads, or leave it unannotated`](#the-plugins--reads-its-context-as-any-annotate-what-it-reads-or-leave-it-unannotated)
- [`… is not assignable to type 'ProvidedBy<C, …>'`](#-is-not-assignable-to-type-providedbyc-)
- [`Type 'Promise<Next<…>>' is not assignable to type 'unique symbol'`](#type-promisenext-is-not-assignable-to-type-unique-symbol)
- [`Type 'undefined' is not assignable to type '…'`](#type-undefined-is-not-assignable-to-type--on-routeoperation-), and `'body' is possibly 'undefined'`, on `route(operation, …)`
- [`Type '…' is not assignable to type 'never'` in a route's options](#type--is-not-assignable-to-type-never-in-a-routes-options)
- [`Argument of type 'Middleware<…>[]' is not assignable to parameter of type 'OptionsOnly<FunctionLike | RouteOptions>'`](#argument-of-type-middleware-is-not-assignable-to-parameter-of-type-optionsonlyfunctionlike--routeoptions)
- [`… is not assignable to parameter of type '"at most 8 middlewares per route: group them with compose(...)"'`](#-is-not-assignable-to-parameter-of-type-at-most-8-middlewares-per-route-group-them-with-compose), a ninth middleware (`Expected 20 arguments, but got 11` before 0.5)
- [`… is not assignable to type '"this looks like a factory given uncalled: call it, as use(cors()) and not use(cors)"'`](#-is-not-assignable-to-type-this-looks-like-a-factory-given-uncalled-call-it-as-usecors-and-not-usecors)
- [`Type 'string' is not assignable to type '"a middleware returns next(), a reply or a Response"'`](#type-string-is-not-assignable-to-type-a-middleware-returns-next-a-reply-or-a-response)
- [`Type 'string' is not assignable to type '{ readonly refused: "validate() and responds() belong to a route: …"; }'`](#type-string-is-not-assignable-to-type--readonly-refused-validate-and-responds-belong-to-a-route-give-them-among-its-middlewares-not-to-use-), on `use(validate(…))`
- [`Type 'string' is not assignable to type 'MiddlewareReturn'`](#type-string-is-not-assignable-to-type-middlewarereturn)
- [`'response' does not exist in type 'RouteOperation | RequestSchemas'`](#response-does-not-exist-in-type-routeoperation--requestschemas)
- [`route() needs the path as a literal: declare the operation as const`](#route-needs-the-path-as-a-literal-declare-the-operation-as-const)
- [`route() needs one method: declare the operation as const`](#route-needs-one-method-declare-the-operation-as-const)
- [`Argument of type '"…"' is not assignable to parameter of type '"Invalid path: …"'`](#argument-of-type--is-not-assignable-to-parameter-of-type-invalid-path-)
- [`… is not assignable to type '"Invalid middleware: a middleware given a path may add nothing to the context, …"'`](#-is-not-assignable-to-type-invalid-middleware-a-middleware-given-a-path-may-add-nothing-to-the-context-)
- [`Type 'Alxia<Empty, "">' provides no match for the signature '(ctx: BaseContext & Empty, next: NextFunction): MiddlewareReturn'`](#type-alxiaempty--provides-no-match-for-the-signature-ctx-basecontext--empty-next-nextfunction-middlewarereturn), on `use(app)`
- [`Target signature provides too few arguments. Expected 2 or more, but got 1.`](#target-signature-provides-too-few-arguments-expected-2-or-more-but-got-1), on `plugin(middleware)`
- [`Property 'part' does not exist on type 'Refusal'`](#property-part-does-not-exist-on-type-refusal)
- [`The inferred type of '…' cannot be named without a reference to '…' from '…/@alxia/core/dist/…'`](#the-inferred-type-of--cannot-be-named-without-a-reference-to--from-alxiacoredist)
- [`Module '"@alxia/core"' has no exported member 'RoutesOf'`](#module-alxiacore-has-no-exported-member-routesof), and the names removed in 0.5
- [`Generic type 'Alxia<Ctx, Prefix>' requires between 0 and 2 type arguments`](#generic-type-alxiactx-prefix-requires-between-0-and-2-type-arguments)
- [`'app' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer`](#app-implicitly-has-type-any-because-it-does-not-have-a-type-annotation-and-is-referenced-directly-or-indirectly-in-its-own-initializer), with `Register`
- [`Property '…' does not exist on type 'BaseContext & { readonly 'Register.context must be typeof base, …': never; }'`](#property--does-not-exist-on-type-basecontext---readonly-registercontext-must-be-typeof-base--never-)
- [`Subsequent property declarations must have the same type.  Property 'context' must be of type '…'`](#subsequent-property-declarations-must-have-the-same-type--property-context-must-be-of-type-)
- [`Property 'db' does not exist on type 'BaseContext'.`](#property-db-does-not-exist-on-type-basecontext), with `Register`

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
- [`GET /…: middleware 1 is not a function: a middleware is (ctx, next) => …, or a validate() or responds()`](#get--middleware-1-is-not-a-function-a-middleware-is-ctx-next---or-a-validate-or-responds)
- [`GET /…: a route takes its middlewares after the path, not in a list: drop the brackets`](#get--a-route-takes-its-middlewares-after-the-path-not-in-a-list-drop-the-brackets)
- [`GET /…: the options hold no schema (body): give validate(…) and responds(…) among the middlewares`](#get--the-options-hold-no-schema-body-give-validate-and-responds-among-the-middlewares)
- [``WS /…: responds() checks replies, and a socket route sends none: check its messages with the `send` option``](#ws--responds-checks-replies-and-a-socket-route-sends-none-check-its-messages-with-the-send-option)
- [`defineMiddleware(): the middleware is not a function`](#definemiddleware-the-middleware-is-not-a-function)
- [`validate(): the schemas are not an object`](#validate-the-schemas-are-not-an-object), and `responds(): …`
- [`GET /…: the handler is missing`](#get--the-handler-is-missing)
- [`POST /…: bodyLimit must be a whole number of bytes, 0 or more; got …`](#post--bodylimit-must-be-a-whole-number-of-bytes-0-or-more-got-)
- [``alxia(): errors must be 'json' or 'problem', not "…"``](#alxia-errors-must-be-json-or-problem-not-)
- [``alxia(): dev must be true or false, not "…"``](#alxia-dev-must-be-true-or-false-not-)
- [`listen(): shutdownTimeout must be a number of milliseconds, 0 or more; got …`](#listen-shutdowntimeout-must-be-a-number-of-milliseconds-0-or-more-got-)
- [`health(): timeout must be a number of milliseconds, 0 or more; got …`](#health-timeout-must-be-a-number-of-milliseconds-0-or-more-got-), and `health(): cache …`
- [`group(): build is missing`](#group-build-is-missing)
- [`use(): argument 1 is an app: a plugin is given to app.plugin(), use() takes middlewares`](#use-argument-1-is-an-app-a-plugin-is-given-to-appplugin-use-takes-middlewares)
- [`use(): argument 1 is not a function: a middleware is (ctx, next) => …`](#use-argument-1-is-not-a-function-a-middleware-is-ctx-next--)
- [`use(): argument 1 is a validate() or responds(), which belongs to a route`](#use-argument-1-is-a-validate-or-responds-which-belongs-to-a-route)
- [`use(): argument 1 looks like a factory (…): call it, use(…())`](#use-argument-1-looks-like-a-factory--call-it-use), and `GET /…: middleware 1 looks like a factory …`, `plugin(): argument 1 looks like a factory …`
- [`compose(): no middleware is given`](#compose-no-middleware-is-given-and-compose-argument-1-is-not-a-function-a-middleware-is-ctx-next--), and `compose(): argument 1 is not a function …`
- [`markFactory(): the factory is not a function`](#markfactory-the-factory-is-not-a-function)
- [`use(): no middleware is given`](#use-no-middleware-is-given), and `use("/a/*/b"): "/a/*/b": "*" may only end a path`
- [`use("/admin/"): a path given to use() does not end with "/"`](#useadmin-a-path-given-to-use-does-not-end-with-)
- [`plugin(): a plugin is given alone: an app or a function that returns one; middlewares are given to use()`](#plugin-a-plugin-is-given-alone-an-app-or-a-function-that-returns-one-middlewares-are-given-to-use), and `plugin(): nothing is given: …`
- [`plugin(): the plugin is neither an app nor a function that returns one; a middleware is given to use()`](#plugin-the-plugin-is-neither-an-app-nor-a-function-that-returns-one-a-middleware-is-given-to-use)
- [`plugin(): the plugin function returned undefined, not an app: a plugin returns the app it is given; a middleware is given to use()`](#plugin-the-plugin-function-returned-undefined-not-an-app-a-plugin-returns-the-app-it-is-given-a-middleware-is-given-to-use), and `… returned a promise, …`
- [`responds(): the operation GET /… declares no response`](#responds-the-operation-get--declares-no-response)
- [`page(): /… is already served`](#page--is-already-served)
- [`GET /… is already served by a page`](#get--is-already-served-by-a-page)

**Responses**

- [`400 {"error":"validation","issues":[…]}`](#400-errorvalidationissues)
- [A route still answers `{"error":"validation"}` after a middleware that catches refusals](#a-route-still-answers-errorvalidation-after-a-middleware-that-catches-refusals)
- [`413 {"error":"content_too_large","limit":…}`](#413-errorcontent_too_largelimit)
- [`404 {"error":"not_found"}`](#404-errornot_found)
- [`405 {"error":"method_not_allowed"}`](#405-errormethod_not_allowed)
- [`426 {"error":"upgrade_required"}`](#426-errorupgrade_required)
- [`416 {"error":"range_not_satisfiable"}`](#416-errorrange_not_satisfiable)
- [`500 {"error":"internal"}`](#500-errorinternal)
- [A 404 carries a `hint`, a 500 a `stack` or an HTML page](#a-404-carries-a-hint-a-500-a-stack-or-an-html-page)
- [`503 {"status":"shutting_down","checks":{}}`](#503-statusshutting_downchecks) on `/ready`
- [`503 {"status":"down",…}`](#503-statusdown) on `/ready`
- [A client generated with `@nxgt/openapi-codegen` refuses the 400 after `errors: 'problem'`](#a-client-generated-with-nxgtopenapi-codegen-refuses-the-400-after-errors-problem)
- [A plugin's route reads a body past the app's `bodyLimit()`](#a-plugins-route-reads-a-body-past-the-apps-bodylimit)

**Middlewares**

- [`set.cookies.get()` returns null in a middleware](#setcookiesget-returns-null-in-a-middleware)
- [A `use(path)` guard did not run on a request under its path](#a-usepath-guard-did-not-run-on-a-request-under-its-path)
- [A `use(path)` guard runs on a path spelled otherwise, or in another case](#a-usepath-guard-runs-on-a-path-spelled-otherwise-or-in-another-case)
- [`use(): the middleware runs on the routes declared after it …`](#use-the-middleware-runs-on-the-routes-declared-after-it-and-on-requests-no-route-matches-not-on-the--declared-before-it), a warning
- [A path that does not exist answers `401`, not `404`](#a-path-that-does-not-exist-answers-401-not-404)
- [A middleware's `try`/`catch` never sees the error](#a-middlewares-trycatch-never-sees-the-error)
- [A middleware's `try`/`catch` sees an `AbortError` when the client left](#a-middlewares-trycatch-sees-an-aborterror-when-the-client-left)
- [`Type 'string | undefined' is not assignable to type 'string'` on `ctx.route`](#type-string--undefined-is-not-assignable-to-type-string-on-ctxroute)
- [A `use()` did not run for a route](#a-use-did-not-run-for-a-route)

**Routing**

- [A route other than the one declared first answers](#a-route-other-than-the-one-declared-first-answers)

**Server log**

- [`ResponseValidationError: … the 200 reply does not match its schema`](#responsevalidationerror--the-200-reply-does-not-match-its-schema)
- [`ResponseValidationError: … declares no 201 reply`](#responsevalidationerror--declares-no-201-reply)
- [`TypeError: … a middleware (…) returned nothing: return next(), a reply or a Response`](#typeerror--a-middleware--returned-nothing-return-next-a-reply-or-a-response)
- [`TypeError: … a middleware (…) returned function: it looks like a factory given uncalled, …`](#typeerror--a-middleware--returned-function-it-looks-like-a-factory-given-uncalled-call-it-)
- [`TypeError: compose() runs among a route's middlewares or in use(), not called on its own`](#typeerror-compose-runs-among-a-routes-middlewares-or-in-use-not-called-on-its-own)
- [`TypeError: … a middleware called next() twice`](#typeerror--a-middleware-called-next-twice)
- [`TypeError: … a middleware called next() after it returned`](#typeerror--a-middleware-called-next-after-it-returned)
- [`GET /…: a middleware returned before the next() it called settled: the rest of the route ran anyway; await next(), or return it`](#get--a-middleware-returned-before-the-next-it-called-settled-the-rest-of-the-route-ran-anyway-await-next-or-return-it), a warning
- [`TypeError: validate() runs among a route's middlewares, not called on its own`](#typeerror-validate-runs-among-a-routes-middlewares-not-called-on-its-own), and `responds() …`
- [`TypeError: … the handler returned no reply. Return ctx.reply(status, body).`](#typeerror--the-handler-returned-no-reply-return-ctxreplystatus-body)
- [`TypeError: Body already used`](#typeerror-body-already-used), with `500 {"error":"internal"}`
- [`TypeError: An event does not match its schema`](#typeerror-an-event-does-not-match-its-schema)
- [`TypeError: An event id must not hold a line break or a NUL`](#typeerror-an-event-id-must-not-hold-a-line-break-or-a-nul), and `An event id must be a string`
- [`TypeError: An event retry must be a whole number of milliseconds, 0 or more`](#typeerror-an-event-retry-must-be-a-whole-number-of-milliseconds-0-or-more)
- [`TypeError: The event "…" is not declared: …`](#typeerror-the-event--is-not-declared-), and `An event of a named stream is an object { event, data }`
- [`TypeError: An event name must not hold a line break or a NUL`](#typeerror-an-event-name-must-not-hold-a-line-break-or-a-nul), and `An event name must not be empty`, `A named event stream declares at least one event`, `The event "…" is not a Standard Schema`
- [`Type 'string' is not assignable to type '"ping"'` on a named stream](#type-string-is-not-assignable-to-type-ping-on-a-named-stream)

**Shutting down**

- [The process exits before my own `SIGTERM` handler finishes](#the-process-exits-before-my-own-sigterm-handler-finishes)
- [Shutdown takes 10 seconds](#shutdown-takes-10-seconds)

**WebSockets**

- [`{"error":"validation", … "code":"invalid_json","message":"The message is not valid JSON"}`](#errorvalidation--codeinvalid_jsonmessagethe-message-is-not-valid-json)
- [Close code `1011`, `internal error`](#close-code-1011-internal-error)

## Types

These are compile errors on purpose: the types refuse a route the runtime
could not honour. Each one below is what `tsc` prints.

### `the params schema must accept the parameters of "…", which arrive as strings`

**When:** the `params` schema of an operation given to `route()` expects
something other than a string for a path parameter, or requires a key the
path does not have. The same mistake in `validate({ params })` is reported
as
[`"the path parameters are read with another type than the strings they arrive as"`](#-is-not-assignable-to-type-the-path-parameters-are-read-with-another-type-than-the-strings-they-arrive-as).

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

**When:** the `params` schema of an operation given to `route()` has an
optional key the path does not declare. In `validate({ params })` the same
key is refused as
[``"the path parameter `org` is not in this route's path"``](#-is-not-assignable-to-type-the-path-parameter-id-is-not-in-this-routes-path).

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

### `'quey' does not exist in type 'OptionsOnly<FunctionLike | RouteOptions>'`

**When:** a route's options, the object after its path, hold a key that is
neither `bodyLimit` nor `detail`:

```text
error TS2561: Object literal may only specify known properties, but 'quey' does not exist in type 'OptionsOnly<FunctionLike | RouteOptions>'. Did you mean to write 'query'?
```

When the options are a variable, TypeScript prints `Argument of type '{ quey: … }'
is not assignable to parameter of type 'OptionsOnly<FunctionLike | RouteOptions>'`.
A schema part spelled right, `{ query }`, is refused otherwise:
[`… is not assignable to type 'never'`](#type--is-not-assignable-to-type-never-in-a-routes-options).
In `validate`, the same key is
[`'quey' does not exist in type 'RouteOperation | RequestSchemas'`](#response-does-not-exist-in-type-routeoperation--requestschemas).

**Why:** the options are the route's configuration. A misspelt part would
never be validated, and the handler would read the raw value.

**Fix:** give the parts to `validate`, the statuses to `responds`, and
`bodyLimit` and `detail` to the options:

```ts
import { responds, validate } from '@alxia/core';

app.get('/users', { detail: { summary: 'Users' } }, validate({ query: z.object({ page: zq.int().optional() }) }), responds({ 200: z.array(User) }), handler);
```

### `'299' does not exist in type 'RouteOperation | ResponseSchemas'`

**When:** `responds(…)` declares a key that is not an HTTP status.

```text
error TS2353: Object literal may only specify known properties, and '299' does not exist in type 'RouteOperation | ResponseSchemas'.
```

TypeScript may print the union the other way round,
`'ResponseSchemas | RouteOperation'`. The handler's `reply` then takes no
status, `Argument of type '200' is not assignable to parameter of type
'never'`, which goes away with the fix. When the schemas are a variable,
the message is `"299 is not an HTTP status"`.

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

### `Property 'user' does not exist on type 'RouteBase<…>'`

**When:** a middleware written inline in the route, or the handler, reads
a key that nothing before it adds: a middleware **after** it, a `derive`,
`decorate` or `use` declared after the route, or nothing at all.

```ts
app.post('/posts', ({ user }, next) => next({ id: user.id }), auth, handler);
```

```text
error TS2339: Property 'user' does not exist on type 'RouteBase<RouteApp<"POST", Empty, "">, "/posts">'.
```

A handler gets the same error, on `RouteBase<RouteApp<"GET", …>, "/me">`. An
inline middleware given to `use` names the app's context,
`Property 'user' does not exist on type 'BaseContext & Empty'`, and a
route declared by `route(operation, …)` names
`Omit<RouteBase<OperationApp<…>, "/me">, "params" | … | "body"> & { …; } & Empty`.
A middleware made by `defineMiddleware<Requires>()`, which names what it
reads, is reported where it stands instead:
[``"`user` is missing from the context: …"``](#-is-not-assignable-to-type-user-is-missing-from-the-context-add-a-middleware-that-gives-it-before-this-one).

**Why:** a route's middlewares run in the order given, and each one reads
only what the middlewares in force and the ones before it added. A `use`,
a `derive` or a `decorate` applies only to the routes declared after it.
Here `user` would be `undefined` at runtime too.

**Fix:** put the middleware that adds the key first, or declare it before
the route:

```ts
app.post('/posts', auth, ({ user }, next) => next({ id: user.id }), handler);

alxia()
	.use(auth)
	.get('/me', ({ user, reply }) => reply(200, user));
```

The same applies to `plugin(app)`. Its `derive`s and middlewares reach the routes
declared after `plugin`, not before it — and none at all when the plugin
has a prefix of its own, `alxia({ prefix: '/todos' })` or
`defineRoutes('/todos')`: such a plugin keeps them under its prefix, as a
group does, so a route after it reads none of what they add:

```ts
const todos = alxia({ prefix: '/todos' }).use(auth).get('/', listTodos);
alxia().plugin(todos).get('/me', ({ user, reply }) => reply(200, user));
// Property 'user' does not exist on type …: auth runs under /todos alone
```

Give `auth` to the app before both, or mount a plugin without a prefix
(`alxia().use(auth)`), whose middlewares are the app's.

### ``… is not assignable to type '"`user` is missing from the context: add a middleware that gives it before this one"'``

**When:** a middleware that names what it reads — made by
`defineMiddleware<Requires>()`, or one whose `ctx` is annotated — is
given where nothing before it gives a key it reads: to `use(…)`, a
route, a socket's upgrade or `route(operation, …)`. TypeScript reports one
error, on that middleware, whose last line names the key:

```ts
const canPost = defineMiddleware<{ user: User }>()(({ user, reply }, next) =>
	user.banned ? reply(403, { error: 'banned' as const }) : next());

app.post('/posts', canPost, auth, handler);
```

```text
error TS2345: Argument of type 'Middleware<{ user: User; }, …>' is not assignable to parameter of type 'Middleware<{ user: User; }, …> & Step<RouteBase<RouteApp<"POST", Empty, "">, "/posts">, MiddlewareContext<…>, …>'.
  …
          Type 'Reply<403, { readonly error: "banned"; }>' is not assignable to type '"`user` is missing from the context: add a middleware that gives it before this one"'.
```

The type before the message is what the middleware returns, here its
`Reply<403, …>`; one that only calls `next` prints
`Type 'Promise<Next<Empty, Empty>>' is not assignable to type '"`user` is
missing …"'`. On `use(…)`, the context named in `Step<…>` is the app's,
`BaseContext & Empty`. TypeScript may add `Binding element 'reply'
implicitly has an 'any' type` on the handler: it goes away with the fix.
A middleware that reads several missing keys names each, one message per
key, joined by `|`.

**Why:** the error is reported where the middleware stands: at that place
the context has no `user`, so it would read `undefined`.

**Fix:** put the middleware that gives the key before it — on the route,
or in a `use` before the route:

```ts
app.post('/posts', auth, canPost, handler);
app.use(auth).post('/drafts', canPost, handler);
```

### ``… is not assignable to type '"`user` is in the context with another type than this middleware reads"'``

**When:** the context in force gives the key a middleware reads, but of a
type that does not satisfy it: a `user: number` where it reads
`user: { id: string }`, or a `User | null` where it reads a `User`.

```ts
const numericUser = defineMiddleware((_ctx, next) => next({ user: { id: 1 } }));
const needsUser = defineMiddleware<{ user: { id: string } }>()(({ user }, next) => next({ name: user.id }));

app.get('/b', numericUser, needsUser, handler);
```

```text
error TS2345: Argument of type 'Middleware<{ user: { id: string; }; }, …>' is not assignable to parameter of type 'Step<…>'.
  Type 'Promise<Next<{ name: string; }, Empty>>' is not assignable to type 'Promise<Next<{ name: string; }, Empty>> & "`user` is in the context with another type than this middleware reads"'.
```

**Why:** the middleware would read a value of the wrong shape.

**Fix:** make the middleware that gives the key give the type the other
one reads — here, answer 401 rather than pass a `null` — or name the type
the context gives in the reader's `Requires`:

```ts
const auth = defineMiddleware(async ({ request, reply }, next) => {
	const user = await authenticate(request); // User | null
	return user ? next({ user }) : reply(401, { error: 'unauthenticated' as const });
});
```

### `… is not assignable to type '"the context in force here does not give what this middleware reads"'`

**When:** as for the two entries above, but the middleware's `Requires`
has no key the message can name: a symbol key, or a union such as
`{ a: string } | { b: string }`.

```text
    Type 'Promise<Next<Empty, Empty>>' is not assignable to type '"the context in force here does not give what this middleware reads"'.
```

**Fix:** give what the middleware reads before it, or name its
requirement as an object type with string keys.

### ``… is not assignable to type '"the path parameter `id` is not in this route's path"'``

**When:** `validate({ params })` names a key the path does not declare, on
a route, a socket's upgrade or a route in a group, or a middleware made by
`defineMiddleware<{ pathParams: { id: string } }>()` is given to a route
whose path has no `:id`. Every key counts, optional or not: an
`extra: z.string().optional()` beside `/rooms/:room` is refused like a
required one.

```ts
app.get('/posts', validate({ params: z.object({ id: z.string() }) }), handler);
app.ws('/rooms/:room', validate({ params: z.object({ room: z.string(), extra: z.string().optional() }) }), handlers);
```

```text
error TS2345: Argument of type 'Middleware<{ readonly pathParams: { readonly id: string; }; }, …> & BuiltinMark<…>' is not assignable to parameter of type '… & Step<…>'.
  …
      Type 'Next<Validated<{ readonly params: ZodObject<{ id: ZodString; }, $strip>; }>, …>' is not assignable to type '"the path parameter `id` is not in this route's path"'.
```

On the socket, the message names `extra`.

**Why:** `validate`'s `params` schema reads the path's parameters. A key
the path does not declare is never there. A route under a group or a
prefix is checked by its whole path, the prefix's parameters included.

**Fix:** declare the parameter in the path, under the schema's name:

```ts
app.get('/posts/:id', validate({ params: z.object({ id: z.coerce.number() }) }), handler);
```

### `… is not assignable to type '"the path parameters are read with another type than the strings they arrive as"'`

**When:** `validate({ params })` reads a parameter with a schema whose
input is not a string, `z.number()` rather than `z.coerce.number()`, or a
`defineMiddleware<{ pathParams: { id: number } }>()` is given to a route.

```text
      Type 'Next<Validated<{ readonly params: ZodObject<{ id: ZodNumber; }, $strip>; }>, …>' is not assignable to type '"the path parameters are read with another type than the strings they arrive as"'.
```

**Why:** a path parameter is always a string. `z.number()` refuses `"42"`,
so the route would refuse every request; `pathParams`, read before or
after a `validate`, holds the strings the path carried.

**Fix:** coerce the string, with `zq` from `@alxia/zod` or with your
validator's own coercion, and read `pathParams` as strings:

```ts
import { defineMiddleware, validate } from '@alxia/core';
import { zq } from '@alxia/zod';

app.get('/posts/:id', validate({ params: z.object({ id: zq.int() }) }), ({ params, reply }) => reply(200, { id: params.id }));

const loadPost = defineMiddleware<{ pathParams: { id: string } }>()(({ pathParams }, next) =>
	next({ id: Number(pathParams.id) }),
);
```

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
message of the second is the one that matters.

A middleware given to `use` whose context the app does not give reads
otherwise:
[``"`user` is missing from the context: …"``](#-is-not-assignable-to-type-user-is-missing-from-the-context-add-a-middleware-that-gives-it-before-this-one).

Returned from a `group` or a plugin function, `group(() => todos)` or
`plugin(() => todos)`, the error is a `TS2322: Type 'AppWithRoute<…>' is not
assignable to type '… & { readonly '~requires': "the plugin reads …" }'`
on the returned app, with the same message.

For routes made by `defineRoutes()`, the last line reads
`Property ''~requires'' is missing in type 'Alxia<…>' but required in type '{ readonly '~requires': "the plugin reads \"user\", which this app's context does not give: add the plugin or middleware that gives it first"; }'`.

**Why:** the plugin's `derive` reads `user`, and on this app no plugin or
middleware before it adds one, so at runtime `user` would be `undefined`. The
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
      Type 'Alxia<{ user: { tenantId: string; }; } & { tenant: …; }, ""> & Requiring<{ user: { tenantId: string; }; }>' is not assignable to type 'ProvidedBy<C, { user: { tenantId: string; }; }>'.
```

**Why:** the check is a conditional type, and TypeScript does not decide a
conditional type on a type parameter, even when its bound would pass.

**Fix:** type the app with a concrete context, or as `AnyAlxia` and give
the function's return type yourself. `AnyAlxia` is not checked.

### `Type 'Promise<Next<…>>' is not assignable to type 'unique symbol'`

**When:** `defineMiddleware<Requires>(middleware)`: the requirement and the
function in one call.

```ts
defineMiddleware<{ user: User }>(({ user }, next) => next({ id: user.id }));
```

```text
error TS2345: Argument of type '({ user }: MiddlewareContext<{ user: User; }>, next: NextFunction) => Promise<Next<{ id: string; }, Empty>>' is not assignable to parameter of type 'Middleware<{ user: User; }, unique symbol>'.
  Type 'Promise<Next<{ id: string; }, Empty>>' is not assignable to type 'unique symbol'.
```

**Why:** TypeScript infers no type argument once one is given, so the
function's result could not be inferred beside `Requires`.

**Fix:** name the requirement first, then give the function:

```ts
defineMiddleware<{ user: User }>()(({ user }, next) => next({ id: user.id }));
```

### `Type 'undefined' is not assignable to type '…'` on `route(operation, …)`

**When:** a middleware given to `route(operation, m, handler)` reads `body`,
or the validated `params`, of the operation. The operation's `validate`
stands just before the handler, so a middleware before it reads the
request as it arrived: `body` is `undefined`, `params` strings.

```ts
app.route(op, ({ body }, next) => next({ title: body.title }), handler);
// error TS18048: 'body' is possibly 'undefined'.
app.route(op, (ctx, next) => { const body: { title: string } = ctx.body; return next({ body }); }, handler);
// error TS2322: Type 'undefined' is not assignable to type '{ title: string; }'.
```

**Fix:** place the operation's validation before the middleware:

```ts
app.route(op, validate(op), ({ body }, next) => next({ title: body.title }), handler);
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

### `Argument of type 'Middleware<…>[]' is not assignable to parameter of type 'OptionsOnly<FunctionLike | RouteOptions>'`

**When:** a route is given its middlewares in a list, the form of 0.3's
hooks: `app.get('/l', [auth], handler)`.

```text
error TS2345: Argument of type 'Middleware<Empty, …>[]' is not assignable to parameter of type 'OptionsOnly<FunctionLike | RouteOptions>'.
```

**Why:** a route takes its middlewares one by one after the path (and its
options); a list there is read as the options. Past the types, the route
throws when it is declared:
[`a route takes its middlewares after the path, not in a list`](#get--a-route-takes-its-middlewares-after-the-path-not-in-a-list-drop-the-brackets).

**Fix:** drop the brackets:

```ts
app.get('/l', auth, handler);
```

### `… is not assignable to parameter of type '"at most 8 middlewares per route: group them with compose(...)"'`

```text
error TS2345: Argument of type 'Middleware<Empty, Promise<Next<Empty, Empty>>>' is not assignable to parameter of type '"at most 8 middlewares per route: group them with compose(...)"'.
```

**When:** a route, a route with options, `ws` or `route(operation, …)` is
given nine middlewares or more: the error is on the ninth. On `use(m1, …,
m9)`, whose path form takes any number, TypeScript prints `No overload
matches this call` with this message under the first overload. Before
0.5 the same call read `Expected 20 arguments, but got 11`.

**Why:** the types thread the context one middleware at a time, through
eight at most per call, to keep the check cheap and finite.

**Fix:** join some with `compose(...)`, one middleware typed for any
number of them, spliced into the chain where it stands; or move what
every route of a set shares into a `use`, which accumulates:

```ts
const guarded = compose(session, csrf, auth, tenant, audit);
app.patch('/posts/:id', guarded, canEdit, loadPost, validate({ body: Update }), handler);
```

### `… is not assignable to type '"this looks like a factory given uncalled: call it, as use(cors()) and not use(cors)"'`

```text
error TS2345: Argument of type '(options?: CorsOptions | undefined) => CorsMiddleware' is not assignable to parameter of type '…'.
  …
    Type 'CorsMiddleware' is not assignable to type '"this looks like a factory given uncalled: call it, as use(cors()) and not use(cors)"'.
```

**When:** a function that makes a middleware is given in its place,
uncalled: `use(cors)`, `get('/x', logger, handler)`. The message names
`cors` as the example, whichever factory it is.

**Why:** a middleware returns `next()`, a reply or a `Response`; a function
that returns a function is a factory. At runtime a marked factory throws
where it is declared ([`use(): argument 1 looks like a factory
(…)`](#use-argument-1-looks-like-a-factory--call-it-use)).

**Fix:** call it, with no options for the defaults: `use(cors())`.

### `Type 'string' is not assignable to type '"a middleware returns next(), a reply or a Response"'`

```text
error TS2345: Argument of type '() => string' is not assignable to parameter of type '…'.
    Type 'string' is not assignable to type '"a middleware returns next(), a reply or a Response"'.
```

**When:** a middleware written inline in a route, `use` or `ws` returns a
plain value, an object or nothing. One made by `defineMiddleware` is
refused by its own type, [below](#type-string-is-not-assignable-to-type-middlewarereturn).

**Fix:** return `next()`, a reply or a `Response`.

### `Type 'string' is not assignable to type '{ readonly refused: "validate() and responds() belong to a route: give them among its middlewares, not to use()"; }'`

```text
error TS2345: Argument of type 'Middleware<Empty, Next<Validated<{}>, {}>> & BuiltinMark<"validate">' is not assignable to parameter of type '…'.
  Type '…' is not assignable to type '{ readonly '~builtin'?: { readonly refused: "validate() and responds() belong to a route: …"; }; }'.
    Types of property ''~builtin'' are incompatible.
```

**When:** `use` is given a `validate(…)` or a `responds(…)`, or a
`compose(…)` that holds one. It also [throws when
declared](#use-argument-1-is-a-validate-or-responds-which-belongs-to-a-route).

**Fix:** give the schemas to the route, among its middlewares:
`app.use(auth).post('/posts', validate({ body: Post }), handler)`.

### `Type 'string' is not assignable to type 'MiddlewareReturn'`

**When:** a middleware made by `defineMiddleware` returns something other
than what `next()` resolves to, a reply or a `Response`: a plain value, an
object, or nothing. The message ends in `'unique symbol |
MiddlewareReturn'`; written inline in a route, it reads [`… '"a middleware
returns next(), a reply or a Response"'`](#type-string-is-not-assignable-to-type-a-middleware-returns-next-a-reply-or-a-response):

```ts
defineMiddleware(() => 'nothing');
```

```text
error TS2345: Argument of type '() => string' is not assignable to parameter of type 'Middleware<Empty, unique symbol | MiddlewareReturn>'.
  Type 'string' is not assignable to type 'unique symbol | MiddlewareReturn'.
```

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

### `'response' does not exist in type 'RouteOperation | RequestSchemas'`

**When:** `validate` is given a key that is not a part of the request,
such as `response`, or a misspelt `quey`.

```text
error TS2353: Object literal may only specify known properties, and 'response' does not exist in type 'RouteOperation | RequestSchemas'.
```

When the schemas are a variable that also holds a part, the message is
`"response" is not a part validate() reads: params, query, headers, cookies or body`.

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
      Type 'Middleware<Empty, Promise<Next<{ user: User; }, Empty>> | Reply<401, …>>' is not assignable to type '"Invalid middleware: a middleware given a path may add nothing to the context, and this one passes \"user\" to next(): give it to the routes of a group instead, app.group(path, (group) => group.use(middleware))"'.
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

### `Type 'Alxia<Empty, "">' provides no match for the signature '(ctx: BaseContext & Empty, next: NextFunction): MiddlewareReturn'`

**When:** `use` is given an app: `app.use(auth)` where `auth` is
`alxia().derive(…)`, the 0.3 way of mounting a plugin.

```text
error TS2345: Argument of type 'Alxia<Empty, "">' is not assignable to parameter of type 'Alxia<Empty, ""> & Step<BaseContext & Empty, BaseContext & Empty, MiddlewareReturn>'.
  …
    Type 'Alxia<Empty, "">' provides no match for the signature '(ctx: BaseContext & Empty, next: NextFunction): MiddlewareReturn'.
```

**Why:** `use` takes middlewares alone; a plugin is mounted by
`app.plugin(…)`. Past the types, `use` throws
[`use(): argument 1 is an app: …`](#use-argument-1-is-an-app-a-plugin-is-given-to-appplugin-use-takes-middlewares).

**Fix:**

```ts
app.plugin(auth);
```

### `Target signature provides too few arguments. Expected 2 or more, but got 1.`

**When:** `plugin` is given a middleware, `app.plugin(cors())`, the 0.3
way of installing a package's hooks:

```text
error TS2769: No overload matches this call.
  Overload 1 of 2, '(plugin: (app: Alxia<Empty, "">) => AnyAlxia): AnyAlxia', gave the following error.
    Argument of type 'Middleware<…>' is not assignable to parameter of type '(app: Alxia<Empty, "">) => AnyAlxia'.
      Target signature provides too few arguments. Expected 2 or more, but got 1.
  Overload 2 of 2, '(plugin: Alxia<object, string> & …)', gave the following error.
    …
```

**Why:** a middleware runs on every request; a plugin once, on the app,
and returns it. Past the types, `plugin` calls the middleware with the
app, and throws
[`plugin(): the plugin function returned a promise, not an app`](#plugin-the-plugin-function-returned-undefined-not-an-app-a-plugin-returns-the-app-it-is-given-a-middleware-is-given-to-use),
or, for one that calls `next` right away, `plugin(): the plugin function called next()`.

**Fix:** give it to `use`, before the routes:

```ts
app.use(cors()).get('/', ({ reply }) => reply(200, 'ok'));
```

### `Property 'part' does not exist on type 'Refusal'`

**When:** a middleware that catches refusals reads `refusalOf(error)`'s
`part` or `issues` without checking its `kind`:

```text
error TS2339: Property 'part' does not exist on type 'Refusal'.
  Property 'part' does not exist on type 'BodyLimitRefusal'.
```

**Why:** `refusalOf` reads every kind of refusal. A `body_limit` refusal, a
body past the route's `bodyLimit`, has a `limit` and no `part` or
`issues`.

**Fix:** check `kind` first, and rethrow what you leave to its default:

```ts
import { defineMiddleware, problem, refusalOf } from '@alxia/core';

const refusals = defineMiddleware(async (_ctx, next) => {
	try {
		return await next();
	} catch (error) {
		const refusal = refusalOf(error);
		if (refusal?.kind !== 'validation') throw error;
		return problem({ status: 400, detail: `the ${refusal.part} is invalid` });
	}
});
```

### `The inferred type of '…' cannot be named without a reference to '…' from '…/@alxia/core/dist/…'`

**When:** `tsc` with `declaration: true` (a library, or a project with
`composite`), on an exported function or constant whose type is an app
inferred from its builders: TS2883, *"This is likely not portable. A type
annotation is necessary."*

**Why:** the declaration of that export must name every type the app's
type is made of, through `@alxia/core` itself, which exports each of them
(`AppWithRoute`, `RouteApp`, `MiddlewareForms`, `Next`, …).

**Fix:** a type core fails to export is a bug: report it with the code.
Until then, annotate the export, for example as `AnyAlxia`, or as
`Alxia<Ctx, Prefix>` with the context it builds.

### `Module '"@alxia/core"' has no exported member 'RoutesOf'`

**When:** code written for 0.3 imports `RoutesOf`, or another type that
described a route to a client — `RouteEntryOf`, `RouteRecord`,
`RouteTable`, `RouteInput`, `RouteOutput`, `Outcome`, `OutcomeOf`,
`SocketRecord`, `SocketEntryOf`, `RefusalOutcome`, `KindOutcome`,
`DefaultRefusalOutcome`, `DefaultLimitOutcome`, `IsLimited`,
`BehindShortcuts`, `AppWithSocket`, or `@alxia/graphql`'s `GraphQLRoutes`
— from `@alxia/core` 0.4 or later. Code written for 0.4 that imports a
type of the request hooks or the forms 0.5 removed gets the same error,
naming it: `RouteHook`, `RefusalHook`, `RefusalSchema`, `WrapMethod`,
`DeprecatedForms`, `PluginForms`, … (the list is in
[Upgrading](upgrading.md)).

```text
error TS2305: Module '"@alxia/core"' has no exported member 'RoutesOf'.
```

**Why:** alxia is OpenAPI spec first. A route adds nothing to the app's
type, and the route table, its types and the typed client are gone: a
client is generated from the OpenAPI document.

**Fix:** for a 0.5 removal, write the middleware form
([Upgrading](upgrading.md)). For the route table, generate the client from the document, for example with
`@nxgt/openapi-codegen`; check a route in a test with `app.request()`, and
what its handler reads with `expectTypeOf` inside it. See
[No more client: spec first](upgrading.md#no-more-client-spec-first).

### `Generic type 'Alxia<Ctx, Prefix>' requires between 0 and 2 type arguments`

**When:** code written for 0.4 names an app with three type arguments,
as 0.4's `Alxia` took, or with the four of 0.3:

```ts
type Fresh = Alxia<Empty, '', never>;
```

```text
error TS2707: Generic type 'Alxia<Ctx, Prefix>' requires between 0 and 2 type arguments.
```

**Why:** 0.5 removed the third parameter, which carried the
replies of the request hooks 0.5 removed: `Alxia` is `Alxia<Ctx, Prefix>`. 0.4
had removed the second of 0.3's, `Routes`.

**Fix:** drop the third argument (and, from 0.3, the second):

```ts
type Fresh = Alxia<Empty, ''>;
```

See [Upgrading](upgrading.md).

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
`defineMiddleware<AppContext>()` or a `defineRoutes()` given to `base`. A
plain `defineMiddleware(fn)` given to `base` reads `Register` too, and
fails otherwise:
[`Property 'db' does not exist on type 'BaseContext'.`](#property-db-does-not-exist-on-type-basecontext).
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
error TS2717: Subsequent property declarations must have the same type.  Property 'context' must be of type 'Alxia<Empty & { user: string; }, "">', but here has type 'Alxia<Empty & { tenant: string; }, "">'.
```

**Why:** a program has one `Register`, and it names one context.

**Fix:** keep one declaration, beside the base. Two apps in one
repository each get their own `tsconfig.json`, so each is its own program;
a package shared by both names what it reads with
`definePlugin<Requires>()`, not `Register`.

### `Property 'db' does not exist on type 'BaseContext'.`

**When:** with `Register` augmented, every `defineMiddleware(fn)` that
reads a key of the registered context fails with it, on each key, and the
`@ts-expect-error` a route that does not give the context had becomes
unused:

```text
middlewares.ts(6,50): error TS2339: Property 'db' does not exist on type 'BaseContext'.
middlewares.ts(6,54): error TS2339: Property 'user' does not exist on type 'BaseContext'.
```

**Why:** `defineMiddleware(fn)`, with no type argument, reads the
registered context: the context of the base `Register` names. A
middleware the base itself is built with, `base.use(requestId)`, then
reads the type of the base it is part of, so the registration resolves to
nothing and every middleware reads `BaseContext` alone.

**Fix:** a middleware the registered base is built with says it reads
nothing of it, `defineMiddleware<Empty>()(fn)` (or names what it reads,
`defineMiddleware<{ db: Db }>()(fn)`):

```ts
// src/context.ts
import { alxia, defineMiddleware, type Empty } from '@alxia/core';

const requestId = defineMiddleware<Empty>()((ctx, next) =>
	next({ requestId: ctx.request.headers.get('x-request-id') ?? 'none' }),
);

export const base = alxia().decorate({ db }).use(requestId);

declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}

// src/middlewares.ts — reads the registered context, no generic needed
export const profile = defineMiddleware(({ db, requestId }, next) => next({ profile: db.find(requestId) }));
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
be declared at, after their own name (`implemented(): …`, `matchesSpec(): …`).

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

### `GET /…: middleware 1 is not a function: a middleware is (ctx, next) => …, or a validate() or responds()`

**When:** a route is given, between its path (or options) and its handler,
something that is not a function: a string, a second object, a schema
handed bare instead of `validate({ body: Post })`. The count starts after
the options, so `middleware 1` is the first middleware. A socket route
reports `WS /…: …`.

**Why:** each argument between the options and the last is a middleware,
run in turn. Only the first object after the path is read as the options.

**Fix:** make it a middleware, or wrap the schema:

```ts
import { validate } from '@alxia/core';

app.post('/posts', auth, validate({ body: Post }), handler);   // not app.post('/posts', auth, { body: Post }, handler)
```

### `GET /…: a route takes its middlewares after the path, not in a list: drop the brackets`

**When:** a route, a socket or `route(operation, …)` is given an array
among its arguments: `app.get('/', [auth], handler)`, the list of hooks of
0.3. `route(operation, [auth], handler)` names the operation:
`GET /pets/:petId: a route takes its middlewares …`. The types refuse it
first ([`Middleware<…>[]` is not assignable to …](#argument-of-type-middleware-is-not-assignable-to-parameter-of-type-optionsonlyfunctionlike--routeoptions)),
so this comes from JavaScript or a cast. It throws where the route is
declared.

**Why:** 0.5 removed the list form. A route reads its middlewares one by
one, after the path and its options.

**Fix:** drop the brackets:

```ts
app.get('/posts/:id', loadPost, auth, handler);
```

See [Upgrading](upgrading.md).

### `GET /…: the options hold no schema (body): give validate(…) and responds(…) among the middlewares`

```text
POST /posts: the options hold no schema (body, response): give validate(…) and responds(…) among the middlewares
```

**When:** a route's options — the object after its path — hold a schema
part: `params`, `query`, `headers`, `cookies`, `body` or `response`. The
message names each. This is also the 0.3 form, a schema before the
handler, `app.get('/', { params }, handler)`, and a socket's schema,
`WS /…: …`. The types refuse it
([`… is not assignable to type 'never'`](#type--is-not-assignable-to-type-never-in-a-routes-options));
plain JavaScript or a cast reaches the runtime, which refuses it where the
route is declared.

**Why:** the options are the route's configuration, `bodyLimit` and
`detail` (and a socket's `message` and `send`). A schema is a middleware,
`validate(…)` or `responds(…)`, so it stands where it runs.

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

### ``alxia(): errors must be 'json' or 'problem', not "…"``

**When:** `alxia({ errors })` is given anything but `'json'` or `'problem'`:
a misspelt `'problems'`, `true`, or a value read from the environment that
is unset.

**Why:** the option picks the shape of the app's own answers, and no other
value names one. The message ends with what was given, as JSON.

**Fix:** give one of the two; `'json'` is the default:

```ts
import { alxia } from '@alxia/core';

const app = alxia({ errors: 'problem' }); // RFC 9457 problems, application/problem+json
```

See [Errors](guide/errors.md).

### `alxia(): dev must be true or false, not "…"`

**When:** `alxia({ dev })` is given anything but a boolean: `dev:
process.env.DEV`, a string.

**Fix:** pass a boolean, or leave it out to read `NODE_ENV`:
`alxia({ dev: process.env['DEV'] === '1' })`
([Development](guide/development.md#the-dev-switch)).

### `listen(): shutdownTimeout must be a number of milliseconds, 0 or more; got …`

**When:** `listen({ shutdownTimeout })` is negative, `NaN`, `Infinity`, or
not a number, `'10s'` for instance. It is thrown by `listen`, before the
server starts.

**Why:** the timeout is how long a shutdown waits for the requests in
flight, in milliseconds.

**Fix:** give a finite number of milliseconds; `0` closes what is open at
once:

```ts
app.listen({ port: 3000, shutdownTimeout: 5_000 });
```

See [Health and shutdown](guide/health-and-shutdown.md).

### `health(): timeout must be a number of milliseconds, 0 or more; got …`

**When:** `health({ timeout })` is negative, `NaN`, `Infinity` or not a
number. `health({ cache })` throws the same message, `health(): cache must
be …`. Both are thrown when `health()` is called, before any request.

**Why:** `timeout` bounds each readiness check and `cache` is how long a
report is kept, both in milliseconds.

**Fix:** give finite numbers of milliseconds; `cache: 0` runs the checks on
every probe:

```ts
import { health } from '@alxia/core';

app.plugin(health({ checks, timeout: 1_000, cache: 1_000 }));
```

See [Health and shutdown](guide/health-and-shutdown.md).

### `group(): build is missing`

**When:** `group('/admin')` is called without its function.

**Fix:**

```ts
app.group('/admin', (admin) => admin.derive(requireAdmin).get('/stats', stats));
```

### `use(): argument 1 is an app: a plugin is given to app.plugin(), use() takes middlewares`

**When:** `use` is given an app among its middlewares, `use(auth)` where
`auth` is `alxia().derive(…)`: 0.3's `use(plugin)`, removed in 0.5. With
a path first, the message starts with it, `use("/admin"): argument 1 is an
app: …`, and counts after the path. The types refuse it first
([`provides no match for the signature`](#type-alxiaempty--provides-no-match-for-the-signature-ctx-basecontext--empty-next-nextfunction-middlewarereturn)).

**Fix:** mount the app with `plugin`:

```ts
app.plugin(auth).get('/me', ({ user, reply }) => reply(200, user));
```

### `use(): argument 1 is not a function: a middleware is (ctx, next) => …`

**When:** `use` is given something that is not a function: `null`, an
object, a schema. The types refuse it, so this comes from JavaScript or a
cast.

**Fix:** give a `(ctx, next)` function, written inline or kept in a const:

```ts
app.use(async (_ctx, next) => {
	const response = await next();
	response.headers.set('x-served-by', 'alxia');
	return response;
});
```

### `use(): argument 1 is a validate() or responds(), which belongs to a route`

**When:** `use` is given a `validate(…)` or a `responds(…)`.

**Why:** `validate` and `responds` declare one route's schemas, and stand
among its middlewares, where they run.

**Fix:** give the schemas to the route:

```ts
app.use(auth).post('/posts', validate({ body: Post }), responds({ 201: Post }), handler);
```

### `use(): argument 1 looks like a factory (…): call it, use(…())`

```text
TypeError: use(): argument 1 looks like a factory (cors): call it, use(cors())
TypeError: GET /x: middleware 1 looks like a factory (logger): call it, logger() among the route's middlewares
TypeError: plugin(): argument 1 looks like a factory (health): call it, plugin(health())
TypeError: plugin(): argument 1 looks like a factory (cors): call it, and give the middleware it makes to use(): use(cors())
TypeError: use(): argument 1 looks like a factory (health): call it, and give the plugin it makes to plugin(): plugin(health())
```

**When:** a factory is given where what it makes goes, uncalled: `use(cors)`,
a route's `logger`, `plugin(health)`; or one that makes a middleware is
given to `plugin`, one that makes a plugin to `use`. Thrown where the app
is declared, on a route, `ws`, `route(operation, …)`, `use(path, …)` and
`plugin` alike. Before 0.5, `use(cors)` answered every request with a 500.

**Why:** every factory alxia's packages export is marked with
`markFactory` — `health`, `apiDocs` and `redis` as making a plugin — so
the mistake is told where it is written. TypeScript refuses it too
([`this looks like a factory given
uncalled`](#-is-not-assignable-to-type-this-looks-like-a-factory-given-uncalled-call-it-as-usecors-and-not-usecors)).

**Fix:** call it, and give what it makes where it goes:

```ts
app.use(cors()).plugin(health());
```

Mark a factory of your own the same way, `markFactory(audit)`, or
`markFactory(myPlugin, 'plugin')` ([Development](guide/development.md#a-factory-given-uncalled)).

### `compose(): no middleware is given`, and `compose(): argument 1 is not a function: a middleware is (ctx, next) => …`

**When:** `compose()` is called with nothing, or with something that is
not a function — a list, a plugin's options.

**Fix:** give it the middlewares, each a `(ctx, next)` function, spread:
`compose(...guards)`, not `compose(guards)`.

### `markFactory(): the factory is not a function`

**When:** `markFactory` is given anything but a function: the result of a
factory, `markFactory(cors())`, rather than the factory.

**Fix:** mark the factory itself, once, beside its declaration:
`markFactory(cors)`.

### `use(): no middleware is given`

**When:** `use()` is called with nothing, or `use(path)` with a path and
no middleware: `use("/admin"): no middleware is given`. A path a route
could not be declared at says why instead: `use("/a/*/b"): "/a/*/b": "*"
may only end a path`, as [Building the app](#building-the-app) lists them
for a route.

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

### `plugin(): a plugin is given alone: an app or a function that returns one; middlewares are given to use()`

**When:** `plugin` is given more than one argument. Given nothing,
`plugin()` says `plugin(): nothing is given: an app or a function that
returns one; middlewares are given to use()`.

**Fix:** one plugin per call, `plugin(a).plugin(b)`; middlewares, several
to a `use`.

### `plugin(): the plugin is neither an app nor a function that returns one; a middleware is given to use()`

**When:** `plugin` is given what is neither an app nor a function — an
object, `null`, a number — or a `validate(…)` or `responds(…)`. The types
refuse it, so this comes from JavaScript or a cast.

**Fix:** give `plugin` an app, or a function `(app) => app`; give a
`validate` or a `responds` to a route.

### `plugin(): the plugin function returned undefined, not an app: a plugin returns the app it is given; a middleware is given to use()`

**When:** a function given to `plugin` returns anything but an app:
`undefined` (a block body with no `return`), a reply, or a promise —
`plugin(): the plugin function returned a promise, not an app: …` — most
often because it is a middleware, `app.plugin(cors())`, the 0.3 form
0.5 removed. `plugin` calls the function with the app, once; a middleware
that calls `next` right away is told `plugin(): the plugin function called
next(): …`, the same advice.

**Why:** a plugin is a function too, `(app) => app`, run once when it is
mounted. A middleware called that way would guard nothing; a result that
is not an app throws, and a promise it returned is left handled.

**Fix:** return the app from a plugin function, and give a middleware to
`use`:

```ts
app.plugin((app) => app.onStop(close)); // onStop returns the app
app.use(cors());
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

Under `alxia({ errors: 'problem' })` the same answer is an `application/problem+json` problem, the `issues` an extension ([Errors](guide/errors.md)).

**When:** a request reaches a `validate(…)` whose `params`, `query`,
`headers`, `cookies` or `body` schema refuses it, or the schema of an
operation given to `route()`. Every issue is listed, each with the part it was read
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

### A route still answers `{"error":"validation"}` after a middleware that catches refusals

**When:** an app gives a middleware that catches a `ValidationError` and
answers it in its own format, and a refused request to one of its routes
still gets the default 400.

**Why**, by what you find:

- The route is declared **before** the `use`. A middleware applies to the
  routes declared after it, never before: move the `use` up the chain.
- The `use` is inside a `group`. A group's middlewares stay inside it:
  declare it on the app, before the group.
- The middleware stands **after** the `validate` on the route: a refusal
  rejects the `next()` of the middlewares before the `validate` alone.
- It rethrows the error: `refusalOf(error)` is `undefined` for an error
  that is no refusal, and a check on `kind` may leave this one out.
- Something between them answered the error first
  ([A middleware's `try`/`catch` never sees the error](#a-middlewares-trycatch-never-sees-the-error)).

**Fix:** give the middleware first, and return a reply for the refusal:

```ts
import { alxia, defineMiddleware, problem, refusalOf, validate } from '@alxia/core';

const refusals = defineMiddleware(async (_ctx, next) => {
	try {
		return await next();
	} catch (error) {
		const refusal = refusalOf(error);
		if (refusal?.kind !== 'validation') throw error;
		return problem({ status: 400, detail: `the ${refusal.part} is invalid` });
	}
});

const app = alxia().use(refusals).post('/users', validate({ body: NewUser }), handler);
```

A body past the route's `bodyLimit` still gets the default
`413 {"error":"content_too_large","limit":…}` from that middleware, which
rethrows a `body_limit` refusal. Answer it too to answer it in your format
([`413`](#413-errorcontent_too_largelimit)).

### `413 {"error":"content_too_large","limit":…}`

Under `alxia({ errors: 'problem' })` the same answer is an `application/problem+json` problem, the `limit` an extension ([Errors](guide/errors.md)).

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
for the refusal of kind `body_limit`:

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

A 413 with no JSON body comes from Bun itself. The body passed `listen`'s
`maxRequestBodySize`, which applies to every route, before any route's
`bodyLimit`.

### `404 {"error":"not_found"}`

Under `alxia({ errors: 'problem' })` the same answer is an `application/problem+json` problem ([Errors](guide/errors.md)).
In dev, the router's 404 carries a `hint` naming the closest route it
declares, `"did you mean GET /todos/:id?"`: read it first
([Development](guide/development.md#the-404-hint)).

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

Under `alxia({ errors: 'problem' })` the same answer is an `application/problem+json` problem ([Errors](guide/errors.md)).

**When:** the path matches a route, but not with that method. The `Allow`
header lists the methods it does take, and in dev the body's `hint` too:
`"/todos/1 allows GET, DELETE"`.

**Why**, when another route takes that method: the path is chosen before
the method, as `Bun.serve` chooses it. With `GET /users/:id` and
`POST /users/me`, `GET /users/me` reaches `/users/me`, which has no `GET`.

**Fix:** call it with a method in `Allow`, or declare the route for the
method you call at the path that answers. `HEAD` is answered by the `GET`
route.

### `426 {"error":"upgrade_required"}`

Under `alxia({ errors: 'problem' })` the same answer is an `application/problem+json` problem ([Errors](guide/errors.md)).

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

Under `alxia({ errors: 'problem' })` the same answer is an `application/problem+json` problem ([Errors](guide/errors.md)).

**When:** a handler or a middleware throws, or a reply breaks its schema. The
body never says why outside dev, by design. In dev (`alxia({ dev })`, on
unless `NODE_ENV` is `production` or `test`) it does: a browser gets a page
with the error and its stack, any other client a `stack` beside `error`
([Development](guide/development.md#the-dev-error-page)).

**Why:** the app prints the error with `console.error`, then answers 500.
The next section lists the messages it prints. An error thrown in a route
rejects `next()` through the middlewares, which may answer it; one nobody
catches is answered at the route boundary: an `HttpError` with its own
status and body, anything else with this 500.

A request that fails because its client hung up (its `request.signal`
aborted, and the error is the `AbortError` a body read then throws) is
not an error of the app: nothing is printed, and
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

### A 404 carries a `hint`, a 500 a `stack` or an HTML page

**When:** the app runs in dev: `NODE_ENV` is neither `production` nor
`test`, and `alxia({ dev })` is not given. `listen` then prints the route
table too.

**Why:** dev helps the developer running the app; the deployed one should
say nothing of its routes nor its errors.

**Fix:** where the app is deployed, set `NODE_ENV=production`, as every
`bun create @alxia` template's `Dockerfile` does, or say so in the app:

```ts
const app = alxia({ dev: false });
```

### `503 {"status":"shutting_down","checks":{}}`

**When:** `GET /ready`, the readiness path of `health()`, answers it from
the moment the app starts to shut down: after a `SIGINT` or `SIGTERM`, or a
call to `app.stop()`. No check is run.

**Why:** this is expected, not a fault. A shutdown turns readiness to 503
first, so that a load balancer stops sending traffic while the requests in
flight finish.

**Fix:** none, for a deploy or a restart. If it shows with no shutdown, look
for what stopped the app, a signal handler or an `app.stop()` of yours.
`GET /health`, liveness, keeps answering 200 until the process exits. See
[Health and shutdown](guide/health-and-shutdown.md).

### `503 {"status":"down",…}`

**When:** `GET /ready` answers it with a check that failed:

```json
{ "status": "down", "checks": { "redis": { "status": "down", "duration": 1002, "reason": "timeout" } } }
```

`reason` is `"timeout"` when the check outlasted `timeout`, or `"failed"`
when it threw, rejected or returned `false`.

**Why:** the dependency is down or slow. The error's message is left out of
the response on purpose, as a probe may be public; it is not printed
either.

**Fix:** check the dependency the name points to. For a `timeout`, raise
`timeout` if the check is only slow, and keep it under the probe's own
timeout, or the probe gives up first:

```ts
app.plugin(health({ checks: { redis: () => redis.ping() }, timeout: 2_000 }));
```

### A client generated with `@nxgt/openapi-codegen` refuses the 400 after `errors: 'problem'`

**When:** the app is switched to `alxia({ errors: 'problem' })`, and a
client generated from its OpenAPI document throws on a 400, or on any
other error, though the server answers as it should.

**Why:** with `validationErrors` on, its default, the generated client
declares the 400 as `{ error: 'validation', issues }` under
`application/json`. A problem arrives as `application/problem+json` with
another shape. The server is not at fault: the `alxia` emitter never
declares the 400.

**Fix:** turn the generated 400 off, and declare the error responses in
`openapi.yaml` as `application/problem+json`, referencing a `Problem` or
`ValidationProblem` schema ([Errors](guide/errors.md)):

```ts
// openapi-codegen.config.ts
export default {
	// …
	validationErrors: false,
};
```

### A plugin's route reads a body past the app's `bodyLimit()`

**When:** an app calls `bodyLimit(bytes)` and then `plugin(app)` with an
app plugin, and a route of that plugin accepts a larger body.

**Why:** an app's `bodyLimit()` reaches the routes declared on it and in
its groups, never a plugin's. A plugin's route keeps the limit it was
declared with. A middleware the app gives before `plugin`, one that
catches refusals included, still runs on the plugin's routes. A function plugin that declares its routes on the app is
bounded like any of them.

**Fix:** give the plugin's route a `bodyLimit` of its own:

```ts
const uploads = alxia().post('/upload', { bodyLimit: 25 * 1024 * 1024 }, handler);
const app = alxia().bodyLimit(64 * 1024).plugin(uploads);
```

A `bodyLimit()` the plugin calls instead also applies to the app's routes
declared after `plugin`, as its middlewares do. Call the app's own after `plugin`
to keep it.

## Middlewares

Traps that print nothing: a middleware runs where you did not expect, or does not run where you did.

### `set.cookies.get()` returns null in a middleware

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
([Reading cookies](guide/middleware.md#reading-cookies)).

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

A plugin's own `use(path, …)` moves under the prefix the plugin is mounted
at, as its routes do: `alxia({ prefix: '/api' }).plugin(alxia().use('/admin', guard).get(…))`
guards `/api/admin`.

### A `use(path)` guard runs on a path spelled otherwise, or in another case

**When:** `use('/admin', guard)` answers `/ADMIN/x`, `/Admin`, `/%61dmin/x`,
`//admin/x` or `/public%2F..%2Fadmin` too, or guards a route declared as
`/Admin/stats`.

**Why:** on purpose. The path is read as what serves it reads it: the
router decodes a parameter and a wildcard, the static files decode the
path and, on macOS, find `PRIVATE` as `private`, and React Router's
matching ignores case. A guard compared with the raw path would let each
of these spellings through to what it guards. So each segment is decoded,
an encoded `/` splits it, empty segments are collapsed, the comparison
ignores case, and a segment that does not decode, or a `.` or `..` once
decoded, runs the guard.

**Fix:** none needed for a guard. A middleware that must tell `/Admin` from
`/admin` reads `ctx.url.pathname` itself, given to `use` without a path or
to the route.

### `use(): the middleware runs on the routes declared after it and on requests no route matches, not on the … declared before it`

```text
use(): the middleware runs on the routes declared after it and on requests no route matches, not on the route (GET /health) declared before it. Give it to use() before them if they need it.
```

**When:** in development (`NODE_ENV` neither `production` nor `test`),
once per app, when `use` is given a middleware after routes it would have
run on — those under its path, given one.

**Why:** a route runs the middlewares declared before it: this one does
not run on those routes. That is often meant — a `/health` before an
`auth` — and often not: an observer given last logs nothing but 404s.

**Fix:** give it before the routes that need it. When the order is meant,
the warning is the only effect; it never prints in production or under
`bun test`.

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

**Fix:** if only some routes should be guarded, guard them in a group,
which runs on its own routes and on the requests under its prefix alone:

```ts
const app = alxia()
	.get('/health', ({ reply }) => reply(200, 'ok'))
	.group('/api', (api) =>
		api.use(bearer({ jwt })).get('/users', ({ reply }) => reply(200, [])),
	);
// GET /nowhere → 404; GET /api/users and GET /api/nowhere without a token → 401
```

A plugin with a prefix of its own, `defineRoutes('/todos').use(guard)`,
is such a group once mounted: its guard answers under `/todos` alone.

`use('/api', guard)` also scopes a guard to a path, but only a middleware
that adds nothing to the context: `bearer` and `session` add, so they take a
group ([`Invalid middleware: …`](#-is-not-assignable-to-type-invalid-middleware-a-middleware-given-a-path-may-add-nothing-to-the-context-)).

### A middleware's `try`/`catch` never sees the error

**When:** a middleware catches what `next()` throws, and the error never
reaches it: the response is the 500 or another middleware's reply, and
the `catch` does not run.

**Why:** something between them answered the error without throwing it
on: a middleware of your own that caught it and returned a response; or a middleware that
read `next()` with `.catch()` or `.then(…, …)` rather than through
`settle`; or one that settled a promise other than `next()` itself,
`settle(ctx, next().then(…))`, or returned a reply of its own after
`settle`. An observer — `logger()`, `telemetry()`, `secureHeaders()`,
`cors()`, `compress()`, `createI18n()`, `contextStorage()` — does not: it
settles `next()`, reads the response the error would be answered with, and
the error goes on to the middlewares around it.

**Fix:** let the error through what stands between them — `settle(ctx,
next())` in a middleware that only watches — or give the catching
middleware after it. Wherever it stands, give it after the observers, so
that they see its reply:

```ts
const app = alxia()
	.use(logger())  // observers, first
	.use(errors)    // catches the error; logger sees its reply
	.get('/boom', () => { throw new Error('boom'); });
```

`janusErrors()` answers what is thrown **behind** it:
`app.use(janusErrors(), session(accounts))`.

### A middleware's `try`/`catch` sees an `AbortError` when the client left

**When:** a middleware that wraps `await next()` in `try`/`catch` catches
an `AbortError`, or the error a body read throws, on a request whose
client hung up mid-request — a large upload cancelled.

**Why:** an error is a rejection through `next()`, whatever threw it, and
a client that left is one: the body read fails. It is no error of the app:
nothing is printed, and a middleware that settles `next()`, a logger's,
sees a `499` with no body, which nobody reads.

**Fix:** rethrow what you do not answer, as for any error; to tell it
apart, read `request.signal.aborted`:

```ts
const errors = defineMiddleware(async ({ request, reply }, next) => {
	try {
		return await next();
	} catch (error) {
		if (request.signal.aborted || !(error instanceof NotFoundError)) throw error;
		return reply(404, { error: 'not_found' as const });
	}
});
```

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
`use` stays with the group's routes and the requests under its prefix. In
development, the `use` warns once, naming the routes before it.

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
returned by a `derive`, or by a middleware with a status `responds` does
not declare, which is sent as it is
([Where `validate` stands](guide/middleware.md#where-validate-stands)).

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

### `TypeError: … a middleware (…) returned function: it looks like a factory given uncalled, call it: …()`

```text
TypeError: GET /: a middleware (audit) returned function: it looks like a factory given uncalled, call it: audit()
```

**When:** a factory nobody marked is given uncalled, `use(audit)`, past
the types (JavaScript, a cast): it runs as the middleware, and returns the
middleware it makes. Each request is answered 500. A marked factory —
every one of alxia's packages — [throws where it is
declared](#use-argument-1-looks-like-a-factory--call-it-use) instead.

**Fix:** call it, `use(audit())`, and mark it beside its declaration,
`markFactory(audit)`.

### `TypeError: compose() runs among a route's middlewares or in use(), not called on its own`

**When:** a middleware `compose(…)` made is called as a function, or given
to something that is not an alxia route, `use` or `ws`: a wrapper of
another framework.

**Why:** its members are spliced into the chain where it stands; it does
not run them itself.

**Fix:** give it to a route, `use`, `ws`, `route(operation, …)` or another
`compose`.

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
`use` — read the body itself, with `request.json()`,
`request.text()` or `request.formData()`.

**Why:** `derive`s, and the middlewares before a `validate`, run before
it. A request's body can be read once: that middleware used it up, and the
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

## Shutting down

What `listen`'s graceful shutdown does on `SIGTERM` and `SIGINT`
([Health and shutdown](guide/health-and-shutdown.md#graceful-shutdown)).

### The process exits before my own `SIGTERM` handler finishes

**When:** the app is served with `listen`, and your own `process.on('SIGTERM', …)`
does asynchronous cleanup that never completes: the process exits first.

**Why:** since 0.5, `listen` installs `SIGINT` and `SIGTERM` handlers and
shuts down gracefully: readiness 503, new connections refused, sockets
closed with 1001, the requests in flight drained, the `onStop` hooks, then
`process.exit(0)`, or `process.exit(1)` when an `onStop` hook throws (its
error is printed). Yours runs beside it, and the exit does not wait for it.

**Fix:** move the cleanup into an `onStop` hook, which the shutdown awaits:

```ts
app.onStop(async () => {
	await queue.drain();
});
```

Or take the signals yourself, and stop the app from your handler:

```ts
app.listen({ port: 3000, signals: false });
process.on('SIGTERM', async () => {
	await cleanup();
	await app.stop();
	process.exit(0);
});
```

A second signal during the drain exits at once with 1. See
[Health and shutdown](guide/health-and-shutdown.md).

### Shutdown takes 10 seconds

**When:** a `SIGTERM` or `SIGINT` does not end the process until
`shutdownTimeout` has passed, 10 000 ms by default.

**Why:** a request in flight that never ends holds the drain: a long poll,
or a streamed body that is not an event stream. At the timeout the server
closes what is left. Streams of events a route replies with, and
`@alxia/graphql` subscriptions, end by themselves when shutdown starts.

**Fix:** end the request when the shutdown starts, with `shutdownSignal`, an
`AbortSignal` aborted at that moment:

```ts
import { shutdownSignal } from '@alxia/core';

app.get('/poll', async (ctx) => {
	// waitForMessages: your own, resolving with [] once either signal aborts
	const messages = await waitForMessages(AbortSignal.any([ctx.request.signal, shutdownSignal(ctx)]));
	return ctx.reply(200, messages);
});
```

Or lower the wait, `listen({ shutdownTimeout: 3_000 })`. See
[Health and shutdown](guide/health-and-shutdown.md).

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
