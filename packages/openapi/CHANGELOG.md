# @alxia/openapi

## 0.3.0

### Minor Changes

- [#102](https://github.com/softistx/alxia/pull/102) [`c9d43b7`](https://github.com/softistx/alxia/commit/c9d43b78f5ea9137e9ba56621e7ad89095621cff) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `onRefusal(kind, [schema,] hook)`: a hook per refusal kind. `onRefusal('validation', …)` and `onRefusal('body_limit', …)` each answer one kind, read it narrowed (`ValidationRefusal`, `BodyLimitRefusal`), and, given schemas, check and type that kind's replies apart: a route's type, the client and the OpenAPI document see the validation hook's replies where the route validates and the body-limit hook's where it has a `bodyLimit`. A kind with no hook of its own, or whose hook returns nothing, falls back to the general `onRefusal(hook)`, then to the default. `onRefusal(hook)` and `onRefusal(schema, hook)` are unchanged. New exports: `RefusalKind`, `RefusalOfKind`, `RefusalHandlersByKind` (`RouteDefinition['refusalByKind']`), `RefusalMethod` (the type of `onRefusal`, now a property typed as the route methods are), and the marks `RefusingKind`, `KindFallsBack`, `KindRefusalsOf`, `KindOutcome`, `OneKind`. A kind given as a union is a compile error. `@alxia/openapi` documents each kind's statuses on the routes that kind may refuse.

### Patch Changes

- Updated dependencies [[`56ffcb9`](https://github.com/softistx/alxia/commit/56ffcb93a5155568ec002ab6fee332369bac3f30), [`a01ebed`](https://github.com/softistx/alxia/commit/a01ebed5745c5f863193f54bea8172abf51df85b), [`c9d43b7`](https://github.com/softistx/alxia/commit/c9d43b78f5ea9137e9ba56621e7ad89095621cff), [`f9a0ae7`](https://github.com/softistx/alxia/commit/f9a0ae7de698a63a94bb4aa4dfc2af33303827f2), [`8beb606`](https://github.com/softistx/alxia/commit/8beb606f81aa02bbdd068a674fa13385c4e52183)]:
  - @alxia/core@0.3.0

## 0.2.0

### Minor Changes

- [#84](https://github.com/softistx/alxia/pull/84) [`d0eaf4a`](https://github.com/softistx/alxia/commit/d0eaf4a21354ae86f5ec6959cb06e796e750d086) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `bodyLimit`, a per-route, per-group or app-wide request body size cap. A body over the limit gets a typed 413 `{ error: 'content_too_large', limit }`: a `Content-Length` over it is refused unread, and a streamed body is cut off as soon as it passes the limit. An `onRefusal` hook reads it as `{ kind: 'body_limit', limit }` and may answer it in its own format, so a hook must check `kind` before reading `part` or `issues`. `@alxia/openapi` documents the 413. `HttpError.name` is now typed `string`, so its subclass `ContentTooLargeError` can name itself; test with `instanceof`.

- [#83](https://github.com/softistx/alxia/pull/83) [`26ea5c1`](https://github.com/softistx/alxia/commit/26ea5c1e985ac7fcb819b10fc4d847f7b55f9709) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Named server-sent events: `eventStream({ state: State, ping: Ping })` sends each event with its `event:` line, and `id:` and `retry:` when given; `@alxia/client` reads them as a union discriminated by `event`, and `@alxia/openapi` documents one object per name.

- [#85](https://github.com/softistx/alxia/pull/85) [`eab8ca4`](https://github.com/softistx/alxia/commit/eab8ca4eff8ab407abe3801d15e4f5c6df23a735) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `onRefusal(hook)` answers a request a route's schemas refuse in your own format — an RFC 9457 problem from the new `problem()` helper, sent as `application/problem+json` — typed for the client and documented by `@alxia/openapi`; the default 400 is unchanged.

### Patch Changes

- Updated dependencies [[`d0eaf4a`](https://github.com/softistx/alxia/commit/d0eaf4a21354ae86f5ec6959cb06e796e750d086), [`26ea5c1`](https://github.com/softistx/alxia/commit/26ea5c1e985ac7fcb819b10fc4d847f7b55f9709), [`eab8ca4`](https://github.com/softistx/alxia/commit/eab8ca4eff8ab407abe3801d15e4f5c6df23a735)]:
  - @alxia/core@0.2.0

## 0.1.0

### Minor Changes

- [`d6822f8`](https://github.com/softistx/alxia/commit/d6822f85cfcba85d2a4cffca15a1cf7acc00adce) The first release of alxia: a zero-dependency, type-safe HTTP framework for Bun, its typed client, its OpenAPI document, its Zod and GraphQL Yoga integrations, its plugins, and its adapters to the nxgt suite: telemetry, Redis and janus.

### Patch Changes

- Updated dependencies [[`d6822f8`](https://github.com/softistx/alxia/commit/d6822f85cfcba85d2a4cffca15a1cf7acc00adce)]:
  - @alxia/core@0.1.0
