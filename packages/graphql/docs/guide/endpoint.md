# Mounting the endpoint

This page covers `graphql(app, options)`: where the endpoint is served, what
it answers, which hooks run before it, and how to test it.

```ts
import { alxia } from '@alxia/core';
import { graphql } from '@alxia/graphql';
import { createSchema } from 'graphql-yoga';

const schema = createSchema({
	typeDefs: /* GraphQL */ `type Query { hello: String! }`,
	resolvers: { Query: { hello: () => 'world' } },
});

const app = alxia()
	.get('/health', ({ reply }) => reply(200, 'ok'))
	.use((app) => graphql(app, { schema })); // GET and POST /graphql

app.listen(3000);
```

```sh
curl localhost:3000/graphql -H 'content-type: application/json' -d '{"query":"{ hello }"}'
# {"data":{"hello":"world"}}
```

## `graphql`

```ts
function graphql<Ctx, Routes, Prefix, Shortcuts, SchemaCtx, UserCtx = Empty, const Path = '/graphql'>(
	app: Alxia<Ctx, Routes, Prefix, Shortcuts>,
	options: GraphQLOptions<ServerContext<Ctx>, UserCtx, Path, SchemaCtx>,
): Alxia<Ctx, Routes & GraphQLRoutes<JoinPath<Prefix, Path>, Shortcuts>, Prefix, Shortcuts>;
```

`graphql` declares a `GET` and a `POST` route at `path` on `app`, and returns
`app` with those two routes in its type. Hand it to `use` as a function, so
it stays in the chain and sees the app as typed so far:

```ts
const app = base.use((app) => graphql(app, { schema }));
```

Calling it directly does the same: `graphql(base, { schema })` declares the
routes on `base` and returns it.

### Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `schema` | `GraphQLSchemaWithContext<SchemaCtx>` | — | The schema, from Yoga's `createSchema` or any tool that types its context. Its context is checked against the app's: see [The typed context](context.md). |
| `path` | `` `/${string}` `` | `'/graphql'` | Where the endpoint is, under the app's prefix. |
| `ide` | `'graphiql' \| 'apollo-sandbox' \| false` | `'graphiql'` | What a browser gets at the endpoint: see [GraphiQL and Apollo Sandbox](ide.md). |
| `graphiql` | Yoga's `GraphiQLOptions` | Yoga's | GraphiQL's options, when `ide` is `'graphiql'`. |
| `sandbox` | `SandboxOptions` | — | Apollo Sandbox's options, when `ide` is `'apollo-sandbox'`. |
| `cors` | Yoga's `cors` | `false` | Yoga's own CORS. Off: use `@alxia/cors` for the whole app instead ([Yoga's plugins and options](yoga.md#cors)). |
| every other Yoga option | | Yoga's | `plugins`, `context`, `maskedErrors`, `batching`, `logging`… passed to `createYoga` as they are: see [Yoga's plugins and options](yoga.md). |

`graphqlEndpoint` is not an option: `path` sets it.

## Where it is served

`path` is joined to the app's prefix, and to the prefix of every app it is
mounted into, in the routes' type as at runtime:

```ts
import { alxia, type RoutesOf } from '@alxia/core';

const api = alxia({ prefix: '/api' })
	.use((app) => graphql(app, { schema, path: '/gql' })); // /api/gql

const root = alxia({ prefix: '/v1' }).use(api);           // /v1/api/gql

type Paths = keyof RoutesOf<typeof root>;                  // '/v1/api/gql'
```

Two endpoints on one app need two paths: declaring the default path twice
throws `GET /graphql is declared twice` when the app is built. Give each its
own path:

```ts
const app = alxia()
	.use((app) => graphql(app, { schema }))
	.use((app) => graphql(app, { schema: admin, path: '/admin/graphql' }));
```

## Behind the app's hooks

The endpoint is a route like any other: every route hook declared **before**
it runs first, and one that replies ends the request there. A guard before
it guards it:

```ts
const app = alxia()
	.derive(({ request, reply }) =>
		request.headers.get('authorization') === `Bearer ${Bun.env['API_TOKEN']}`
			? { viewer: 'service' }
			: reply(401, { error: 'unauthorized' as const }),
	)
	.use((app) => graphql(app, { schema })); // 401 without the token
```

A hook declared **after** `use` does not run for it: the endpoint answers
without it. The order is core's, explained in
[Hooks](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/hooks.md#route-hooks-and-global-hooks).
Global hooks — `onRequest`, `onResponse`, `around`, and the plugins built on
them, such as `@alxia/cors` or `@alxia/secure-headers` — apply wherever they
are declared.

What the hooks added is in each resolver's context: that is the next page,
[The typed context](context.md).

## What it answers

Yoga answers the request; the package passes its status, headers and body
through as the route's reply, and adds a `Content-Security-Policy` to an
IDE page ([GraphiQL and Apollo Sandbox](ide.md)).

| Request | Answer |
| --- | --- |
| `POST` with `{"query": …}` | `200` and `{"data": …}`, with `errors` beside it when a resolver failed |
| `GET ?query=…` | the same, for a query; a mutation is a `405` |
| `POST` a subscription with `Accept: text/event-stream` | `200`, a `text/event-stream` of results ([subscriptions](yoga.md#subscriptions)) |
| `GET` from a browser (`Accept: text/html`), no `query` | the IDE page; with `ide: false`, a GraphQL answer (`Must provide query string.`) |
| a hook replied first | that hook's reply, such as a `401` |

```text
POST {"query":"{ nope }"}             → 200 {"errors":[{"message":"Cannot query field \"nope\" on type \"Query\".", … "extensions":{"code":"GRAPHQL_VALIDATION_FAILED"}}]}
GET  ?query=mutation { m }            → 405 {"errors":[{"message":"Can only perform a mutation operation from a POST request.","extensions":{"code":"BAD_REQUEST"}}]}
POST {}                               → 200 {"errors":[{"message":"Must provide query string.","extensions":{"code":"BAD_REQUEST"}}]}
```

The reply's type is `Reply<StatusCode, ReadableStream<Uint8Array> | undefined>`
for both methods, plus the replies of the hooks before it: a typed client
sees a body to read as GraphQL, and the guard's `401`.

```ts
type GraphQLRoutes<Path extends string, Shortcuts extends AnyReply> =
	RouteEntryOf<'GET', Path, Empty, GraphQLReply, Shortcuts> &
	RouteEntryOf<'POST', Path, Empty, GraphQLReply, Shortcuts>;
```

## Testing it

The endpoint runs in process through `app.request` or `app.fetch`, like
every alxia route: no server, no port. `logging: false` keeps Yoga's
logger quiet in the test output.

```ts
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { graphql } from '@alxia/graphql';
import { createSchema } from 'graphql-yoga';

const schema = createSchema({
	typeDefs: /* GraphQL */ `type Query { hello(name: String!): String! }`,
	resolvers: { Query: { hello: (_, { name }: { name: string }) => `hello ${name}` } },
});

const app = alxia().use((app) => graphql(app, { schema, logging: false }));

const execute = (query: string, variables?: Record<string, unknown>) =>
	app.request('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query, variables }),
	});

describe('graphql', () => {
	test('hello', async () => {
		const response = await execute('query ($name: String!) { hello(name: $name) }', { name: 'Ada' });
		expect(await response.json()).toEqual({ data: { hello: 'hello Ada' } });
	});
});
```

## See also

- [The typed context](context.md): what a resolver reads, and the compile
  error when the app does not build it.
- [Yoga's plugins and options](yoga.md): plugins, errors, subscriptions,
  CORS.
- [GraphiQL and Apollo Sandbox](ide.md): the page a browser gets.
