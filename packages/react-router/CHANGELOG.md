# @alxia/react-router

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
