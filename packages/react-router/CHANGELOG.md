# @alxia/react-router

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
