# Yoga's plugins and options

This page covers what passes through to GraphQL Yoga: its plugins and
Envelop's, error masking, batching, subscriptions over server-sent events
(and over WebSocket with [`ws`](websockets.md)),
and how CORS and compression meet the endpoint.

```ts
import { alxia } from '@alxia/core';
import { graphql } from '@alxia/graphql';
import { createSchema, useExecutionCancellation } from 'graphql-yoga';

const schema = createSchema({
	typeDefs: /* GraphQL */ `type Query { hello: String! }`,
	resolvers: { Query: { hello: () => 'world' } },
});

const app = alxia().plugin((app) =>
	graphql(app, {
		schema,
		plugins: [useExecutionCancellation()], // stop resolvers when the client goes away
		batching: { limit: 5 },
		logging: Bun.env['NODE_ENV'] === 'production' ? 'warn' : 'debug',
	}),
);
```

## What passes through

`GraphQLOptions` is Yoga's `YogaServerOptions`, minus four keys the package
owns:

| Yoga's option | Here |
| --- | --- |
| `graphqlEndpoint` | set from `path` and the app's prefix ([Mounting the endpoint](endpoint.md#where-it-is-served)) |
| `graphiql` | set from `ide`; `graphiql` takes GraphiQL's options only, not `true`/`false` ([GraphiQL and Apollo Sandbox](ide.md)) |
| `cors` | `false` unless given ([CORS](#cors)) |
| `schema` | required, and checked against the app's context ([The typed context](context.md)) |

Everything else — `plugins`, `context`, `maskedErrors`, `batching`,
`logging`, `landingPage`, `healthCheckEndpoint`, `parserAndValidationCache`,
`multipart`… — goes to `createYoga` as it is, with Yoga's defaults. Its
reference is [Yoga's documentation](https://the-guild.dev/graphql/yoga-server/docs).

## Plugins

`plugins` takes Yoga's plugins and Envelop's, in the order they run. Those
Yoga ships are imported from `graphql-yoga`; the others are packages of their
own, installed beside it:

```sh
bun add @envelop/depth-limit @graphql-yoga/plugin-response-cache
```

```ts
import { useDepthLimit } from '@envelop/depth-limit';
import { useResponseCache } from '@graphql-yoga/plugin-response-cache';

graphql(app, {
	schema,
	plugins: [
		useDepthLimit({ maxDepth: 8 }),
		useResponseCache({ session: ({ request }) => request.headers.get('authorization') }),
	],
});
```

A plugin of your own is an object of hooks, typed `Plugin`:

```ts
import { type Plugin } from 'graphql-yoga';

const slowOperations: Plugin = {
	onExecute: ({ args }) => {
		const started = performance.now();
		return {
			onExecuteDone: () => {
				const ms = performance.now() - started;
				if (ms > 500) console.warn(`slow operation ${args.operationName ?? 'anonymous'}: ${ms}ms`);
			},
		};
	},
};

graphql(app, { schema, plugins: [slowOperations] });
```

Yoga's plugins run inside the route, after the app's middlewares: a plugin
sees only requests the middlewares let through, and its context holds what
they added.

## Errors

Yoga masks errors by default (`maskedErrors: true`): an `Error` thrown by a
resolver reaches the client as `Unexpected error.`, and its message — a
connection string, a stack — stays on the server.

```text
200 {"errors":[{"message":"Unexpected error.","path":["crash"],"extensions":{"code":"INTERNAL_SERVER_ERROR"}}],"data":{"crash":null}}
```

An error meant for the client is a `GraphQLError`; `createGraphQLError`
makes one, with a code and an HTTP status in its extensions:

```ts
import { createGraphQLError } from 'graphql-yoga';

const resolvers = {
	Query: {
		admin: (_: unknown, __: unknown, { viewer }: GraphQLContext<typeof base>) => {
			if (viewer !== 'admin')
				throw createGraphQLError('Admins only', {
					extensions: { code: 'FORBIDDEN', http: { status: 403 } },
				});
			return 'welcome';
		},
	},
};
```

```text
403 {"errors":[{"message":"Admins only","path":["admin"],"extensions":{"code":"FORBIDDEN"}}],"data":{"admin":null}}
```

`maskedErrors: false` sends every message as it is: for development only.
A resolver's error is Yoga's to answer; it never reaches a try/catch
middleware before the endpoint, which sees only what fails around it — a
middleware that throws, say.

## Batching

`batching` lets a client send an array of operations in one `POST`, and
get an array of results:

```ts
graphql(app, { schema, batching: { limit: 5 } });
```

```text
POST [{"query":"{ admin }"},{"query":"{ __typename }"}]
200  [{"data":{"admin":"welcome"}},{"data":{"__typename":"Query"}}]
```

A batch is one request, so one log line and one span: `@alxia/logger` writes
`operationType: 'batch'` and every name, `operationName: 'GetNotes,AddNote'`,
and `@alxia/telemetry` names the span `batch GetNotes,AddNote`
([endpoint guide](endpoint.md#the-operation-in-the-log-and-the-trace)).

## Subscriptions

Subscriptions are served over server-sent events, Yoga's default: a
`POST` (or `GET`) with `Accept: text/event-stream` gets a stream of results.
A resolver's `subscribe` is an async iterable — an `async *` generator, or
Yoga's `createPubSub`:

```ts
import { createPubSub, createSchema } from 'graphql-yoga';

const pubsub = createPubSub<{ message: [{ text: string }] }>();

const schema = createSchema({
	typeDefs: /* GraphQL */ `
		type Query { ok: Boolean }
		type Mutation { send(text: String!): Boolean! }
		type Subscription { message: String!, countdown(from: Int!): Int! }
	`,
	resolvers: {
		Mutation: {
			send: (_, { text }: { text: string }) => {
				pubsub.publish('message', { text });
				return true;
			},
		},
		Subscription: {
			message: {
				subscribe: () => pubsub.subscribe('message'),
				resolve: (payload: { text: string }) => payload.text,
			},
			countdown: {
				async *subscribe(_, { from }: { from: number }) {
					for (let n = from; n >= 0; n--) yield { countdown: n };
				},
			},
		},
	},
});
```

```sh
curl -N localhost:3000/graphql -H 'content-type: application/json' -H 'accept: text/event-stream' \
  -d '{"query":"subscription { countdown(from: 2) }"}'
# event: next
# data: {"data":{"countdown":2}}
# …
```

A subscription asked for with `Accept: application/json` is refused with
`406`. A client that speaks WebSocket — `graphql-ws`, Apollo Client's
`GraphQLWsLink`, urql's `subscriptionExchange` — needs `ws: true`
([GraphQL over WebSocket](websockets.md)); server-sent events stay served
beside it. `createPubSub` lives in one
process; across several, give it an event target backed by a broker, as
[Yoga's subscriptions guide](https://the-guild.dev/graphql/yoga-server/docs/features/subscriptions)
describes.

`@alxia/compress` leaves a `text/event-stream` alone by default, so results
are sent as they are produced. A `compressible` that lets event streams in
still sends each result at once: a streamed body is flushed as it comes.

## CORS

Yoga's own CORS is off (`cors: false`): the endpoint is a route of the app,
and `@alxia/cors` answers for the whole app, preflights included.

```ts
import { alxia } from '@alxia/core';
import { cors } from '@alxia/cors';
import { graphql } from '@alxia/graphql';

const app = alxia()
	.use(cors({ origin: 'https://app.example.com', credentials: true }))
	.plugin((app) => graphql(app, { schema }));
// OPTIONS /graphql → 204, Access-Control-Allow-Origin: https://app.example.com
```

Without it, a browser's preflight `OPTIONS /graphql` is a
`405 {"error":"method_not_allowed"}`, and the browser blocks the call.
Passing Yoga's `cors` turns Yoga's on for this endpoint; do not use both.

## See also

- [Mounting the endpoint](endpoint.md): what the endpoint answers.
- [The typed context](context.md): the `context` option.
- [Troubleshooting](../troubleshooting.md): `Unexpected error.`, the `406`
  and the `405`.
