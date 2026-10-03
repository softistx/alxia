# Roadmap

What `@alxia/core` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/core/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/core` installs nothing beside itself and
  stays that way: it is built on Bun's and the web platform's own APIs
  (`Bun.serve`, `Bun.CookieMap`, `Bun.file`), so adding it to an app adds no
  transitive package to audit or update.
- **A built-in validator.** The core reads any
  [Standard Schema](https://standardschema.dev) and names none; what only one
  library can do — Zod's query coercions, its OpenAPI conversion — lives in a
  package of its own, such as `@alxia/zod`.
- **CORS, security headers, compression, rate limiting, authentication or
  logging in the core.** Each is a plugin package to take or leave
  (`@alxia/cors`, `@alxia/secure-headers`, `@alxia/compress`,
  `@alxia/rate-limit`, `@alxia/jwt`, `@alxia/logger`), built on the core's
  public API only, so an app ships only what it uses.
- **A raw `Response` from a handler.** A handler answers with `reply`, so the
  client's type holds every status a route can send; a `Response` would be
  outside that contract. A global hook (`onRequest`, `onResponse`) can still
  return one, for what a typed client never asks.

## Shipped

### 0.1.0

- **Typed routes on Bun.** `alxia()` declares `get`, `post`, `put`, `patch`,
  `delete`, `options`, `head` and `query` routes whose `params`, `query`, `headers`,
  `cookies` and `body` are validated by any Standard Schema — Zod, Valibot,
  ArkType or one written by hand — and read as typed values; a refused
  request is a 400 naming every issue. A `QUERY` route is a safe read whose
  criteria travel in a validated body. `route(operation, handler)` declares
  the same route from data — `{ method, path, schema? }`, shared or
  generated from an OpenAPI document. `listen` hands the routes to
  `Bun.serve`'s router, and `fetch` and `request` run the app in process.
- **Replies the types hold to.** `reply(status, body)` accepts only a
  declared status with a body its schema accepts, and sends the schema's
  output, so a key it strips never leaves the server. A params schema that
  does not read the path, an unknown route key, an undeclared status or a
  wrong body is a compile error.
- **A contract for the client.** `typeof app` is what `@alxia/client` calls,
  with every status a route may answer: its replies, its hooks' replies, its
  400 and its 500.
- **Static files.** `static`, `file` and `page` serve a directory, a single
  file, any `Blob` source (memory, an S3 bucket) or one of Bun's HTML
  bundles, with `ETag`, `Last-Modified`, ranges, precompressed variants, a
  single-page-app fallback, and every hook around them.
- **Server-sent events.** `eventStream(schema)` types a stream whose events
  are each validated, sent as JSON and read by the client as an
  `AsyncIterable`.
- **WebSockets.** `ws` validates the upgrade like a route and each message
  received and sent by its schema, with publish and subscribe; `listen`
  serves them, or `Bun.serve` given `app.fetch` and `app.websocket`.
- **Hooks in order.** `decorate`, `derive`, `wrap` and `onError` apply to the
  routes declared after them and add their context and replies to those
  routes' types; `around`, `onRequest`, `onResponse`, `onStart`, `onStop` and
  `parser` apply to the whole app.
- **Groups and plugins.** `group` scopes a prefix and its hooks; `use` mounts
  another app — its routes, context and replies, all typed — or a function
  plugin that adds global hooks.
- **Plugins that need an earlier one.** `definePlugin<Requires>()` builds a
  plugin on an app whose context already has `Requires` — a `user`, a
  `session` — and `use` on an app that does not give them is a compile
  error naming the missing key.
- **A requirement inferred from a callback.** `RequiresOf<Ctx>` is what a
  callback's annotated parameter reads beyond `BaseContext`, so a plugin
  that takes a callback — `@alxia/language`'s `resolve`, `@alxia/janus`'s
  `load` — requires exactly what its user's annotation names, and nothing
  when the callback is not annotated.
- **No silent `any`.** A callback annotated `any` would require nothing and
  turn the check off; `use` refuses it on every app instead, with a message
  naming the callback — `the plugin's resolve reads its context as any` —
  that says to annotate what it reads or leave it unannotated.
- **One routing for dev, tests and production.** `app.fetch` and
  `app.request` choose among matching routes exactly as `Bun.serve`'s router
  does under `listen` — segment by segment, a literal before a parameter
  before a wildcard, whatever the order of declaration — so `/api/*` beats a
  `/*` catch-all declared before it, in a test as in production.
- **No path that `listen` throws on.** A path `Bun.serve` would refuse at
  `listen` or read otherwise than `fetch` — a `:` inside a segment as in
  `/at/10:30`, a `*` beside other characters, a dot segment, a literal the
  URL percent-encodes such as `/café` — is refused when the route is
  declared, naming the form to write (`/caf%C3%A9`). A request sent with
  an unresolved target, `/files/../admin`, is routed by its URL under
  `listen` as through `fetch`.
