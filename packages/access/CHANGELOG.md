# @alxia/access

## 0.2.0

### Minor Changes

- [#479](https://github.com/softistx/alxia/pull/479) [`a8b4780`](https://github.com/softistx/alxia/commit/a8b4780f253524fb688a8e4ebb8a0551a9eb82bf) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Let a host declare actions beyond `read` and `manage`: `createAccess` takes `actions: ['receive']`, so a module can declare `orders:receive`. The `Permission` type is now `<area>:<action>`, `isPermission` takes the extra actions, and an undeclared action is still an `access.invalid-permission` boot error.

## 0.1.0

### Minor Changes

- [#472](https://github.com/softistx/alxia/pull/472) [`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New package: the `<area>:read|manage` permission, `createAccess` building the role catalogue from the module registry (the host supplies its roles, the modules' `defaultGrants` are merged, an unknown, badly spelled or duplicate permission and a grant to an unknown role are boot errors), the guards `requirePermission`, `requireAnyPermission`, `requireMember`, `requireViewer`, `requireSelf` and `can` over a tenant scope, `permissionsReadWrite`, `membersReadPermissionWrites` and `scopeOf` for a module's two guards, and `refusalMapper` and `withRefusals` to map refusals to the host's error codes.

- [#472](https://github.com/softistx/alxia/pull/472) [`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `AccessCatalogueError` gains a namespaced `code` (`access.invalid-permission`, `access.unknown-role`, `access.undeclared-grant`); a permission two modules declare is now `@alxia/modules`' `ModuleGraphError`. README API table and Documentation section. The refusal codes `auth.errors.*` are unchanged, and the README gives the reason.

### Patch Changes

- Updated dependencies [[`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177), [`ba9d091`](https://github.com/softistx/alxia/commit/ba9d0919deb727e867bbfa1a673e02d5bb1c1177)]:
  - @alxia/modules@0.1.0
