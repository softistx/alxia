# @alxia/tenancy

## 0.1.0

### Minor Changes

- [#472](https://github.com/softistx/alxia/pull/472) [`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `ModuleWiringError` and `UnknownMigrationError` gain a namespaced `code` (`tenancy.module-wiring`, `tenancy.unknown-migration`). `single` compares the database names to tell whether the core database is apart. The refusal codes `tenancy.errors.*` are unchanged, and the README gives the reason.

- [#472](https://github.com/softistx/alxia/pull/472) [`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New package: the `TenantStore` contract and two stores. `perOrganization` keeps the host's core database and one database per organisation, with the tenant named by a configurable header (id or slug), a membership port, `eachTenant({ withDeleted })`, `provision`, and `sync` and `migrate` over every database; `single` keeps one database and one fixed tenant behind the same contract. `forModule` hands a module its typed `ModuleMongo` handles from a scope, and `modules` feeds the migrations from the registry. `slotNaming` bounds the databases a test suite creates, and `lazyScope` and `viewerMemberships` keep a request's scope and memberships read once.

### Patch Changes

- Updated dependencies [[`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177), [`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177)]:
  - @alxia/modules@0.1.0
