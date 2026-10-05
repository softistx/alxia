# @alxia/graphql

## 0.6.2

### Patch Changes

- Updated dependencies [[`3385725`](https://github.com/softistx/alxia/commit/33857253e8a67fc33f39884d58bdd55377ae2915), [`da95f24`](https://github.com/softistx/alxia/commit/da95f24391b942db81c082c253aeeaa5fcade07b)]:
  - @alxia/core@0.10.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`86af86e`](https://github.com/softistx/alxia/commit/86af86e9c73dbc5084a468113de1ec98207cfdf0), [`17d28fe`](https://github.com/softistx/alxia/commit/17d28fe08a73e4c549f04b98411364ff5c6715f5), [`bc2573c`](https://github.com/softistx/alxia/commit/bc2573c7eb045fcfd954fa5457a340abefc32579)]:
  - @alxia/core@0.9.0

## 0.6.0

### Minor Changes

- [#182](https://github.com/softistx/alxia/pull/182) [`9ab4a7f`](https://github.com/softistx/alxia/commit/9ab4a7fd3a62545b15f788e3c6da51ac73de2705) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Tell the observers around a `ws: true` upgrade of each operation on the socket, from its `subscribe` message to its end, with its type, its name and whether it was answered with errors: `@alxia/logger` writes a line for each, `@alxia/telemetry` a span.

### Patch Changes

- [#184](https://github.com/softistx/alxia/pull/184) [`e17dfd8`](https://github.com/softistx/alxia/commit/e17dfd8889e6900ba4394e0a15dd96b9ac78f33c) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A body past core's `bodyLimit` is answered with core's 413 (problem+json under `errors: 'problem'`), with a `Content-Length` or chunked, instead of Yoga's 400 "POST body sent invalid JSON."; and Yoga's 400 for a request it cannot parse no longer carries the parser's error in `extensions.originalError`.

- [#178](https://github.com/softistx/alxia/pull/178) [`f08d901`](https://github.com/softistx/alxia/commit/f08d901ea5dd553a029382b6f18460306d1a1ae5) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A guide page, "Harden a GraphQL API for production": rate limiting the endpoint (by viewer, or by `forwardedIp` behind a proxy; a batch is one request), depth limits, introspection off outside development with `isDev`, masked errors and the `GraphQLError`s a client may read, `bodyLimit` (Yoga answers a body past it with a 400), CSRF for a cookie session, and persisted operations, each snippet type-checked and run in the GraphQL recipe.
- Updated dependencies [[`89aa1df`](https://github.com/softistx/alxia/commit/89aa1df408840165fca6eb189aabedc3fee498ba), [`4a6df2b`](https://github.com/softistx/alxia/commit/4a6df2b1cfc4bf87c4f5b38a856c3157acf1e42f), [`e536262`](https://github.com/softistx/alxia/commit/e5362622a260faa3320bc1cdbd456bae07565953), [`d256d6a`](https://github.com/softistx/alxia/commit/d256d6a169bb9a532014814c3aea888fd592c762), [`9ab4a7f`](https://github.com/softistx/alxia/commit/9ab4a7fd3a62545b15f788e3c6da51ac73de2705)]:
  - @alxia/core@0.8.0

## 0.5.0

### Minor Changes

- [#172](https://github.com/softistx/alxia/pull/172) [`28cdcfe`](https://github.com/softistx/alxia/commit/28cdcfe800ca90cfadacf48662fac0fc99b4f63b) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The endpoint reports each operation it executes or subscribes to, its type and its name, to the middlewares around it, through a Yoga plugin added after the app's own: `@alxia/logger` and `@alxia/telemetry` now say `GetNotes` where every call was an anonymous `POST /graphql`. A batched body reports each operation; a request refused before it executes, and an operation over `ws: true`, report none. Needs `@alxia/core` with `reportOperation`.

### Patch Changes

- Updated dependencies [[`28cdcfe`](https://github.com/softistx/alxia/commit/28cdcfe800ca90cfadacf48662fac0fc99b4f63b)]:
  - @alxia/core@0.7.0

## 0.4.0

### Minor Changes

- [#164](https://github.com/softistx/alxia/pull/164) [`4b75042`](https://github.com/softistx/alxia/commit/4b75042a6eca327856254d7864ad27cae6cb11d9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Serve GraphQL over WebSocket with `ws: true`: the `graphql-transport-ws` protocol of `graphql-ws`, an optional peer, the default of Apollo Client's `GraphQLWsLink` and urql's `subscriptionExchange`, at the endpoint's path beside server-sent events. The upgrade runs the app's middlewares, so a guard refuses the socket and a resolver reads what they added; each operation runs through Yoga's plugins, with the client's `connectionParams` in its context (`GraphQLWsContext`); a shutdown closes the sockets with 1001 and completes their subscriptions. `ws: { path, keepAlive }` moves the socket or spaces its pings.

## 0.3.1

### Patch Changes

- [#161](https://github.com/softistx/alxia/pull/161) [`4f2daa4`](https://github.com/softistx/alxia/commit/4f2daa4da46fc0f6b50bd4a984ecd6f8a496cced) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Document batching with DataLoader (the N+1 problem) in the context guide: loaders built per request in the `context` option and typed through `GraphQLContext`, and why they must not outlive the request.
- Updated dependencies [[`137c5c8`](https://github.com/softistx/alxia/commit/137c5c8b618b961674c63a6242568e6b800939ab)]:
  - @alxia/core@0.6.0

## 0.3.0

### Minor Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A subscription over server-sent events, or an incremental delivery, ends when the app starts shutting down — `@alxia/core`'s `shutdownSignal` — so the graceful shutdown of `listen` answers the queries in flight and exits without waiting for it until `shutdownTimeout`. The docs say how GraphQL errors stay in `errors[]`, inside a 200, under core's `errors: 'problem'`, which applies to the HTTP layer around the endpoint, and show `health()` beside it.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - GraphiQL follows the serving app's dev switch: by default it answers a browser in dev alone (`NODE_ENV=development`, or `alxia({ dev: true })`), and nothing outside it — it used to be on everywhere unless `ide: false`. `ide: 'graphiql'` serves it everywhere, as before. Its page's `Content-Security-Policy` allows exactly the pinned `https://unpkg.com/@graphql-yoga/graphiql@<version>/` folder the page loads from, for its scripts, styles, fonts and the Monaco workers it fetches (which the old `connect-src 'self'` blocked), instead of all of unpkg.com, and adds `frame-ancestors 'none'`.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - For `@alxia/core` 0.5: `graphql()` is typed by `Alxia<Ctx, Prefix>`, without the removed `Shortcuts` parameter. A guard before the endpoint is any `(ctx, next)` middleware given to `use`, `bearer()` among them, and what it passes `next` is typed into the resolvers; the docs show it.

### Patch Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs are organised around tasks. Each README and docs index links the new "Start in 5 minutes" and the recipes of the repository (authentication, a spec-first CRUD, a GraphQL API, file uploads, SSE and WebSockets, testing, errors, health and shutdown, caching and rate limiting, deploying), whose code is type-checked. `@alxia/core`'s README names the four templates of `bun create @alxia`. `@alxia/redis`'s roadmap gains its 0.2.0 entry and says which release removed `app.plugin(idempotency(…))`, and its troubleshooting entry for a handle that wires nothing carries `@nxgt/redis` 0.5's whole message. The tables of contents of the `@alxia/env` and `@alxia/janus` troubleshooting pages link the right headings.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - For `@alxia/core`'s dev comfort: the endpoint's handler is named `graphql`, so the dev route table shows `GET /graphql … → graphql` and `POST /graphql … → graphql`. A resolver's error stays in Yoga's `errors[]`, and the dev error page never replaces it.
- Updated dependencies [[`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787)]:
  - @alxia/core@0.5.0

## 0.2.0

### Minor Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Typed against `@alxia/core`'s `Alxia<Ctx, Prefix, Shortcuts>`, which has no route table any more: `session()`, `secureHeaders({ nonce: true })`, `contextStorage()`, `graphql()`, `reactRouter()` and `FreshApp` drop its `Routes` argument. `@alxia/graphql` no longer exports `GraphQLRoutes`, the route table entry of its endpoint.

### Patch Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the current forms throughout (`plugin(app)`, middlewares rather than the deprecated hooks), the exact compiler messages, a group's middlewares running on the requests under its prefix, and `settle` no longer swallowing an error.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs and examples give the package middlewares to `use` — `app.use(logger())`, `app.use(bearer({ jwt }))` — the request hooks being deprecated. `alxiaOf(context)` types `route` as the catch-all's `string`, `BaseContext.route` being `string | undefined` now.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs and examples mount each plugin app with `@alxia/core`'s new `app.plugin(…)` — `base.plugin(todoRoutes)`, `app.plugin(redis(client))` — `use(…)` being for middlewares, its plugin forms deprecated. `@alxia/i18n` mounts its language plugin the same way inside, and `@alxia/context-storage`'s factory, given uncalled, now says `contextStorage is a factory: use(contextStorage()), not use(contextStorage)`. `@alxia/openapi`'s guides say where `route(operation)` checks replies: the handler's, just before it, a middleware's reply sent as it is, unless `responds(operation)` stands among the middlewares.
- Updated dependencies [[`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd)]:
  - @alxia/core@0.4.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`56ffcb9`](https://github.com/softistx/alxia/commit/56ffcb93a5155568ec002ab6fee332369bac3f30), [`a01ebed`](https://github.com/softistx/alxia/commit/a01ebed5745c5f863193f54bea8172abf51df85b), [`c9d43b7`](https://github.com/softistx/alxia/commit/c9d43b78f5ea9137e9ba56621e7ad89095621cff), [`f9a0ae7`](https://github.com/softistx/alxia/commit/f9a0ae7de698a63a94bb4aa4dfc2af33303827f2), [`8beb606`](https://github.com/softistx/alxia/commit/8beb606f81aa02bbdd068a674fa13385c4e52183)]:
  - @alxia/core@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`d0eaf4a`](https://github.com/softistx/alxia/commit/d0eaf4a21354ae86f5ec6959cb06e796e750d086), [`26ea5c1`](https://github.com/softistx/alxia/commit/26ea5c1e985ac7fcb819b10fc4d847f7b55f9709), [`eab8ca4`](https://github.com/softistx/alxia/commit/eab8ca4eff8ab407abe3801d15e4f5c6df23a735)]:
  - @alxia/core@0.2.0

## 0.1.0

### Minor Changes

- [`d6822f8`](https://github.com/softistx/alxia/commit/d6822f85cfcba85d2a4cffca15a1cf7acc00adce) The first release of alxia: a zero-dependency, type-safe HTTP framework for Bun, its typed client, its OpenAPI document, its Zod and GraphQL Yoga integrations, its plugins, and its adapters to the nxgt suite: telemetry, Redis and janus.

### Patch Changes

- Updated dependencies [[`d6822f8`](https://github.com/softistx/alxia/commit/d6822f85cfcba85d2a4cffca15a1cf7acc00adce)]:
  - @alxia/core@0.1.0
