# Roadmap

What `@alxia/core` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/core/CHANGELOG.md).

## Now

- **One middleware form.** A middleware is a plain `(ctx, next) => …`
  function: `use(...)`, a route's middlewares, `ws(path, ...)` and
  `route(operation, ...)` take one written inline, and what it passes
  `next({ … })` the middlewares after it and the handler read, typed. Up to
  8 per call, each reading what the ones before it added.
  `defineMiddleware` stays, to share a typed middleware
  ([Upgrading](upgrading.md#one-middleware-form)).
- **A missing context, named.** A middleware that reads what the context in
  force does not give is one TypeScript error on that middleware, on
  TypeScript 6 as on 7, naming the key — `` `user` is missing from the
  context: add a middleware that gives it before this one ``, `` `user` is
  in the context with another type than this middleware reads ``, ``the
  path parameter `id` is not in this route's path`` — instead of "No
  overload matches this call"
  ([Upgrading](upgrading.md#readable-type-errors)).
- **A shared middleware reads the registered context.**
  `defineAppMiddleware(fn)` reads the context `Register` names, as
  `defineRoutes` and `AppContext` do, and a route that does not give it
  refuses it: a middleware file needs no import of the app and no type
  argument, while `defineMiddleware(fn)` keeps reading the base context
  ([Upgrading](upgrading.md#defineappmiddlewarefn-reads-the-registered-context)).
- **The forms deprecated in 0.4 removed.** The six request hooks of 0.3;
  a route's list of hooks and the two functions that made its hooks; a
  schema before the handler or in a route's options; `use(plugin)` and
  `plugin(middleware)`; `Alxia`'s third type parameter. One way is left to
  run code around a request: a middleware, with an error answered by a
  `try`/`catch` around `await next()` or, uncaught, at the route boundary.
  Each removed form throws or fails to compile with a message naming its
  replacement ([Upgrading](upgrading.md#050)).
- **Errors as problem details, opt in.** `alxia({ errors: 'problem' })`
  answers an escaped `HttpError`, a refusal's 400 and 413, a 500 and the
  router's 404, 405 and 426 as RFC 9457 problems, each with `type`,
  `title`, `status`, `detail` and `instance`; an `HttpError` carries its
  own `type`, `detail` and extensions, and a middleware answers in the
  app's format with `errorFormat` and `problemOf`
  ([Errors](guide/errors.md)).
- **Liveness and readiness probes.** `health({ checks })`, a plugin:
  `GET /health` while the process is up, `GET /ready` from the checks,
  each timed out and their report cached, 503 as soon as the shutdown
  starts, left out of `@alxia/openapi`'s `matchesSpec` by themselves
  ([Health and shutdown](guide/health-and-shutdown.md)).
- **A graceful shutdown.** `listen` handles `SIGTERM` and `SIGINT`:
  readiness 503, new connections refused, sockets closed with 1001, the
  requests in flight drained within `shutdownTimeout`, streams of events
  and GraphQL subscriptions ended, the `onStop` hooks, then the exit
  ([Health and shutdown](guide/health-and-shutdown.md#graceful-shutdown)).
- **Dev comfort.** In dev — `alxia({ dev })`, on only when `NODE_ENV` is
  `development` — `listen` prints the route table, a 404 names the
  closest route and a 405 the methods allowed, and a 500 shows its error: a
  page to a browser, under any Content-Security-Policy, its stack to any
  other client; `onListen` gets the table as data. In every mode, a factory
  given uncalled throws where it is declared, and `compose(...)` joins
  middlewares past the 8 a call types
  ([Development](guide/development.md)).

## Next

- **The retired client deprecated on npm.** Its last published version
  marked deprecated, pointing at the upgrading guide, once the owner runs
  the command the [upgrading guide](upgrading.md#no-more-client-spec-first)
  gives.
- **The old packages deprecated on npm.** `@alxia/openapi` 0.3.0 and
  earlier, and the retired package name the checks were published under
  until 0.4, marked deprecated with the commands the
  [upgrading guide](upgrading.md#the-old-alxiaopenapi-is-retired) gives,
  once the owner runs them after the releases.

## Later

- **Problem details by default.** `errors: 'problem'` the default in a
  later minor, once apps have declared their problems in their documents;
  `errors: 'json'` keeps today's bodies for an app that wants them
  ([Errors](guide/errors.md#making-it-the-default)).
- **Comments on a stream.** A handler yielding a comment line of its own
  (`: …`), beside the keep-alive the stream already sends while idle.
- **The original scheme and host in the observers.** `@alxia/telemetry`'s
  `url.scheme` and `server.address`, and the `X-Forwarded-Proto` and
  `X-Forwarded-Host` `@alxia/proxy` sends upstream, from `originalUrl(ctx)`
  when the app is behind a trusted proxy; today they read the request as
  it reached the app.
- **`X-Forwarded-Port`.** The port a proxy names apart from its host, for
  `originalUrl(ctx)`; today a port is read from the host alone.

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
  logging in the core.** Each is a middleware package to take or leave
  (`@alxia/cors`, `@alxia/secure-headers`, `@alxia/compress`,
  `@alxia/rate-limit`, `@alxia/jwt`, `@alxia/logger`), built on the core's
  public API only, so an app ships only what it uses.
- **A raw `Response` from a handler.** A handler answers with `reply`, so
  `responds` checks every status a route sends; a `Response` would be
  outside that contract. A middleware may return one, sent as it is, for
  what a client generated from the OpenAPI document never asks.

## Shipped

### Next release

- **Behind a proxy, declared once.** `alxia({ proxy: trustProxy({ trusted }) })`
  reads `ctx.ip` and the scheme and host the client asked for,
  `originalUrl(ctx)`, through one trust definition: from a trusted
  connection alone, from what your proxies wrote, checked (`http` or
  `https`, a bare `host[:port]`), so a direct client's
  `X-Forwarded-Proto: https` is ignored; `untrusted: 'refuse'` answers 403
  to forwarding headers from any other connection, never to a probe that
  sends none. `@alxia/react-router` hands React Router the original URL
  ([Serving](guide/serving.md#behind-a-proxy-proxy)).
- **A guard keeps a path's methods.** A 405 and a 426 run the chain of the
  routes at their path before they answer, so a guarded group without a
  prefix refuses `DELETE /secret` with its 401 instead of a 405 whose
  `Allow` names its routes; several groups at one path each run theirs
  ([Middleware](guide/middleware.md#which-chain-a-405-runs)).
- **One base, several apps.** `base.fork()` copies an app — its routes,
  its chain in force, its lifecycle hooks — typed as it is, so the real app,
  a spec's and a variant each build on the registered base without
  declaring on it twice; a route declared twice says when a fork is the fix
  ([Groups and plugins](guide/groups-and-plugins.md#several-apps-on-one-base-fork)).
- **Before the `101`, on a socket.** `app.ws(path, { upgrade, open, message })`
  awaits `upgrade(data, headers)` after the route's middlewares: `data` is
  what `socket.data` will be, `headers` the `101`'s, and a throw answers the
  upgrade request in the app's error format with no socket opened. Without a
  server, or for a handshake Bun would refuse, the `426` comes first and
  `upgrade` is not run ([WebSockets](guide/websockets.md#before-the-101-upgrade)).
- **The operation a request ran, for the observers.** `@alxia/graphql`
  reports each operation it executes with `reportOperation`; `operationOf(ctx)`
  gives an observer one summary — the type and name, or `batch` and every
  name — so `@alxia/logger` and `@alxia/telemetry` name it without importing
  the GraphQL package or each other ([Writing a plugin](guide/writing-a-plugin.md#telling-the-observers-what-ran)).
- **The operations of a socket, for the observers.** `onOperation(ctx, observer)`
  subscribes an observer during a socket's upgrade, and `startOperation(socket.data, report)`
  tells it of each operation the socket runs, then of its end, `'ok'` or
  `'errors'`: `@alxia/graphql` tells them over `ws`, `@alxia/logger` writes
  a line and `@alxia/telemetry` a span for each ([Writing a plugin](guide/writing-a-plugin.md#the-operations-of-a-socket)).
- **The client's address behind a proxy.** `forwardedIp({ trusted })`, the `ip` option for an app behind proxies: the client read from the right of `X-Forwarded-For` or `Forwarded`, past a number of hops or a list of CIDR ranges, never the first entry the client writes, so a rate limit keyed by `ip` cannot be bypassed with a header ([Serving](guide/serving.md#the-clients-address-ip)).

### 0.4.0

- **One middleware model.** A route takes its middlewares after its path or
  its options — `app.post(path, { bodyLimit }, auth, validate({ body: Post }), responds({ 201: Post }), handler)`.
  What a middleware passes to `next(added)` the ones after it and the
  handler read, typed; awaiting `next()` wraps the rest of the route; a
  reply it returns ends the request. `validate` stands where it is given,
  so an `auth` before it answers 401 before the body is read, and
  `responds` checks the replies made after it. `ws` and
  `route(operation, ...middlewares, handler)` take the same. The forms of
  0.3 kept working, deprecated, until 0.5 removed them.
- **Middlewares for every request.** `app.use(auth)` runs on every request,
  in the order declared, and types what it adds in the routes after it; a
  request no route matches — a 404, a 405, a preflight — runs them all.
  `app.use('/admin', requireAdmin)` guards the requests under a path,
  matched against the request's path decoded, empty segments collapsed and
  without case; a group's `use` adds to its subtree's context and stays
  inside it, and so does a plugin with a prefix of its own.
- **Errors through `next()`.** `validate` throws a `ValidationError` and a
  body past its limit a `ContentTooLargeError`; `refusalOf(error)` reads
  either, so a try/catch middleware answers a refusal in its own format.
  `settle(ctx, next())` gives an observer the response the client gets
  without swallowing the error, and `next.behind` runs the rest behind a
  reply sent at once. The packages' plugins became middlewares given to
  `use`.
- **Plugins are apps.** `app.plugin(plugin)` mounts an app — a sub-app,
  `defineRoutes`, `definePlugin` — or calls a function given the app, and
  checks what the plugin reads of the context.
- **Spec first.** The OpenAPI document is the contract: a route adds
  nothing to the app's type, the typed client is retired, and
  `@alxia/openapi`'s `matchesSpec` checks the routes against the
  operations `@nxgt/openapi-codegen`'s `alxia` option generates.
- **A context declared once.** `Register` names the chain that builds the
  context; `defineRoutes`, `AppContext`, `contextStorage()` and
  `@alxia/react-router`'s `alxiaOf` read it.

### 0.3.0

The hooks and route forms below were deprecated in 0.4 and removed in
0.5: each is a middleware now ([Upgrading](upgrading.md#050)).

- **Hooks on one route.** A route takes a list of hooks after its path —
  `app.patch('/bookmarks/:id', [canView, loadBookmark, canEdit], schema, handler)` — run
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
  and the document writer of the time saw each kind's replies apart: the 413 of a
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
  the client reads it. Given schemas, its replies are checked by them and
  sent under its content type. A group's hook stays in the group, and the default is
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
  `maxRequestBodySize`. A body over the limit is refused with a typed 413. A `Content-Length` over the limit is
  refused unread, and a chunked upload is cut off as soon as it passes the
  limit, never buffered whole. This holds for JSON, forms, text, custom
  parsers and a handler reading the raw stream. The refusal reaches
  `onRefusal` as `{ kind: 'body_limit', limit }`, so a JMAP server answers
  it with its own problem.

### 0.1.0

The request hooks below were removed in 0.5, and `use` no longer mounts
an app: a plugin goes to `plugin`.

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
- **A contract for the client.** `typeof app` was what a typed client
  called, with every status a route may answer: its replies, its hooks'
  replies, its 400 and its 500. Retired in 0.4: alxia is spec first.
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
