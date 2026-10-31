# @alxia/modules

## 0.1.0

### Minor Changes

- [#472](https://github.com/softistx/alxia/pull/472) [`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `ModuleGraphError` gains a namespaced `code` (`modules.duplicate-module`, `modules.unknown-dependency`, `modules.dependency-cycle`, `modules.duplicate-declaration`). `permissionsOf` now throws for a permission two modules declare instead of de-duplicating it, the new `emitsOf` does the same for an emitted event type, and `resolveModules` runs both checks.

- [#472](https://github.com/softistx/alxia/pull/472) [`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New package: `defineModule`, a module manifest (collections, GraphQL, permissions and default grants, texts, migrations, jobs, events, api), `resolveModules` ordering and checking a registry, readers (`typeDefsOf`, `permissionsOf`, `migrationsOf`, `jobsOf`, `textsOf`, ...), `ModuleMongo` typing collection access to what a module owns or depends on through the `Register` hook, and `assertBoundaries`, a test helper holding the boundaries between modules.
