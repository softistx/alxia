# Mounting the endpoint

This page covers `graphql(app, options)`: where the endpoint is served, what
it answers, which middlewares run before it, and how to test it.

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
	.plugin((app) => graphql(app, { schema })); // GET and POST /graphql

app.listen(3000);
```

```sh
curl localhost:3000/graphql -H 'content-type: application/json' -d '{"query":"{ hello }"}'
# {"data":{"hello":"world"}}
```

## `graphql`

```ts
function graphql<Ctx, Prefix, SchemaCtx, UserCtx = Empty, const Path = '/graphql'>(
	app: Alxia<Ctx, Prefix>,
	options: GraphQLOptions<ServerContext<Ctx>, UserCtx, Path, SchemaCtx>,
): Alxia<Ctx, Prefix>;
```

`graphql` declares a `GET` and a `POST` route at `path` on `app`, and returns
`app`, its type unchanged. Hand it to `app.plugin` as a function, so
it stays in the chain and sees the app as typed so far:

```ts
const app = base.plugin((app) => graphql(app, { schema }));
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
mounted into:

```ts
import { alxia } from '@alxia/core';

const api = alxia({ prefix: '/api' })
	.plugin((app) => graphql(app, { schema, path: '/gql' })); // /api/gql

const root = alxia({ prefix: '/v1' }).plugin(api);           // /v1/api/gql

root.routes.map((route) => `${route.method} ${route.path}`); // ['GET /v1/api/gql', 'POST /v1/api/gql']
```

Two endpoints on one app need two paths: declaring the default path twice
throws `GET /graphql is declared twice` when the app is built. Give each its
own path:

```ts
const app = alxia()
	.plugin((app) => graphql(app, { schema }))
	.plugin((app) => graphql(app, { schema: admin, path: '/admin/graphql' }));
```

## Behind the app's middlewares

The endpoint is a route like any other: every middleware given to `use`
**before** it runs first, and one that replies ends the request there. A
guard before it guards it — a plain `(ctx, next)` function, what it passes
`next` typed into each resolver's context:

```ts
const app = alxia()
	.use(({ request, reply }, next) =>
		request.headers.get('authorization') === `Bearer ${Bun.env['API_TOKEN']}`
			? next({ viewer: 'service' })
			: reply(401, { error: 'unauthorized' as const }),
	)
	.plugin((app) => graphql(app, { schema })); // 401 without the token
```

`@alxia/jwt`'s `bearer()` is that guard for a JWT: `.use(bearer({ jwt }))`
([The typed context](context.md#with-a-token-alxiajwt)).

A middleware declared **after** `app.plugin` does not run for the endpoint: it
answers without it. Give the observers (`@alxia/logger`, `@alxia/cors`,
`@alxia/secure-headers`, `@alxia/compress`) to `use` first, so they wrap the
endpoint, and every other request, the 404s included:

```ts
import { alxia } from '@alxia/core';
import { cors } from '@alxia/cors';
import { graphql } from '@alxia/graphql';
import { logger } from '@alxia/logger';
import { secureHeaders } from '@alxia/secure-headers';

const app = alxia()
	.use(logger())
	.use(secureHeaders())
	.use(cors({ origin: 'https://app.example.com' }))
	.plugin((app) => graphql(app, { schema }));
```

A guard given to the app's `use` (`bearer`, a required session) also runs on
a request no route matches: an anonymous request to a missing path is a 401,
not a 404. The order is core's, explained in
[Middlewares](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/middleware.md).

What the middlewares added is in each resolver's context: that is the next page,
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
| a middleware replied first | that middleware's reply, such as a `401` |

```text
POST {"query":"{ nope }"}             → 200 {"errors":[{"message":"Cannot query field \"nope\" on type \"Query\".", … "extensions":{"code":"GRAPHQL_VALIDATION_FAILED"}}]}
GET  ?query=mutation { m }            → 405 {"errors":[{"message":"Can only perform a mutation operation from a POST request.","extensions":{"code":"BAD_REQUEST"}}]}
POST {}                               → 200 {"errors":[{"message":"Must provide query string.","extensions":{"code":"BAD_REQUEST"}}]}
```

Both methods answer a body to read as GraphQL, whatever its status, and
the replies of the middlewares before them — a guard's `401`, say.

## Errors, health and shutdown

**GraphQL errors stay GraphQL's.** A resolver that throws, a query that
does not validate, is an entry of `errors[]` in Yoga's answer — inside a
`200`, as the GraphQL over HTTP specification has it — whatever
`@alxia/core`'s `errors` option says. `alxia({ errors: 'problem' })`
applies to the HTTP layer around the endpoint: `@alxia/jwt`'s 401 before
it, a body past its `bodyLimit` (413), a middleware's 500, a `PUT` at its
path (405) — each an `application/problem+json` problem
([core's errors guide](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/errors.md#graphql)).

```text
POST {"query":"{ boom }"}      → 200 {"data":{"boom":null},"errors":[{"message":"Unexpected error.", …}]}
POST without a token           → 401 application/problem+json {"type":"about:blank","title":"Unauthorized", …}
```

**Probes and the drain.** `@alxia/core`'s `health()` mounts beside the
endpoint, and `listen`'s graceful shutdown covers it: on `SIGTERM` a
query or a mutation in flight is answered, and a subscription over
server-sent events ends — its stream cancelled as when the client leaves,
the client reading the end and reconnecting elsewhere — so the drain does
not wait for it until `shutdownTimeout`.

```ts
import { alxia, health } from '@alxia/core';
import { bearer } from '@alxia/jwt';
import { graphql } from '@alxia/graphql';

const app = alxia({ errors: 'problem' })
	.plugin(health({ checks: { db: () => sql`select 1` } }))
	.use(bearer({ jwt }))
	.plugin((app) => graphql(app, { schema }));

app.listen({ port: 4000 }); // SIGTERM: /ready 503, queries answered, subscriptions ended, exit 0
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

const app = alxia().plugin((app) => graphql(app, { schema, logging: false }));

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
