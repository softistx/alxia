# @alxia/graphql

GraphQL for [alxia](https://www.npmjs.com/package/@alxia/core), served by
[GraphQL Yoga](https://the-guild.dev/graphql/yoga-server). The endpoint is a
route like any other: behind the app's middlewares, guarded by its guards, its
resolvers reading the context those middlewares built — typed, and checked.
Yoga's plugin system is yours whole: Envelop's plugins and Yoga's own.

```sh
bun add @alxia/graphql graphql-yoga graphql @alxia/core
bun add -d typescript
```

`graphql-yoga` and `graphql` are peers: the package declares no dependency.
`graphql-ws` is an optional one, for [`ws`](#websocket) alone.
`graphql` 16 and 17 both work; with 17, `graphql-yoga` must be 5.22 or
later, the first to accept it.

## Usage

```ts
import { alxia } from '@alxia/core';
import { graphql, type GraphQLContext } from '@alxia/graphql';
import { bearer } from '@alxia/jwt';
import { createSchema } from 'graphql-yoga';

const base = alxia()
	.decorate({ db })
	.use(bearer({ jwt, schema: Claims }));        // every route after it needs a token

const schema = createSchema<GraphQLContext<typeof base>>({
	typeDefs: /* GraphQL */ `type Query { me: String! }`,
	resolvers: {
		Query: { me: (_, __, { user, db }) => db.name(user.sub) }, // user and db typed
	},
});

const app = base.plugin((app) => graphql(app, { schema }));   // POST and GET /graphql
app.listen(3000);
```

`graphql(app, options)` adds `GET` and `POST` routes at `path` —
`/graphql` by default, under the app's prefix — and returns the app. Given
to `app.plugin` as a function, it stays in the chain and sees the app's type.

## The context

A resolver's context is Yoga's (`request`, `params`), the app's — every
`decorate`, every `derive`, every middleware's: `user`, `db`, `log`,
`requestId` — and `set`, through which it sets a header or a cookie:

```ts
login: async (_, { name }, { set }) => {
	set.cookies.set('session', await sign(name), { httpOnly: true });
	return true;
},
```

`GraphQLContext<typeof app>` is that type. A schema whose resolvers read
what the app does not build is a compile error:

```
the schema's resolvers read a context the app does not build: missing user
```

## Batching (N+1)

A field that loads a record per parent — `Note.author` over 50 notes — is
51 queries. Build [DataLoaders](https://github.com/graphql/dataloader) in
the `context` option and type them through `GraphQLContext`'s second
argument. (Yoga's `batching` option, below, is another thing: several
operations in one HTTP request.)

```sh
bun add dataloader
```

```ts
import DataLoader from 'dataloader';

const createLoaders = () => ({
	user: new DataLoader(async (ids: readonly string[]) => findUsers(ids)), // one query for all ids
});
type Loaders = ReturnType<typeof createLoaders>;

const schema = createSchema<GraphQLContext<typeof base, { loaders: Loaders }>>({
	typeDefs,
	resolvers: { Note: { author: (note: { authorId: string }, _, { loaders }) => loaders.user.load(note.authorId) } },
});

const app = base.plugin((app) => graphql(app, { schema, context: () => ({ loaders: createLoaders() }) }));
```

Per request, never once for the process: a DataLoader caches what it
loads, so a shared one would serve stale records and hand one user's data
to the next. Over WebSocket, `context` runs for each operation. See
[Batching with DataLoader](https://github.com/softistx/alxia/blob/develop/packages/graphql/docs/guide/context.md#batching-with-dataloader-n1).

## Yoga's plugins

Every Yoga option passes through, but `graphqlEndpoint`, which `path`
sets, and `graphiql`, which `ide` decides:

```ts
import { useDepthLimit } from '@envelop/depth-limit';
import { useResponseCache } from '@graphql-yoga/plugin-response-cache';

graphql(app, {
	schema,
	plugins: [useDepthLimit({ maxDepth: 8 }), useResponseCache({ session: ({ request }) => ... })],
	maskedErrors: true,            // Yoga's default: an error's message never leaks
	ide: Bun.env.NODE_ENV === 'development' && 'apollo-sandbox', // at runtime, never process.env: bun build inlines it
	batching: true,
});
```

- **Subscriptions** are served over server-sent events, Yoga's default:
  `async *subscribe` in a resolver, `Accept: text/event-stream` on the
  request; over WebSocket too with [`ws: true`](#websocket). `@alxia/compress` leaves an event stream alone by default.
- **An IDE** answers a `GET` from a browser at the endpoint, with a
  `Content-Security-Policy` that lets it load — its pinned files on unpkg
  alone, framed by no one — which `@alxia/secure-headers` keeps. By
  default, GraphiQL in the serving app's dev alone (`NODE_ENV=development`,
  or `alxia({ dev: true })`), none otherwise; `ide` chooses one everywhere:

  ```ts
  graphql(app, { schema }); // GraphiQL in dev, nothing deployed
  graphql(app, { schema, ide: 'apollo-sandbox', sandbox: { initialDocument: '{ me }' } });
  ```

  | `ide` | |
  | --- | --- |
  | none (default) | Yoga's GraphiQL in dev (`isDev`), nothing otherwise |
  | `'graphiql'` | Yoga's GraphiQL, everywhere; `graphiql` takes its options |
  | `'apollo-sandbox'` | [Apollo Sandbox](https://www.apollographql.com/docs/graphos/platform/sandbox), embedded, pointed at the address the page was opened at, prefix included — `https` behind a proxy that terminates TLS ([IDE guide](https://github.com/softistx/alxia/blob/develop/packages/graphql/docs/guide/ide.md#apollo-sandbox)). `sandbox` takes `title`, `initialDocument`, `initialHeaders`, `pollForSchemaUpdates`, `includeCookies` |
  | `false` | none |
- **CORS** is `@alxia/cors`'s for the whole app: Yoga's own is off unless
  `cors` is given.

## Which operation ran

Every call is a `POST /graphql`; `graphql()` tells the observers around it
which operation it executes. Behind `use(logger())` the request's line
carries `operationName` and `operationType`, and behind
`use(telemetry({ … }))` its span is named `query GetNotes`, with
OpenTelemetry's `graphql.operation.name` and `graphql.operation.type`. A
batched body is one line and one span, `batch`, with every name.

```ts
const app = alxia()
	.use(logger())
	.use(telemetry({ service: 'notes' }))
	.plugin((app) => graphql(app, { schema }));
```

A request
refused before it executes names none. Over `ws: true`, each operation on
the socket is a line and a span of its own, from its `subscribe` message
to its end, marked when answered with errors.
See [the endpoint guide](https://github.com/softistx/alxia/blob/develop/packages/graphql/docs/guide/endpoint.md#the-operation-in-the-log-and-the-trace)
and [the WebSocket guide](https://github.com/softistx/alxia/blob/develop/packages/graphql/docs/guide/websockets.md#logging-and-tracing).

## WebSocket

`ws: true` serves the endpoint over WebSocket too, with the
`graphql-transport-ws` protocol of [`graphql-ws`](https://the-guild.dev/graphql/ws),
the default of Apollo Client's `GraphQLWsLink` and urql's
`subscriptionExchange`. `graphql-ws` is an optional peer; server-sent
events stay served at the same path. Install it with `bun add graphql-ws`.

```ts
const app = base.plugin((app) => graphql(app, { schema, ws: true })); // ws://…/graphql too
```

```ts
import { createClient } from 'graphql-ws';

const client = createClient({ url: 'wss://api.example.com/graphql', connectionParams: { device: 'web' } });
```

The upgrade runs the app's middlewares — a guard's `401` refuses the
socket, what they add is in the context, beside the `connectionParams`
the client sent — each operation runs through
Yoga's plugins, and a shutdown closes the sockets with `1001`, completing
their subscriptions. `ws: { path, keepAlive }` moves the socket or spaces
its pings. See [the WebSocket guide](https://github.com/softistx/alxia/blob/develop/packages/graphql/docs/guide/websockets.md),
Apollo Client's and urql's setup included.

## Errors, health and shutdown

A GraphQL error stays GraphQL's — an entry of `errors[]`, inside a 200 —
while `@alxia/core`'s `alxia({ errors: 'problem' })` makes the HTTP layer
around the endpoint answer RFC 9457 problems: a guard's 401, a 413, a
500. `health()` mounts beside it, and on `SIGTERM` the queries in flight
are answered and the subscriptions ended before the process exits:

```ts
import { alxia, health } from '@alxia/core';
import { graphql } from '@alxia/graphql';

const app = alxia({ errors: 'problem' })
	.plugin(health())
	.plugin((app) => graphql(app, { schema }));
app.listen({ port: 4000 });
```

See [the endpoint guide](https://github.com/softistx/alxia/blob/develop/packages/graphql/docs/guide/endpoint.md#errors-health-and-shutdown).

## Testing

`graphqlClient` from `@alxia/graphql/testing` sends operations to the app
in process, through `app.fetch`: no port. It is a subpath, so the main entry
and a production bundle never carry it.

```ts
import { graphqlClient } from '@alxia/graphql/testing';

const client = graphqlClient(app, { headers: { authorization: `Bearer ${token}` } });
const { status, data, errors } = await client.query(
	'query ($name: String!) { hello(name: $name) }',
	{ variables: { name: 'Ada' } },
);
```

A `TypedDocumentNode` types `data` and the variables. `method: 'GET'` sends
the operation in the URL; `persisted` sends the hash of a persisted operation
(alone, when the app allows nothing else); the client adds no CSRF header, put
yours in `headers`. See
[the testing guide](https://github.com/softistx/alxia/blob/develop/packages/graphql/docs/guide/testing.md).

## API

| export | |
| --- | --- |
| `graphql(app, options)` | the endpoint: `schema`, `path`, `ide`, `sandbox`, `ws`, and every Yoga option |
| `GraphQLWsOptions` | `ws`'s options: `path`, `keepAlive` |
| `GraphQLWsContext` | what an operation over WebSocket adds to the context: `connectionParams` |
| `renderSandbox(endpoint, options?)`, `SANDBOX_POLICY` | the Sandbox page, and the policy it loads under |
| `SandboxOptions` | its options: `title`, `initialDocument`, `initialHeaders`, `pollForSchemaUpdates`, `includeCookies` |
| `GraphQLContext<App, UserContext?>` | what a resolver reads |
| `ServerContext<Ctx>`, `GraphQLOptions` | its types |
| `graphqlClient(app, { path?, headers?, method? })` (`@alxia/graphql/testing`) | `query(document, { variables?, operationName?, headers?, method?, extensions?, persisted? })`, or `query({ persisted })` with no document, in process: `{ status, data?, errors?, response }` |
| `GraphQLClient`, `GraphQLResult`, `QueryDocument`, `QueryOptions`, `PersistedQueryOptions`, `HttpMethod`, `GraphQLClientOptions`, `ResponseError` (`@alxia/graphql/testing`) | its types |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/graphql/docs): a page per area — mounting the endpoint, the typed context, Yoga's plugins and options, GraphQL over WebSocket, GraphiQL and Apollo Sandbox, and [hardening an API for production](https://github.com/softistx/alxia/blob/develop/packages/graphql/docs/guide/production.md) (rate limits, depth limits, introspection, errors, body size, CSRF, persisted operations).
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/graphql/docs/troubleshooting.md): an error message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/graphql/docs/roadmap.md): what is coming, and what is not planned.
- [Recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md): [A GraphQL API](https://github.com/softistx/alxia/blob/develop/docs/recipes/graphql-api.md), [Authenticate requests](https://github.com/softistx/alxia/blob/develop/docs/recipes/authentication.md), [Test an alxia app](https://github.com/softistx/alxia/blob/develop/docs/recipes/testing.md), [Health checks and graceful shutdown](https://github.com/softistx/alxia/blob/develop/docs/recipes/health-and-shutdown.md), and more.
