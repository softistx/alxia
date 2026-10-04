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

- **Comments on a stream.** A handler yielding a comment line of its own
  (`: …`), beside the keep-alive the stream already sends while idle.

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

### Next release

- **Hooks on one route.** A route takes a list of hooks after its path —
  `app.patch('/bookmarks/:id', [canView, canEdit], schema, handler)` — run
  after the hooks in force, in order, before validation. Each is written
  once with `defineHook` or `defineWrap` and names what it reads, a `user`
  or a path parameter: a route that does not give it does not compile.
  What a hook adds, the hooks after it and the handler read; its replies
  join that route's type, so the client reads them. `route()` and `ws`
  take the list too. A route without one costs the compiler nothing more.
- **Request cookies in every hook.** `ctx.cookies` is on the base context:
  a `derive`, `wrap`, `onError`, `onRefusal` or guard reads the request's
  cookies, parsed on first read, without parsing the `Cookie` header
  itself. A route's `cookies` schema still gives its handler the validated
  values. `set.cookies` is documented, down to its `get`, as the
  response's map, which a hook used to misread as the request's.
- **A hook per refusal kind.** `onRefusal('validation', hook)` and
  `onRefusal('body_limit', hook)`, each with schemas of its own if given,
  answer one kind each and read it narrowed. A route's types, the client
  and `@alxia/openapi` see each kind's replies apart: the 413 of a
  `body_limit` hook is no part of a route without a limit. A kind with no
  hook, or whose hook returns nothing, falls back to `onRefusal(hook)`,
  then to the default.
- **A refused path is a compile error.** A path written as a literal that
  the app would refuse when the route is declared — `/at/10:30`,
  `/a/:id/:id`, `/*.js`, a dot segment — no longer compiles, on every
  method that declares a route, with the `TypeError`'s own message after
  `Invalid path:`. Its params are no longer inferred from a path that
  could never be served. The check is exported, `PathAt`, `CheckedPath`
  and `StaticPath`: a function forwarding a path generic in `P` types its
  parameter `PathAt<'', P>`, and the path is checked where it is called.
- **Refusals in your format.** `onRefusal(hook)` answers a request the
  route's schemas refuse with your own reply instead of
  `400 { error: 'validation', issues }`, for the routes declared after it.
  The hook reads the part that failed and every issue, and may answer 400
  or another 4xx. Its reply takes the 400's place in each route's type, so
  the client reads it. Given schemas, `@alxia/openapi` documents it under
  its content type. A group's hook stays in the group, and the default is
  unchanged.
- **RFC 9457 problems.** `problem({ type, status, detail, … })` is a reply
  sent as `application/problem+json`, with its extension members typed:
  the error format of JMAP and other APIs built on problem details.
- **Named server-sent events.** `eventStream({ state: State, ping: Ping })`
  maps each event name to the schema of its data: the handler yields only
  declared events, each sent with its `event:` line and, when given, its
  `id:` and `retry:`; the client reads a union discriminated by `event`. A
  line break in an id, or a retry that is not a whole number, is refused
  before it can write a frame the handler never yielded.
- **A body size per route.** `bodyLimit` on a route, or `bodyLimit(bytes)`
  for the app or a group, caps its request body below the server's
  `maxRequestBodySize`. A body over the limit is refused with a typed 413,
  which `@alxia/openapi` documents. A `Content-Length` over the limit is
  refused unread, and a chunked upload is cut off as soon as it passes the
  limit, never buffered whole. This holds for JSON, forms, text, custom
  parsers and a handler reading the raw stream. The refusal reaches
  `onRefusal` as `{ kind: 'body_limit', limit }`, so a JMAP server answers
  it with its own problem.

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
