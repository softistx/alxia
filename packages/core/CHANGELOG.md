# @alxia/core

## 0.2.0

### Minor Changes

- [#84](https://github.com/softistx/alxia/pull/84) [`d0eaf4a`](https://github.com/softistx/alxia/commit/d0eaf4a21354ae86f5ec6959cb06e796e750d086) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `bodyLimit`, a per-route, per-group or app-wide request body size cap. A body over the limit gets a typed 413 `{ error: 'content_too_large', limit }`: a `Content-Length` over it is refused unread, and a streamed body is cut off as soon as it passes the limit. An `onRefusal` hook reads it as `{ kind: 'body_limit', limit }` and may answer it in its own format, so a hook must check `kind` before reading `part` or `issues`. `@alxia/openapi` documents the 413. `HttpError.name` is now typed `string`, so its subclass `ContentTooLargeError` can name itself; test with `instanceof`.

- [#83](https://github.com/softistx/alxia/pull/83) [`26ea5c1`](https://github.com/softistx/alxia/commit/26ea5c1e985ac7fcb819b10fc4d847f7b55f9709) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Named server-sent events: `eventStream({ state: State, ping: Ping })` sends each event with its `event:` line, and `id:` and `retry:` when given; `@alxia/client` reads them as a union discriminated by `event`, and `@alxia/openapi` documents one object per name.

- [#85](https://github.com/softistx/alxia/pull/85) [`eab8ca4`](https://github.com/softistx/alxia/commit/eab8ca4eff8ab407abe3801d15e4f5c6df23a735) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `onRefusal(hook)` answers a request a route's schemas refuse in your own format — an RFC 9457 problem from the new `problem()` helper, sent as `application/problem+json` — typed for the client and documented by `@alxia/openapi`; the default 400 is unchanged.

## 0.1.0

### Minor Changes

- [`d6822f8`](https://github.com/softistx/alxia/commit/d6822f85cfcba85d2a4cffca15a1cf7acc00adce) The first release of alxia: a zero-dependency, type-safe HTTP framework for Bun, its typed client, its OpenAPI document, its Zod and GraphQL Yoga integrations, its plugins, and its adapters to the nxgt suite: telemetry, Redis and janus.
