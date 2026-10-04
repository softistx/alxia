# @alxia/logger

## 0.2.0

### Minor Changes

- [#99](https://github.com/softistx/alxia/pull/99) [`7e3850c`](https://github.com/softistx/alxia/commit/7e3850c6201656173a8e306e9151d8eb971954c5) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A streamed body (a page rendered as it goes, an event stream, a `ReadableStream` reply) is now logged once it has been sent, not when the handler returned it. Its entry's `duration` runs to the last byte, and two new fields say the rest: `timeToHeaders`, the time to the response, and `outcome`, `completed`, `aborted` (the client left; at least `warn`) or `errored` (the stream failed; `error`). A body with no length used to be logged as a success even when its client left or it failed midway. A response with no body, or with a `Content-Length` header (which `@alxia/core` sets on every reply of a string, JSON, a buffer or a file), is still logged at once and left untouched; a raw `Response` without that header is timed as a stream.

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
