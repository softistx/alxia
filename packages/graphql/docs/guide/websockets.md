# GraphQL over WebSocket

This page covers `ws`: serving the endpoint over WebSocket too, with the
[`graphql-transport-ws`](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md)
protocol of [`graphql-ws`](https://the-guild.dev/graphql/ws) — the default
of Apollo Client's `GraphQLWsLink` and urql's `subscriptionExchange` — beside
the HTTP endpoint and its server-sent events.

```sh
bun add graphql-ws
```

```ts
import { alxia } from '@alxia/core';
import { graphql } from '@alxia/graphql';
import { createSchema } from 'graphql-yoga';

const schema = createSchema({
	typeDefs: /* GraphQL */ `
		type Query { hello: String! }
		type Subscription { countdown(from: Int!): Int! }
	`,
	resolvers: {
		Query: { hello: () => 'world' },
		Subscription: {
			countdown: {
				async *subscribe(_, { from }: { from: number }) {
					for (let n = from; n >= 0; n--) yield { countdown: n };
				},
			},
		},
	},
});

const app = alxia().plugin((app) => graphql(app, { schema, ws: true }));
app.listen(3000); // http://localhost:3000/graphql and ws://localhost:3000/graphql
```

`graphql-ws` is an optional peer: an app that leaves `ws` off never loads
it. Server-sent events stay served at the same path either way, so a client
of each kind works against one deployment.

## `ws`

| `ws` | |
| --- | --- |
| `false`, or none (default) | subscriptions over server-sent events alone: a WebSocket client gets no `101` |
| `true` | a socket route at the endpoint's `path`, under the app's prefix |
| `{ path?, keepAlive? }` | the same, with these options |

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `path` | `` `/${string}` `` | the endpoint's `path` | where a client opens its socket, under the app's prefix |
| `keepAlive` | `number \| false` | `12_000` | milliseconds between the WebSocket pings the server sends each socket, so a proxy does not close an idle subscription; `false` for none. Anything but a finite positive number throws where `graphql()` is declared |

```ts no-check
graphql(app, { schema, ws: { path: '/graphql/ws', keepAlive: 30_000 } });
```

A socket at a path of its own runs the endpoint's Yoga: its plugins are
set up once, for both. Queries, mutations and subscriptions all run over a
socket. The socket
route shows in the route table `listen` prints in dev, as `WS /graphql`.

## The upgrade runs the app's middlewares

The socket is a route of `@alxia/core` ([WebSockets](../../../core/docs/guide/websockets.md)):
the upgrade request runs every middleware given to `use` before
`graphql()`, every `derive` and `decorate`, then opens. A guard refuses the
socket with its own answer — a `401` — and the client never connects; what
the middlewares add is in every resolver's context, typed as over HTTP:

```ts
import { alxia, defineMiddleware } from '@alxia/core';
import { type GraphQLContext, graphql } from '@alxia/graphql';
import { createSchema } from 'graphql-yoga';

// A browser cannot set a header on a WebSocket: the token comes in the URL
// or a cookie there. A server-side client can send `authorization`.
const viewer = defineMiddleware(({ url, reply }, next) => {
	const token = url.searchParams.get('token');
	return token === null ? reply(401, { error: 'unauthorized' as const }) : next({ viewer: token });
});

const base = alxia().use(viewer);

const schema = createSchema<GraphQLContext<typeof base>>({
	typeDefs: /* GraphQL */ `
		type Query { me: String! }
		type Subscription { countdown(from: Int!): Int! }
	`,
	resolvers: {
		Query: { me: (_, __, { viewer }) => viewer }, // over HTTP and over the socket
		Subscription: {
			countdown: {
				async *subscribe(_, { from }: { from: number }) {
					for (let n = from; n >= 0; n--) yield { countdown: n };
				},
			},
		},
	},
});

export const app = base.plugin((app) => graphql(app, { schema, ws: true }));
```

The upgrade names `graphql-transport-ws` in its `101` when the client
offers it; a client that offers only another subprotocol is closed with
`4406 Subprotocol not acceptable` ([Troubleshooting](../troubleshooting.md#4406-subprotocol-not-acceptable)).

## The context of an operation over the socket

Each operation runs through Yoga's envelop, as over HTTP: its plugins
apply — Envelop's and Yoga's, masked errors, depth limits — and its
`context` option is called. The context holds:

- what the upgrade's middlewares added, `set` and `ip` included;
- `params`: the operation's `query`, `variables`, `operationName`;
- `request`: the upgrade's URL and headers, as a `POST` — to Yoga an
  operation over the socket is one, so a mutation runs — its `signal`
  aborted when the socket closes;
- `connectionParams`: what the client sent when it connected
  (`connectionParams` of `createClient`), `undefined` over HTTP.

```ts
import type { GraphQLContext } from '@alxia/graphql';
import { createSchema } from 'graphql-yoga';
import type { app } from './app';

const schema = createSchema<GraphQLContext<typeof app>>({
	typeDefs: /* GraphQL */ 'type Query { device: String }',
	resolvers: {
		Query: {
			device: (_, __, { connectionParams }) => String(connectionParams?.['device'] ?? 'unknown'),
		},
	},
});
```

`connectionParams` is `Readonly<Record<string, unknown>>`: parse it
before you trust it. A header the upgrade's middlewares set with
`set.headers` is sent with the `101`; set during an operation, it goes
nowhere.

## Logging and tracing

`@alxia/logger` and `@alxia/telemetry` see the upgrade request, `101`, and
not the operations on the socket: the request is answered before they run,
so none of them gets an `operationName` or a span. Log from a Yoga plugin's
`onExecute` for now; each operation over the socket is on the
[roadmap](../roadmap.md).

## Errors

An error stays GraphQL's. A resolver's arrives in a `next` message with
`errors[]` — masked to `Unexpected error.` unless `maskedErrors` says
otherwise — and the subscription goes on or completes as over HTTP. A
query that does not parse or validate is answered with an `error`
message, the protocol's, and the socket stays open.

## Shutdown

On `SIGTERM`, `SIGINT` or `stop()`, `/ready` turns 503 and every socket is
closed with `1001 going away`: each subscription on it completes, its
resolver's iterator returned, so the drain does not wait for it. A
`graphql-ws` client retries on `1001`, by default, and reaches another
instance.

## Clients

`graphql-ws`'s own client, in Bun or a browser:

```ts no-check
import { createClient } from 'graphql-ws';

const client = createClient({
	url: 'wss://api.example.com/graphql?token=…',
	connectionParams: { device: 'web' },
});

for await (const result of client.iterate({ query: 'subscription { countdown(from: 3) }' })) {
	console.log(result); // { data: { countdown: 3 } }, …
}
```

Apollo Client: subscriptions over the socket, the rest over HTTP.

```ts no-check
import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

const ws = new GraphQLWsLink(createClient({ url: 'wss://api.example.com/graphql' }));
const http = new HttpLink({ uri: 'https://api.example.com/graphql' });

const client = new ApolloClient({
	cache: new InMemoryCache(),
	link: ApolloLink.split(({ query }) => {
		const definition = getMainDefinition(query);
		return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
	}, ws, http),
});
```

urql:

```ts no-check
import { Client, cacheExchange, fetchExchange, subscriptionExchange } from 'urql';
import { createClient } from 'graphql-ws';

const ws = createClient({ url: 'wss://api.example.com/graphql' });

const client = new Client({
	url: 'https://api.example.com/graphql',
	exchanges: [
		cacheExchange,
		fetchExchange,
		subscriptionExchange({
			forwardSubscription: (request) => ({
				subscribe: (sink) => ({ unsubscribe: ws.subscribe({ ...request, query: request.query ?? '' }, sink) }),
			}),
		}),
	],
});
```

GraphiQL can subscribe over the socket too: `graphiql: {
subscriptionsProtocol: 'WS' }`.

## Testing it

A socket needs a server: `listen({ port: 0 })`, then `graphql-ws`'s client
with Bun's `WebSocket`. Here `app` is the guarded one
[above](#the-upgrade-runs-the-apps-middlewares), its token in the URL.

```ts no-check
import { afterAll, expect, test } from 'bun:test';
import { createClient } from 'graphql-ws';
import { app } from './app';

const server = app.listen({ port: 0, signals: false });
afterAll(() => app.stop(true));

test('a subscription over the socket', async () => {
	const url = new URL('/graphql?token=ada', server.url);
	url.protocol = 'ws:';
	const client = createClient({ url: url.href, webSocketImpl: WebSocket, retryAttempts: 0 });
	const results = [];
	for await (const result of client.iterate({ query: 'subscription { countdown(from: 1) }' })) {
		results.push(result);
	}
	expect(results).toEqual([{ data: { countdown: 1 } }, { data: { countdown: 0 } }]);
	await client.dispose();
});
```

## See also

- [Yoga's plugins and options](yoga.md#subscriptions): subscriptions over
  server-sent events, `createPubSub`.
- [Mounting the endpoint](endpoint.md#errors-health-and-shutdown): the
  drain, health probes.
- [`@alxia/core`'s WebSockets](../../../core/docs/guide/websockets.md):
  socket routes, the upgrade.
