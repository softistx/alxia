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
  request. `@alxia/compress` leaves an event stream alone by default.
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

## API

| export | |
| --- | --- |
| `graphql(app, options)` | the endpoint: `schema`, `path`, `ide`, `sandbox`, and every Yoga option |
| `renderSandbox(endpoint, options?)`, `SANDBOX_POLICY` | the Sandbox page, and the policy it loads under |
| `SandboxOptions` | its options: `title`, `initialDocument`, `initialHeaders`, `pollForSchemaUpdates`, `includeCookies` |
| `GraphQLContext<App, UserContext?>` | what a resolver reads |
| `ServerContext<Ctx>`, `GraphQLOptions` | its types |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/graphql/docs): a page per area — mounting the endpoint, the typed context, Yoga's plugins and options, and GraphiQL and Apollo Sandbox.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/graphql/docs/troubleshooting.md): an error message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/graphql/docs/roadmap.md): what is coming, and what is not planned.
- [Recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md): [A GraphQL API](https://github.com/softistx/alxia/blob/develop/docs/recipes/graphql-api.md), [Authenticate requests](https://github.com/softistx/alxia/blob/develop/docs/recipes/authentication.md), [Test an alxia app](https://github.com/softistx/alxia/blob/develop/docs/recipes/testing.md), [Health checks and graceful shutdown](https://github.com/softistx/alxia/blob/develop/docs/recipes/health-and-shutdown.md), and more.
