# Roadmap

What `@alxia/graphql` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/graphql/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Shipped

### 0.1.0

- **GraphQL Yoga as a route.** `graphql(app, options)` serves a schema at
  `GET` and `POST` `/graphql`, or any `path`, under the app's prefix and
  the prefix of every app it is mounted into. The endpoint runs behind the
  app's hooks like any route: a guard declared before it guards it, and its
  reply is part of the endpoint's type.
- **The app's context in every resolver, typed and checked.**
  `GraphQLContext<typeof app>` types a schema with Yoga's context and
  everything the app's hooks add — a user, a database handle — plus `set`,
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
