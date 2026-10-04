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
	ide: process.env.NODE_ENV === 'production' ? false : 'apollo-sandbox',
	batching: true,
});
```

- **Subscriptions** are served over server-sent events, Yoga's default:
  `async *subscribe` in a resolver, `Accept: text/event-stream` on the
  request. `@alxia/compress` leaves an event stream alone by default.
- **An IDE** answers a `GET` from a browser at the endpoint, with a
  `Content-Security-Policy` that lets it load — `@alxia/secure-headers`
  keeps it. `ide` chooses which:

  ```ts
  graphql(app, { schema, ide: 'apollo-sandbox', sandbox: { initialDocument: '{ me }' } });
  graphql(app, { schema, ide: Bun.env.NODE_ENV === 'production' ? false : 'graphiql' });
  ```

  | `ide` | |
  | --- | --- |
  | `'graphiql'` (default) | Yoga's GraphiQL; `graphiql` takes its options |
  | `'apollo-sandbox'` | [Apollo Sandbox](https://www.apollographql.com/docs/graphos/platform/sandbox), embedded, pointed at the address the page was opened at, prefix included — `https` behind a proxy that terminates TLS ([IDE guide](https://github.com/softistx/alxia/blob/develop/packages/graphql/docs/guide/ide.md#apollo-sandbox)). `sandbox` takes `title`, `initialDocument`, `initialHeaders`, `pollForSchemaUpdates`, `includeCookies` |
  | `false` | none |
- **CORS** is `@alxia/cors`'s for the whole app: Yoga's own is off unless
  `cors` is given.

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
