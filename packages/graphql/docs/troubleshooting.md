# Troubleshooting

Each entry is headed by the text you see: a TypeScript error, an exception
thrown when the app is built, or a response from the endpoint. Problems that
show no message, or only the browser's, are under [Traps](#traps), by
symptom.

**Install**

- [`Cannot find package 'graphql-yoga' from '…/@alxia/graphql/dist/index.js'`](#cannot-find-package-graphql-yoga-from-alxiagraphqldistindexjs)

**Types**

- [`the schema's resolvers read a context the app does not build: missing …`](#the-schemas-resolvers-read-a-context-the-app-does-not-build-missing-)
- [`Property 'viewer' does not exist on type '{ readonly '~error': "GraphQLContext needs the type of an app: GraphQLContext<typeof app>"; } & YogaInitialContext'`](#property-viewer-does-not-exist-on-type--readonly-error-graphqlcontext-needs-the-type-of-an-app-graphqlcontexttypeof-app---yogainitialcontext)
- [`Property 'viewer' does not exist on type 'YogaInitialContext'`](#property-viewer-does-not-exist-on-type-yogainitialcontext)
- [`Property 'query' does not exist on type 'YogaInitialContext & ServerContext<…>'`](#property-query-does-not-exist-on-type-yogainitialcontext--servercontext)
- [`Type 'true' is not assignable to type 'GraphiQLOptions | GraphiQLOptionsFactory<…> | undefined'`](#type-true-is-not-assignable-to-type-graphiqloptions--graphiqloptionsfactory--undefined)
- [`'graphqlEndpoint' does not exist in type 'GraphQLOptions<…>'`](#graphqlendpoint-does-not-exist-in-type-graphqloptions)
- [``Type '"gql"' is not assignable to type '`/${string}`'``](#type-gql-is-not-assignable-to-type-string)

**Startup**

- [`TypeError: GET /graphql is declared twice`](#typeerror-get-graphql-is-declared-twice)

**Responses**

- [`200 {"errors":[{"message":"Unexpected error.", … "code":"INTERNAL_SERVER_ERROR"}}]}`](#200-errorsmessageunexpected-error--codeinternal_server_error)
- [`405 {"error":"method_not_allowed"}` on `OPTIONS /graphql`](#405-errormethod_not_allowed-on-options-graphql)
- [`405 {"errors":[{"message":"Can only perform a mutation operation from a POST request."}]}`](#405-errorsmessagecan-only-perform-a-mutation-operation-from-a-post-request)
- [`406` with an empty body](#406-with-an-empty-body)
- [`{"errors":[{"message":"Must provide query string."}]}`](#errorsmessagemust-provide-query-string)

**Traps**

- [The endpoint answers without a guard declared after it](#the-endpoint-answers-without-a-guard-declared-after-it)
- [The logger, CORS or secure headers miss the endpoint](#the-logger-cors-or-secure-headers-miss-the-endpoint)
- [An anonymous request to a missing path is a 401](#an-anonymous-request-to-a-missing-path-is-a-401)
- [A WebSocket client cannot connect: `Expected 101 status code`](#a-websocket-client-cannot-connect-expected-101-status-code)
- [The IDE page is blank](#the-ide-page-is-blank)
- [GraphiQL is served in production](#graphiql-is-served-in-production)

## Install

### `Cannot find package 'graphql-yoga' from '…/@alxia/graphql/dist/index.js'`

**When:** importing `@alxia/graphql`, before any of your code runs. The same
message names `graphql` when that one is missing; `tsc` reports either as
`TS2307: Cannot find module 'graphql-yoga'`.

**Why:** `graphql-yoga` and `graphql` are peers: the package declares no
dependency, so the app installs them.

**Fix:**

```sh
bun add @alxia/graphql graphql-yoga graphql
```

With `graphql` 17, `graphql-yoga` must be 5.22 or later: an older Yoga
declares `graphql ^15.2.0 || ^16.0.0`, and `bun install` warns about an
incorrect peer. `bun add graphql-yoga@latest` updates it.

## Types

These are what `tsc` prints. Codes are those with `exactOptionalPropertyTypes`
off; with it on, an assignment error is `TS2375` instead of `TS2322`, with
the same last line.

### `the schema's resolvers read a context the app does not build: missing …`

**When:** `graphql(app, { schema })`, where `…` names a field: `missing user`,
`missing viewer`. With several missing, each is a member of a union.

```text
error TS2322: Type 'GraphQLSchemaWithContext<…>' is not assignable to type 'GraphQLSchema & { _context?: … } & "the schema's resolvers read a context the app does not build: missing user"'.
```

**Why:** the schema was typed with `GraphQLContext<typeof base>`, and its
resolvers read what `base`'s middlewares add, but `graphql` was given an app that
does not run those middlewares: another app, or the endpoint declared before the
`derive` or the guard.

**Fix:** mount the endpoint on the app the schema was typed from, after its
middlewares ([The typed context](guide/context.md)):

```ts
const base = alxia().use(bearer({ jwt }));                       // adds user
const schema = createSchema<GraphQLContext<typeof base>>({ … });
const app = base.plugin((app) => graphql(app, { schema }));         // not alxia().plugin(…)
```

**When the missing field comes from the `context` option** — `missing
loaders`, though `context` returns `loaders` — the function reads its
argument without a type annotation, so TypeScript does not infer what it
returns. Annotate the argument:

```ts
graphql(app, {
	schema,
	context: ({ users }: GraphQLContext<typeof base>) => ({ loaders: createLoaders(users) }),
});
```

### `Property 'viewer' does not exist on type '{ readonly '~error': "GraphQLContext needs the type of an app: GraphQLContext<typeof app>"; } & YogaInitialContext'`

**When:** a resolver of a schema typed `createSchema<GraphQLContext<X>>`
reads a field, and `X` is not an alxia app: a function returning one, a
schema, a route. Passed to `graphql(app, { schema })` anyway, the schema is
refused with `missing ~error`.

**Why:** `GraphQLContext` reads the context from an app's type. Given
anything else, it is this message, and holds none of the app's fields.

**Fix:** give it the app's type:

```ts
const makeApp = () => alxia().decorate({ users });
const base = makeApp();
createSchema<GraphQLContext<typeof base>>({ … });   // not GraphQLContext<typeof makeApp>
```

### `Property 'viewer' does not exist on type 'YogaInitialContext'`

**When:** a resolver of a schema created with `createSchema({ … })`, no type
argument, reads what the app's middlewares add.

**Why:** an untyped schema's context is Yoga's alone. The field is there at
runtime; its type is not.

**Fix:**

```ts
const schema = createSchema<GraphQLContext<typeof base>>({ … });
```

### `Property 'query' does not exist on type 'YogaInitialContext & ServerContext<…>'`

**When:** a resolver reads `query`, `headers`, `cookies`, `body`, `reply` or
`redirect` from its context, as a route handler would.

**Why:** those are the route's, and mean nothing to a resolver: the request
is a GraphQL request, and a resolver answers a field, not the request.
`params` is there, but it is Yoga's: the GraphQL `query`, `variables` and
`operationName`.

**Fix:** read a header or a cookie from `request`, and set them on the
response with `set`:

```ts
const resolvers = {
	Query: {
		locale: (_: unknown, __: unknown, { request, set }: GraphQLContext<typeof base>) => {
			set.headers.set('vary', 'accept-language');
			return request.headers.get('accept-language') ?? 'en';
		},
	},
};
```

### `Type 'true' is not assignable to type 'GraphiQLOptions | GraphiQLOptionsFactory<…> | undefined'`

**When:** `graphql(app, { schema, graphiql: true })`, or `false`.

**Why:** `ide` decides whether there is a GraphiQL; `graphiql` takes only
its options.

**Fix:**

```ts
graphql(app, { schema, ide: 'graphiql', graphiql: { title: 'Users API' } });
graphql(app, { schema, ide: false });
```

### `'graphqlEndpoint' does not exist in type 'GraphQLOptions<…>'`

**When:** passing Yoga's `graphqlEndpoint`.

```text
error TS2353: Object literal may only specify known properties, and 'graphqlEndpoint' does not exist in type 'GraphQLOptions<…>'.
```

**Why:** the endpoint is a route of the app, and its path is joined to the
app's prefix; Yoga is told the result.

**Fix:**

```ts
graphql(app, { schema, path: '/gql' });   // served at <prefix>/gql
```

### ``Type '"gql"' is not assignable to type '`/${string}`'``

**When:** `path` does not start with `/`.

**Fix:**

```ts
graphql(app, { schema, path: '/gql' });
```

## Startup

### `TypeError: GET /graphql is declared twice`

**When:** building the app, at the second `graphql(…)` on it, or at a
`get('/graphql', …)` beside the endpoint.

**Why:** each `graphql` call declares `GET` and `POST` at its `path`, and
two endpoints with the default path collide. `plugin((app) => graphql(app, …))`
declares the routes on the app it is called on, so calling it twice on the
same `base` — for two variants of an app — declares them twice there.

**Fix:** a `path` for each endpoint, or one `graphql` per app:

```ts
const app = alxia()
	.plugin((app) => graphql(app, { schema }))
	.plugin((app) => graphql(app, { schema: admin, path: '/admin/graphql' }));
```

## Responses

### `200 {"errors":[{"message":"Unexpected error.", … "code":"INTERNAL_SERVER_ERROR"}}]}`

**When:** a resolver throws an `Error`, or rejects.

**Why:** Yoga masks errors by default, so a database message or a stack
never reaches a client. The original error is logged by Yoga's logger,
unless `logging` is `false`.

**Fix:** throw a `GraphQLError` for what the client should read; it passes
unmasked, with its code and status
([Errors](guide/yoga.md#errors)):

```ts
import { createGraphQLError } from 'graphql-yoga';

throw createGraphQLError('Admins only', {
	extensions: { code: 'FORBIDDEN', http: { status: 403 } },
});
```

`maskedErrors: false` shows every message, for development only.

### `405 {"error":"method_not_allowed"}` on `OPTIONS /graphql`

**When:** a browser on another origin calls the endpoint; its preflight
fails and the console reports a CORS error.

**Why:** Yoga's CORS is off, and the app answers no `OPTIONS` without a
CORS middleware.

**Fix:** `@alxia/cors`, given to `use` first, for the whole app: it answers a
preflight itself, before the router's 404 or 405 ([CORS](guide/yoga.md#cors)):

```ts
import { cors } from '@alxia/cors';

const app = alxia()
	.use(cors({ origin: 'https://app.example.com', credentials: true }))
	.plugin((app) => graphql(app, { schema }));
```

### `405 {"errors":[{"message":"Can only perform a mutation operation from a POST request."}]}`

**When:** a mutation sent as `GET /graphql?query=mutation …`. The body also
carries `"extensions":{"code":"BAD_REQUEST"}`.

**Why:** Yoga refuses mutations over `GET`, which a link or a cache could
replay.

**Fix:** send it as a `POST`:

```ts
await fetch('/graphql', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ query: 'mutation { login(name: "ada") }' }),
});
```

### `406` with an empty body

**When:** a subscription sent with `Accept: application/json`; or a
request whose `Accept` allows only `text/html` (no `*/*`, no
`application/json`), such as `curl -H 'accept: text/html'`, where no IDE
page is served — `ide: false`, or `ide: 'apollo-sandbox'` with a `?query=`
in the URL. A browser sends `*/*` too, and gets JSON there.

**Why:** a subscription is a stream of results: Yoga sends it only to a
client that accepts `text/event-stream`, and has no other representation
to offer. Likewise, a result has no HTML representation: a client asking
only for HTML, with no IDE page to serve it, gets nothing it accepts.

**Fix:** for a subscription, accept `text/event-stream`:

```ts
await fetch('/graphql', {
	method: 'POST',
	headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
	body: JSON.stringify({ query: 'subscription { countdown(from: 3) }' }),
});
```

For a client that asks only for HTML, accept `application/json` (or
`*/*`) where no IDE is served, or keep an IDE where one is wanted — see
[GraphiQL and Apollo Sandbox](guide/ide.md).

### `{"errors":[{"message":"Must provide query string."}]}`

**When:** a `GET` with no `query` parameter from a client that does not ask
for HTML — or from a browser when `ide` is `false` — or a `POST` whose JSON
body has no `query`. The body carries
`"extensions":{"code":"BAD_REQUEST"}`.

**Why:** the request reached Yoga, with nothing to run. A `GET` from a
browser gets the IDE page instead, unless `ide` is `false`; a client
asking only for HTML gets a [`406`](#406-with-an-empty-body) where no page is
served.

**Fix:** send the operation as `query`, in the body or the URL:

```ts
await app.request(`/graphql?query=${encodeURIComponent('{ me }')}`, {
	headers: { accept: 'application/json' },
});
```

## Traps

### The endpoint answers without a guard declared after it

**When:** `.plugin((app) => graphql(app, { schema }))` comes before
`.use(bearer(…))` or a guarding `derive`: the endpoint answers anonymous
requests, and its resolvers read no `user`.

**Why:** a middleware applies to the routes declared after it. The endpoint
is a route, declared where `graphql` is called, so a middleware given to `use`
after it never runs for it. A schema typed from the
guarded app is refused (`missing user`); an untyped one is not.

**Fix:** declare the guard first:

```ts
const base = alxia().use(bearer({ jwt }));
const app = base.plugin((app) => graphql(app, { schema }));
```

### The logger, CORS or secure headers miss the endpoint

**When:** `use(logger())`, `use(cors(…))` or `use(secureHeaders())` comes
after `.plugin((app) => graphql(app, { schema }))`: the endpoint is not
logged, its responses carry no CORS or security headers.

**Why:** a `use` middleware runs on the routes declared after it, and on a
request no route matches. The endpoint is declared before it.

**Fix:** give the observers to `use` first:

```ts
const app = alxia()
	.use(logger())
	.use(cors({ origin: 'https://app.example.com' }))
	.plugin((app) => graphql(app, { schema }));
```

### An anonymous request to a missing path is a 401

**When:** `use(bearer(…))` is on the app, and `GET /nope` answers
`401` rather than `404`.

**Why:** a guard given to the app's `use` runs on every request, a request
no route matches included, and answers before the 404.

**Fix:** scope the guard to what it guards, with a `group`. A path-scoped
`use('/graphql', bearer(…))` does not compile: a middleware given a path may
add nothing to the context, and `bearer` adds `user`.

```ts
const app = alxia()
	.get('/health', ({ reply }) => reply(200, 'ok'))
	.group('/api', (api) =>
		api
			.use(bearer({ jwt }))
			.plugin((app) => graphql(app, { schema })), // /api/graphql: a 401 without a token
	);
// GET /nope → 404, GET /api/nope → 404
```

### A WebSocket client cannot connect: `Expected 101 status code`

**When:** a `graphql-ws` client, or GraphiQL with
`subscriptionsProtocol: 'WS'`, opens `ws://…/graphql`. Bun's client prints
`Expected 101 status code`; a browser reports the WebSocket connection as
failed.

**Why:** the endpoint serves subscriptions over server-sent events only;
it never upgrades to a WebSocket.

**Fix:** subscribe over SSE, with `Accept: text/event-stream`
([Subscriptions](guide/yoga.md#subscriptions)), and leave GraphiQL's
protocol at SSE:

```ts
graphql(app, { schema, graphiql: { subscriptionsProtocol: 'SSE' } });
```

### The IDE page is blank

**When:** GraphiQL or Apollo Sandbox loads an empty page, and the browser
console reports scripts refused by the `Content-Security-Policy`.

**Why:** the endpoint sends the IDE with a policy that lets it load its
scripts from `unpkg.com` or Apollo's CDN. A middleware of the app that sets its
own `Content-Security-Policy` on every response replaces it.
`@alxia/secure-headers` does not: it keeps a policy a response already has.

**Fix:** set the app's policy only where none is set
([With `@alxia/secure-headers`](guide/ide.md#with-alxiasecure-headers)):

```ts
const defaultPolicy = defineMiddleware(async (ctx, next) =>
	withHeaders(await settle(ctx, next()), (headers) => {
		if (!headers.has('content-security-policy'))
			headers.set('content-security-policy', "default-src 'self'");
	}),
);

app.use(defaultPolicy); // before the endpoint, so it wraps it
```

### GraphiQL is served in production

**When:** a browser opening the production endpoint gets GraphiQL.

**Why:** `ide` is `'graphiql'` by default.

**Fix:**

```ts
graphql(app, { schema, ide: Bun.env['NODE_ENV'] === 'production' ? false : 'graphiql' });
```
