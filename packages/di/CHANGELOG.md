# @alxia/di

## 0.1.4

### Patch Changes

- Updated dependencies [[`e4ff32c`](https://github.com/softistx/alxia/commit/e4ff32c1746581a5b52a50a5b6fdfb3e556e2e79)]:
  - @alxia/core@0.17.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`c327cfd`](https://github.com/softistx/alxia/commit/c327cfd802fc87fe6f5405c0531338b3ecff1a61)]:
  - @alxia/core@0.16.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`6d3ab24`](https://github.com/softistx/alxia/commit/6d3ab24f06ab3d0a9c0febfb2e0507f6f1022421)]:
  - @alxia/core@0.15.0

## 0.1.1

### Patch Changes

- [#222](https://github.com/softistx/alxia/pull/222) [`7b59591`](https://github.com/softistx/alxia/commit/7b595910d669cffc46317ccc07a6507cbab25f6d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The roadmap lists the request Scope, `expose` and `deps.lifecycle` as shipped in 0.1.0.
- Updated dependencies [[`12952ed`](https://github.com/softistx/alxia/commit/12952ed6915a9aeb616eca6f7fbf1326bbe995da), [`264328d`](https://github.com/softistx/alxia/commit/264328da1f909b8f6320ab8f10fdc9fc174f90ff)]:
  - @alxia/core@0.14.1

## 0.1.0

### Minor Changes

- [#219](https://github.com/softistx/alxia/pull/219) [`a7d59dd`](https://github.com/softistx/alxia/commit/a7d59dd02c9044bd70e331fa96e8330ebc1a6819) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Dependency injection for alxia on `@nxgt/di`. `di(container, { slots })` is a middleware: the routes after it read `scope`, a Scope of the Container created on its first `resolve` and disposed of once the route has answered, replied or thrown; `slots` is required exactly when the Container has Slots, and what it reads beyond the base context is required where the middleware stands. `deps.expose({ key: Token })` adds resolved values to the context of a group or a route, each Token checked against the Container, and must stand after its `di`. `app.plugin(deps.lifecycle)` disposes of the Container when the last app it was given to that started stops, read from the server `onStop` is given: the count is per Container, across every `di()` over it, so forks of one base and apps each with their own `di()` over one Container share it safely, and a `stop()` of an app that never listened disposes of nothing. Requires `@alxia/core` 0.14 or later, where `onStop` receives the server; its peer, `workspace:^`, is published as `^0.14.0`. `ScopeNotMountedError` (`DI_SCOPE_NOT_MOUNTED`) extends `DiError`.
