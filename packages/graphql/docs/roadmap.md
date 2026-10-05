# Roadmap

What `@alxia/graphql` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/graphql/CHANGELOG.md).

## Now

- **GraphiQL in dev alone, under a pinned policy.** Without `ide`, a
  browser gets GraphiQL only while the serving app is in dev
  (`NODE_ENV=development`, or `alxia({ dev: true })`); `ide: 'graphiql'`
  serves it everywhere. Its `Content-Security-Policy` allows the one
  pinned `@graphql-yoga/graphiql` folder it loads from, the Monaco workers
  included, and no frame ([IDE guide](guide/ide.md)).
- **Subscriptions drained on shutdown.** When the app starts shutting
  down — `SIGTERM`, `SIGINT`, `stop()` — a subscription over server-sent
  events ends, so `@alxia/core`'s drain answers the queries in flight and
  exits without waiting for it; `health()` probes mount beside the
  endpoint, and GraphQL errors stay in `errors[]` under core's problem
  details ([endpoint guide](guide/endpoint.md#errors-health-and-shutdown)).
- **GraphQL over WebSocket.** `ws: true` serves the endpoint over
  WebSocket too, with the `graphql-transport-ws` protocol of `graphql-ws`
  — Apollo Client's and urql's default — beside server-sent events: the
  upgrade runs the app's middlewares, so a guard refuses the socket and a
  resolver reads what they added; each operation runs through Yoga's
  plugins, with the client's `connectionParams` in its context; a
  shutdown closes the sockets with 1001 and completes their subscriptions
  ([WebSocket guide](guide/websockets.md)).

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Shipped

### 0.1.0

- **GraphQL Yoga as a route.** `graphql(app, options)` serves a schema at
  `GET` and `POST` `/graphql`, or any `path`, under the app's prefix and
  the prefix of every app it is mounted into. The endpoint runs behind the
  app's middlewares like any route: a guard given to `use` before it guards it, and its
  reply is part of the endpoint's type.
- **The app's context in every resolver, typed and checked.**
  `GraphQLContext<typeof app>` types a schema with Yoga's context and
  everything the app's middlewares add — a user, a database handle — plus `set`,
  through which a resolver sets a header or a cookie. A schema whose
  resolvers read what the app does not build is a compile error naming the
  missing field, and `GraphQLContext` of anything but an app is a message
  that fails the first resolver reading a field.
- **Yoga whole.** Every Yoga option passes through: its plugins and
  Envelop's, the `context` factory, error masking, batching, logging.
  Subscriptions are served over server-sent events.
- **An IDE, or none.** A browser at the endpoint gets Yoga's GraphiQL by
  default, or Apollo Sandbox pointed at the address it was opened at —
  `https` behind a proxy that terminates TLS — each with
  a `Content-Security-Policy` that lets it load; `ide: false` turns it off.
  `renderSandbox` and `SANDBOX_POLICY` serve the Sandbox page anywhere else.
- **CORS left to the app.** Yoga's own CORS is off, so `@alxia/cors`
  answers for the whole app, the endpoint included.
