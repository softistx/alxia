# @alxia/react-router

## 0.8.0

### Minor Changes

- [#229](https://github.com/softistx/alxia/pull/229) [`5970afd`](https://github.com/softistx/alxia/commit/5970afd4c99bf048297077f1ae7ce36590c18a7e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Under `react-router dev` and `vite preview`, a loader's or an action's `alxiaOf(context).server` (core's `ctx.server`) is now the `Bun.Server` the plugin relays the app's sockets to, on a loopback port, rather than `undefined`: an action's `server.publish(topic, data)` reaches the app's WebSocket subscribers in dev as from the build. Its `url` is that loopback port's, and `requestIP` and `timeout` know nothing of a request Vite took, so `ctx.ip` stays `undefined` there as before.
  
  Add `context.alxia`, the shorthand for `alxiaOf(context)`: the package augments React Router's `RouterContextProvider` with a read-only `alxia`, typed by its `Register` (core's, then `BaseContext`, with none). It is a getter that reads `alxiaContext`, so it is set exactly when that key is, and on a provider no catch-all filled it throws `alxiaOf`'s error. It is typed with `LoaderFunctionArgs` and `ActionFunctionArgs` from `react-router`; with the generated `Route.LoaderArgs` it works at runtime but `tsc` reports TS2339, because react-router's `./internal` types point at a second declaration of the class, so `withAlxia` or `alxiaOf(context)` is the form there. `AlxiaContextOf<App>` names what `alxiaOf<App>(context)` returns.
  
  Add `withAlxia(fn)`: a loader, an action or a middleware given `alxia`, the alxia context, beside React Router's arguments, typed by `Register` (or the server `AlxiaArgs<typeof server>` names) even under the generated `Route.LoaderArgs`: `export const loader = withAlxia(({ alxia, params }: Route.LoaderArgs & AlxiaArgs) => …)`. It returns a function of React Router's arguments alone, with `fn`'s return type, so the page's `loaderData` and `actionData` are still inferred; a middleware's `next` is passed on, and outside alxia it throws `alxiaOf`'s error. New types `AlxiaArgs<App>` and `ProviderLike`.

### Patch Changes

- [#231](https://github.com/softistx/alxia/pull/231) [`02421e6`](https://github.com/softistx/alxia/commit/02421e678997db30d65abda5579a361aa5116ab2) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The upgrading guide and the roadmap name 0.14.2 and 0.8.0.
- Updated dependencies [[`5970afd`](https://github.com/softistx/alxia/commit/5970afd4c99bf048297077f1ae7ce36590c18a7e), [`02421e6`](https://github.com/softistx/alxia/commit/02421e678997db30d65abda5579a361aa5116ab2)]:
  - @alxia/core@0.14.2

## 0.7.5

### Patch Changes

- Updated dependencies [[`71411e2`](https://github.com/softistx/alxia/commit/71411e26dd0d729bf16e10be6f43b1fa6726f6c8), [`3ed7f8e`](https://github.com/softistx/alxia/commit/3ed7f8e7df3dd3e9d97b38e004ee831055ebe163)]:
  - @alxia/core@0.14.0

## 0.7.4

### Patch Changes

- Updated dependencies [[`5d7438a`](https://github.com/softistx/alxia/commit/5d7438afa0909630611d3f0661bd012834760fb6), [`9de1c30`](https://github.com/softistx/alxia/commit/9de1c30e0ba8ab4cb20d38a5f5a14293726e9468), [`b4195c0`](https://github.com/softistx/alxia/commit/b4195c0518ce2c5c8c68181e5cb3de67890c2ae8)]:
  - @alxia/core@0.13.0

## 0.7.3

### Patch Changes

- Updated dependencies [[`4eac9ea`](https://github.com/softistx/alxia/commit/4eac9ea56b3ad3eb50a5cec27128ae3fce7c65ff), [`d462fd7`](https://github.com/softistx/alxia/commit/d462fd7bf5ddf4fd4601a5e146fa267d5df74297)]:
  - @alxia/core@0.12.0

## 0.7.2

### Patch Changes

- Updated dependencies [[`79fbd81`](https://github.com/softistx/alxia/commit/79fbd81a9e1d9e72cbd9d733085fbc8d73d3ed72), [`c7c994a`](https://github.com/softistx/alxia/commit/c7c994a48eeaa4b069bc81e0eeb73aa7217dd12e)]:
  - @alxia/core@0.11.0

## 0.7.1

### Patch Changes

- Updated dependencies [[`3385725`](https://github.com/softistx/alxia/commit/33857253e8a67fc33f39884d58bdd55377ae2915), [`da95f24`](https://github.com/softistx/alxia/commit/da95f24391b942db81c082c253aeeaa5fcade07b)]:
  - @alxia/core@0.10.0

## 0.7.0

### Minor Changes

- [#190](https://github.com/softistx/alxia/pull/190) [`bc2573c`](https://github.com/softistx/alxia/commit/bc2573c7eb045fcfd954fa5457a340abefc32579) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Hand React Router its request at `originalUrl(ctx)`: behind a proxy the app trusts (`alxia({ proxy: trustProxy(…) })`), `request.url` in a loader or an action is the scheme and host the client asked for. `createServer({ proxy })` passes the option to the app it makes.

### Patch Changes

- Updated dependencies [[`86af86e`](https://github.com/softistx/alxia/commit/86af86e9c73dbc5084a468113de1ec98207cfdf0), [`17d28fe`](https://github.com/softistx/alxia/commit/17d28fe08a73e4c549f04b98411364ff5c6715f5), [`bc2573c`](https://github.com/softistx/alxia/commit/bc2573c7eb045fcfd954fa5457a340abefc32579)]:
  - @alxia/core@0.9.0

## 0.6.3

### Patch Changes

- [#181](https://github.com/softistx/alxia/pull/181) [`f76d073`](https://github.com/softistx/alxia/commit/f76d0738fe3d715ebd1aa15c3f9f7bf7327062b4) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: update link to openapi prefix guide after docs restructure.
- Updated dependencies [[`89aa1df`](https://github.com/softistx/alxia/commit/89aa1df408840165fca6eb189aabedc3fee498ba), [`4a6df2b`](https://github.com/softistx/alxia/commit/4a6df2b1cfc4bf87c4f5b38a856c3157acf1e42f), [`e536262`](https://github.com/softistx/alxia/commit/e5362622a260faa3320bc1cdbd456bae07565953), [`d256d6a`](https://github.com/softistx/alxia/commit/d256d6a169bb9a532014814c3aea888fd592c762), [`9ab4a7f`](https://github.com/softistx/alxia/commit/9ab4a7fd3a62545b15f788e3c6da51ac73de2705)]:
  - @alxia/core@0.8.0

## 0.6.2

### Patch Changes

- Updated dependencies [[`28cdcfe`](https://github.com/softistx/alxia/commit/28cdcfe800ca90cfadacf48662fac0fc99b4f63b)]:
  - @alxia/core@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`137c5c8`](https://github.com/softistx/alxia/commit/137c5c8b618b961674c63a6242568e6b800939ab)]:
  - @alxia/core@0.6.0

## 0.6.0

### Minor Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - For `@alxia/core` 0.5: `reactRouter()`, `FreshApp` and `InvalidRegister` are typed by `Alxia<Ctx, Prefix>`, without the removed `Shortcuts` parameter; the docs show the single middleware form.

### Patch Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs are organised around tasks. Each README and docs index links the new "Start in 5 minutes" and the recipes of the repository (authentication, a spec-first CRUD, a GraphQL API, file uploads, SSE and WebSockets, testing, errors, health and shutdown, caching and rate limiting, deploying), whose code is type-checked. `@alxia/core`'s README names the four templates of `bun create @alxia`. `@alxia/redis`'s roadmap gains its 0.2.0 entry and says which release removed `app.plugin(idempotency(…))`, and its troubleshooting entry for a handle that wires nothing carries `@nxgt/redis` 0.5's whole message. The tables of contents of the `@alxia/env` and `@alxia/janus` troubleshooting pages link the right headings.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `start` prints `@alxia/core`'s route table in dev, and `alxia listening on <url>` otherwise; `listen: { onListen }` is given the core's `ListenInfo` and wins over the `onListen(server)` option.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The app `createServer()` makes is in dev in React Router's `development` mode alone: a production build answers a 500 without its stack, and prints no route table, whatever `NODE_ENV` says.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `start` relies on `@alxia/core`'s `listen` for `SIGINT` and `SIGTERM` rather than on handlers of its own: the same order as 0.1.2 — the handlers in place before `onListen` — with core's graceful shutdown: the requests in flight drain within `shutdownTimeout`, readiness turns 503, the `onStop` hooks run, and the process exits 0, or 1 when a hook throws.
- Updated dependencies [[`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787), [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787)]:
  - @alxia/core@0.5.0

## 0.5.0

### Minor Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `alxiaOf(context)` with no type argument reads the base `@alxia/core`'s `Register` names when this package's `Register` names no server; this package's still wins when both are declared. `RegisteredOf<R, Core>` takes that fallback as its second parameter, by default core's `RegisteredBase`.

### Patch Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the current forms throughout (`plugin(app)`, middlewares rather than the deprecated hooks), the exact compiler messages, a group's middlewares running on the requests under its prefix, and `settle` no longer swallowing an error.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs and examples give the package middlewares to `use` — `app.use(logger())`, `app.use(bearer({ jwt }))` — the request hooks being deprecated. `alxiaOf(context)` types `route` as the catch-all's `string`, `BaseContext.route` being `string | undefined` now.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs no longer name the `@alxia/openapi` that wrote a document from an app, which is retired: alxia is OpenAPI spec first, and `@alxia/openapi` is now the package that checks an app's routes against the operations generated from the document (`matchesSpec`). `isReactRouterRoute` is documented for `matchesSpec`'s `exclude`. `@alxia/core`'s upgrading guide covers the move.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs and examples mount each plugin app with `@alxia/core`'s new `app.plugin(…)` — `base.plugin(todoRoutes)`, `app.plugin(redis(client))` — `use(…)` being for middlewares, its plugin forms deprecated. `@alxia/i18n` mounts its language plugin the same way inside, and `@alxia/context-storage`'s factory, given uncalled, now says `contextStorage is a factory: use(contextStorage()), not use(contextStorage)`. `@alxia/openapi`'s guides say where `route(operation)` checks replies: the handler's, just before it, a middleware's reply sent as it is, unless `responds(operation)` stands among the middlewares.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Typed against `@alxia/core`'s `Alxia<Ctx, Prefix, Shortcuts>`, which has no route table any more: `session()`, `secureHeaders({ nonce: true })`, `contextStorage()`, `graphql()`, `reactRouter()` and `FreshApp` drop its `Routes` argument. `@alxia/graphql` no longer exports `GraphQLRoutes`, the route table entry of its endpoint.

- [#128](https://github.com/softistx/alxia/pull/128) [`fed8a44`](https://github.com/softistx/alxia/commit/fed8a44f6c97380d2cbca42eab1e77d05e60e08d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The README and guide start a new app with `bun create @alxia my-app --template react-router`, which writes the official template with alxia already set up; adding alxia to an existing app follows.
- Updated dependencies [[`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd), [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd)]:
  - @alxia/core@0.4.0

## 0.4.0

### Minor Changes

- [#115](https://github.com/softistx/alxia/pull/115) [`5da0f5e`](https://github.com/softistx/alxia/commit/5da0f5e1e5c715c12aa1d789c370b73d229b5147) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `react-router build` now bundles every package into `build/server/index.js`, React, React Router and alxia included: the `ssr` environment gets `resolve.noExternal: true` in the build, never in dev. `build/` runs on Bun with no `node_modules`, so a Docker image's final stage copies it alone. What the app sets wins: `ssr.external: ['sharp']` keeps those packages external, and `ssr.external: true` keeps every package external, as before.

## 0.3.0

### Minor Changes

- [#112](https://github.com/softistx/alxia/pull/112) [`c808d83`](https://github.com/softistx/alxia/commit/c808d836381bbcfb6a05b921483bfb088a1eb909) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `alxia()` now builds the server for Bun, with nothing to configure. In Vite's `ssr` environment, under `react-router dev` and `react-router build`, it adds the `bun` export condition to `resolve.conditions` and `resolve.externalConditions`, so a package that exports a `bun` variant is bundled, and loaded in dev, as that variant; adds `bun` and `bun:*` to `resolve.builtins`, so Bun's own modules stay imports of `build/server/index.js` whichever runtime runs Vite; and sets `build.target` to `esnext`. What the app sets is kept: its own conditions and builtins are merged with these, and a `build.target` it set, at the top level or on the environment, wins. An app that sets `ssr.target: 'webworker'` itself gets none of this. The guide has a Built for Bun section, and Deploying a multi-stage `Dockerfile` on `oven/bun:1`.

## 0.2.0

### Minor Changes

- [#101](https://github.com/softistx/alxia/pull/101) [`27aa8a7`](https://github.com/softistx/alxia/commit/27aa8a744941e10c7ca2600653a3bb67129b3ee8) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `nonceOf(loadContext)` reads the request's CSP nonce in `entry.server.tsx`: the `nonce` that `@alxia/secure-headers`' `nonce: true`, or a `derive` of the app's own, put on the context, or `undefined`. Passed to `<ServerRouter nonce>` and React's renderer, it lands on every script the page renders. Neither package depends on the other.

### Patch Changes

- Updated dependencies [[`56ffcb9`](https://github.com/softistx/alxia/commit/56ffcb93a5155568ec002ab6fee332369bac3f30), [`a01ebed`](https://github.com/softistx/alxia/commit/a01ebed5745c5f863193f54bea8172abf51df85b), [`c9d43b7`](https://github.com/softistx/alxia/commit/c9d43b78f5ea9137e9ba56621e7ad89095621cff), [`f9a0ae7`](https://github.com/softistx/alxia/commit/f9a0ae7de698a63a94bb4aa4dfc2af33303827f2), [`8beb606`](https://github.com/softistx/alxia/commit/8beb606f81aa02bbdd068a674fa13385c4e52183)]:
  - @alxia/core@0.3.0

## 0.1.2

### Patch Changes

- [#91](https://github.com/softistx/alxia/pull/91) [`f5ac506`](https://github.com/softistx/alxia/commit/f5ac5061ab624351ae5987842e7f3cb57c868ad9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `start` now calls `onListen`, or prints `alxia listening on …`, only after its `SIGINT` and `SIGTERM` handlers are in place. Before, a supervisor that sent `SIGTERM` as soon as it read that line could kill the process (exit 143) before any `onStop` hook ran.
- Updated dependencies [[`69c815c`](https://github.com/softistx/alxia/commit/69c815c17ed26067b39ca5c731c48396f4da6377)]:
  - @alxia/core@0.2.2

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
