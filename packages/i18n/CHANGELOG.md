# @alxia/i18n

## 0.1.2

### Patch Changes

- [#96](https://github.com/softistx/alxia/pull/96) [`a79f0ec`](https://github.com/softistx/alxia/commit/a79f0ec652fe44170eee52d20022f00c85f1dec9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `KeyOf` reads a catalogue's keys nine levels deep at most, where `@nxgt/i18n`'s `Path` recursed without a bound: a function generic over its catalogues can hand them to `createI18n` without TS2589 ("Type instantiation is excessively deep and possibly infinite"). A section nested deeper gives `section.${string}`.
- Updated dependencies [[`69c815c`](https://github.com/softistx/alxia/commit/69c815c17ed26067b39ca5c731c48396f4da6377)]:
  - @alxia/core@0.2.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`d0eaf4a`](https://github.com/softistx/alxia/commit/d0eaf4a21354ae86f5ec6959cb06e796e750d086), [`26ea5c1`](https://github.com/softistx/alxia/commit/26ea5c1e985ac7fcb819b10fc4d847f7b55f9709), [`eab8ca4`](https://github.com/softistx/alxia/commit/eab8ca4eff8ab407abe3801d15e4f5c6df23a735)]:
  - @alxia/core@0.2.0
  - @alxia/language@0.1.1

## 0.1.0

### Minor Changes

- [`d6822f8`](https://github.com/softistx/alxia/commit/d6822f85cfcba85d2a4cffca15a1cf7acc00adce) The first release of alxia: a zero-dependency, type-safe HTTP framework for Bun, its typed client, its OpenAPI document, its Zod and GraphQL Yoga integrations, its plugins, and its adapters to the nxgt suite: telemetry, Redis and janus.

### Patch Changes

- Updated dependencies [[`d6822f8`](https://github.com/softistx/alxia/commit/d6822f85cfcba85d2a4cffca15a1cf7acc00adce)]:
  - @alxia/core@0.1.0
  - @alxia/language@0.1.0
