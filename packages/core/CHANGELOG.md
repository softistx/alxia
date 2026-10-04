# @alxia/core

## 0.3.1

### Patch Changes

- [#106](https://github.com/softistx/alxia/pull/106) [`044186d`](https://github.com/softistx/alxia/commit/044186d0e3b52d8634e67162e7c2c93c983592b0) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A range request on an empty file no longer answers `206` with `Content-Range: bytes 0--1/0`. A suffix range (`bytes=-5`), the only one RFC 9110 calls satisfiable on an empty file, is served whole as a `200`; any other range (`bytes=0-`, `bytes=-0`) is a `416` with `Content-Range: bytes */0`.

- [#108](https://github.com/softistx/alxia/pull/108) [`7a3ca53`](https://github.com/softistx/alxia/commit/7a3ca53fb7369ba2f1c87aa3633a39f61c30457a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The README's new **Getting started** and the getting-started guide point at `bun create @alxia`, which writes a new app from a template.

- [#109](https://github.com/softistx/alxia/pull/109) [`88307ca`](https://github.com/softistx/alxia/commit/88307ca159ed6b7e75b82ea836b6927fdc624879) Thanks [@SteveGT96](https://github.com/SteveGT96)! - internal: alxia.ts split into its method signatures, no API change. `static`, `file`, `page`, `decorate`, `derive`, `wrap`, `bodyLimit`, `onError`, `onRequest`, `onResponse`, `around`, `onStart`, `onStop`, `parser`, `group`, `use`, `request` and `listen` are now readonly properties typed by interfaces of their own, as `get`, `ws` and `onRefusal` already were; the calls, their types, their behaviour and their documentation are unchanged. Exported so an app's type can be named in a declaration file: `StaticMethod`, `FileMethod`, `PageMethod`, `DecorateMethod`, `DeriveMethod`, `WrapMethod`, `BodyLimitMethod`, `ErrorMethod`, `RequestHookMethod`, `ResponseHookMethod`, `AroundMethod`, `StartHookMethod`, `StopHookMethod`, `ParserMethod`, `GroupMethod`, `UseMethod`, `RequestMethod`, `ListenMethod`. A subclass of `Alxia` that overrides one of these as a method no longer compiles: a property cannot be overridden by a method; wrap the app in a function plugin instead.

## 0.3.0

### Minor Changes

- [#97](https://github.com/softistx/alxia/pull/97) [`56ffcb9`](https://github.com/softistx/alxia/commit/56ffcb93a5155568ec002ab6fee332369bac3f30) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Every route hook reads the request's cookies: `cookies` is on `BaseContext`, a `Readonly<Record<string, string>>` parsed from the `Cookie` header on first read, so a `derive`, `wrap`, `onError`, `onRefusal` or guard no longer parses the header itself. A route's `cookies` schema still gives its handler the validated values; its hooks keep reading the cookies as they arrived. `set.cookies` is now typed `ResponseCookies`, Bun's `CookieMap` whose `get` and `has` say in their JSDoc that they read the response's cookies, never the request's: the trap of `set.cookies.get()` returning `null` in a hook.
  
  Two edges to know. A handler's context on a route whose `cookies` schema outputs anything but strings is no longer assignable to `BaseContext` (whose `cookies` are strings): pass a helper typed `(ctx: BaseContext) => …` the fields it reads, or type it `Omit<BaseContext, 'cookies'>`. And a `derive` returning `cookies` now reaches a handler with no `cookies` schema, which it used to see overwritten by the parsed header, and a `cookies` schema validates that map rather than the header.

- [#103](https://github.com/softistx/alxia/pull/103) [`a01ebed`](https://github.com/softistx/alxia/commit/a01ebed5745c5f863193f54bea8172abf51df85b) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A route path written as a literal that the app would refuse when the route is declared no longer compiles: `app.get('/at/10:30', …)` is `Argument of type '"/at/10:30"' is not assignable to parameter of type '"Invalid path: \"/at/10:30\": \":\" may only start a segment, as a parameter"'`, and its params are no longer inferred as `{ 30: string }`. The type reads the rules the `TypeError` enforces on one path — a `:` or `*` inside a segment, a `*` before the end, a parameter name that is not an identifier or is declared twice, a dot segment — on every method that declares a route (`get` and the others, `route`, `ws`, `page`, `file`, `static`), under the app's prefix and the group's. A path typed `string`, or holding a `` `${string}` ``, is left to the runtime check as before. New exports: `PathAt`, `CheckedPath` and `StaticPath`, the check itself.
  
  **Breaking, for a function that forwards a path generic in `P`:** `app.get(path, …)` with `path: P` no longer compiles, since the path cannot be checked until `P` is known. Type the parameter with the check of the method it forwards to — `path: PathAt<'', P>`, or `PathAt<'', P, StaticPath<P>>` for `static` — and the path is checked where the function is called, the route keeping its literal path.

- [#102](https://github.com/softistx/alxia/pull/102) [`c9d43b7`](https://github.com/softistx/alxia/commit/c9d43b78f5ea9137e9ba56621e7ad89095621cff) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `onRefusal(kind, [schema,] hook)`: a hook per refusal kind. `onRefusal('validation', …)` and `onRefusal('body_limit', …)` each answer one kind, read it narrowed (`ValidationRefusal`, `BodyLimitRefusal`), and, given schemas, check and type that kind's replies apart: a route's type, the client and the OpenAPI document see the validation hook's replies where the route validates and the body-limit hook's where it has a `bodyLimit`. A kind with no hook of its own, or whose hook returns nothing, falls back to the general `onRefusal(hook)`, then to the default. `onRefusal(hook)` and `onRefusal(schema, hook)` are unchanged. New exports: `RefusalKind`, `RefusalOfKind`, `RefusalHandlersByKind` (`RouteDefinition['refusalByKind']`), `RefusalMethod` (the type of `onRefusal`, now a property typed as the route methods are), and the marks `RefusingKind`, `KindFallsBack`, `KindRefusalsOf`, `KindOutcome`, `OneKind`. A kind given as a union is a compile error. `@alxia/openapi` documents each kind's statuses on the routes that kind may refuse.

- [#105](https://github.com/softistx/alxia/pull/105) [`f9a0ae7`](https://github.com/softistx/alxia/commit/f9a0ae7de698a63a94bb4aa4dfc2af33303827f2) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Hooks on one route: every route method takes a list of hooks after its path — `app.patch('/bookmarks/:id', [canView, loadBookmark, canEdit], schema, handler)`, `app.get(path, [hook], handler)`, `route(operation, [hooks], handler)`, `ws(path, [hooks], schema, handlers)` — run after the hooks in force, in order, then validation, then the handler. `defineHook` and `defineWrap` make them, once, naming what they read with `defineHook<{ user: User; params: { id: string } }>()(hook)`: a route whose context or path does not give it is a compile error. What a hook adds, the hooks after it and the handler read; its replies join that route's type, so the client reads them. The hooks read `params`, `query` and `cookies` as they arrived, never the body. A list holds at most 8 hooks; a route without one costs the compiler nothing more.

### Patch Changes

- [#104](https://github.com/softistx/alxia/pull/104) [`8beb606`](https://github.com/softistx/alxia/commit/8beb606f81aa02bbdd068a674fa13385c4e52183) Thanks [@SteveGT96](https://github.com/SteveGT96)! - docs: a guide to choosing a middleware, and an upgrade page

## 0.2.2

### Patch Changes

- [#90](https://github.com/softistx/alxia/pull/90) [`69c815c`](https://github.com/softistx/alxia/commit/69c815c17ed26067b39ca5c731c48396f4da6377) Thanks [@SteveGT96](https://github.com/SteveGT96)! - internal: alxia.ts split, no API change

## 0.2.1

### Patch Changes

- [#89](https://github.com/softistx/alxia/pull/89) [`5520694`](https://github.com/softistx/alxia/commit/55206940f556a1a553acad33fff4af0e0d1fa1da) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A client that hangs up mid-request is no longer logged with `console.error` and answered 500: nothing is printed, no `onError` hook runs, and `onResponse` hooks see a 499. An error the app throws after the client left is still logged and answered 500.

- [#87](https://github.com/softistx/alxia/pull/87) [`d39d9a8`](https://github.com/softistx/alxia/commit/d39d9a88cc23bae09f28acd04a35778a85c8bd76) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Export `RefusalsOf`, `RefusalOutcome` and `DeclaredRefusal`, so an exported app with an `onRefusal` hook can be named in a declaration file (TS2883).

## 0.2.0

### Minor Changes

- [#84](https://github.com/softistx/alxia/pull/84) [`d0eaf4a`](https://github.com/softistx/alxia/commit/d0eaf4a21354ae86f5ec6959cb06e796e750d086) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `bodyLimit`, a per-route, per-group or app-wide request body size cap. A body over the limit gets a typed 413 `{ error: 'content_too_large', limit }`: a `Content-Length` over it is refused unread, and a streamed body is cut off as soon as it passes the limit. An `onRefusal` hook reads it as `{ kind: 'body_limit', limit }` and may answer it in its own format, so a hook must check `kind` before reading `part` or `issues`. `@alxia/openapi` documents the 413. `HttpError.name` is now typed `string`, so its subclass `ContentTooLargeError` can name itself; test with `instanceof`.

- [#83](https://github.com/softistx/alxia/pull/83) [`26ea5c1`](https://github.com/softistx/alxia/commit/26ea5c1e985ac7fcb819b10fc4d847f7b55f9709) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Named server-sent events: `eventStream({ state: State, ping: Ping })` sends each event with its `event:` line, and `id:` and `retry:` when given; `@alxia/client` reads them as a union discriminated by `event`, and `@alxia/openapi` documents one object per name.

- [#85](https://github.com/softistx/alxia/pull/85) [`eab8ca4`](https://github.com/softistx/alxia/commit/eab8ca4eff8ab407abe3801d15e4f5c6df23a735) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `onRefusal(hook)` answers a request a route's schemas refuse in your own format — an RFC 9457 problem from the new `problem()` helper, sent as `application/problem+json` — typed for the client and documented by `@alxia/openapi`; the default 400 is unchanged.

## 0.1.0

### Minor Changes

- [`d6822f8`](https://github.com/softistx/alxia/commit/d6822f85cfcba85d2a4cffca15a1cf7acc00adce) The first release of alxia: a zero-dependency, type-safe HTTP framework for Bun, its typed client, its OpenAPI document, its Zod and GraphQL Yoga integrations, its plugins, and its adapters to the nxgt suite: telemetry, Redis and janus.
