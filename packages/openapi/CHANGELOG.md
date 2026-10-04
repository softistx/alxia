# @alxia/openapi

From 0.4.0, `@alxia/openapi` is the spec-first package that was
`@alxia/openapi-routes`: its releases up to 0.2.0, below, were published
under that name. The `@alxia/openapi` of 0.1.0 to 0.3.0, which wrote an OpenAPI
document from an app's route schemas, is retired; its changelog is
[in the repository's history](https://github.com/softistx/alxia/blob/3f80253/packages/openapi/CHANGELOG.md).

## 0.2.0

### Minor Changes

- [#98](https://github.com/softistx/alxia/pull/98) [`ccf30df`](https://github.com/softistx/alxia/commit/ccf30df35170f388740249025d1ba1d083608f93) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `matchesSpec(app, operations)` is the new name of `exactly`: one call that throws when an operation of the spec has no route, or a route is not in the spec. `exactly` and `ExactlyOptions` still work, deprecated.

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
