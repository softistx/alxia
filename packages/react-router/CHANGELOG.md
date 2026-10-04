# @alxia/react-router

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
