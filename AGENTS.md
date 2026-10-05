# AGENTS.md

Instructions for any coding agent working in `alxia`.

## What this repository is

A type-safe HTTP framework for Bun, published as `@alxia/*`:

| package | what it is | peers |
| --- | --- | --- |
| `@alxia/core` | the framework: routes and their middlewares (any `(ctx, next)` function, `defineMiddleware` to share a typed one, `validate`, `responds`, `use(...middlewares)` for the routes after it and every request no route matches, `settle`, `refusalOf`), `derive`, `decorate`, the lifecycle hooks `onStart`, `onStop` and `parser`, groups, plugins (`plugin(…)`), cookies, SSE, WebSockets; `Register`, which an app augments with `context: typeof base`, the chain that builds its context, read by `AppContext` and `defineRoutes(prefix?)`, a plugin built on that context that requires it of the app mounting it | — |
| `@alxia/openapi` | OpenAPI spec first: `implemented` and `matchesSpec`, every operation `@nxgt/openapi-codegen`'s `alxia` option generates from the document has a route, read from `app.routes`, and no other, and `apiDocs`, a plugin serving the document and a Scalar or Swagger UI page (pinned CDN versions with SRI, its own Content-Security-Policy, which `secureHeaders` keeps; `matchesSpec` leaves its routes out). Formerly `@alxia/openapi-routes`, renamed at 0.4.0, after the 0.3.0 of the package that held the name and wrote a document from an app's schemas, retired; the old name was removed from the repository at 0.5. A client generator from the document is on its roadmap | core |
| `@alxia/zod` | Zod coercions (`zq`) | zod |
| `@alxia/graphql` | GraphQL Yoga as a route: the app's middlewares and typed context, Yoga's plugins | core, graphql-yoga, graphql |
| `@alxia/react-router` | a React Router framework app served by the app: the pages as a catch-all behind its middlewares, loaders reading its typed context, the client build's files; `createServer()` and `/vite`'s `alxia()` plugin, zero config: a default server without `app/server.ts`, a runnable `build/server/index.js` built for Bun (the `ssr` environment gains the `bun` condition, `bun` and `bun:*` as builtins, `esnext`, all merged with the app's own) and self-contained under `react-router build` (`resolve.noExternal: true`, unless the app set `ssr.external: true`; a list it sets stays external), so `build/` runs with no `node_modules`; the `alxia-react-router reveal` bin writes the default server out | core, react-router; vite (optional, `/vite`) |
| `@alxia/cors`, `@alxia/secure-headers`, `@alxia/compress` | middlewares given to `use` first, on every response, 404s included; `secureHeaders({ nonce: true })` adds a typed `nonce` | core |
| `@alxia/rate-limit`, `@alxia/jwt`, `@alxia/logger` | middlewares given to `use`: typed context, typed replies | core |
| `@alxia/env` | environment variables through any Standard Schema: `defineEnv(shape, { secret, source })`, each variable by its own schema, typed, one `EnvError` listing every issue, secrets printed as `***` (`toJSON`, `inspect`, `toString`), `envExample(env)` and the `alxia-env example` bin writing a `.env.example` (which import the module in a mode where `defineEnv` refuses nothing), and the earlier `parseEnv` | — (dev: core, for the `Register` spec) |
| `@alxia/cache` | HTTP response caching, a store contract and a memory store | core |
| `@alxia/language` | the request's language, typed by the supported ones | core |
| `@alxia/i18n` | translations on `@nxgt/i18n`, the language from `@alxia/language` | core, language, @nxgt/i18n |
| `@alxia/context-storage` | the request's context through `AsyncLocalStorage`, as nxgt-core reads Hono's with `hono/context-storage`; typed by an app, by default the one core's `Register` names, and required of the app that uses it | core |
| `@alxia/telemetry` | a server span per request, on `@nxgt/telemetry` | core, @nxgt/telemetry |
| `@alxia/redis` | rate-limit and response-cache stores, idempotency, caches and locks, on `@nxgt/redis` and `@nxgt/redis-guard` | core, @nxgt/redis, @nxgt/redis-guard, zod; rate-limit and cache (optional) |
| `@alxia/janus` | sessions, refusals and permissions, on `@nxgt/janus` | core, @nxgt/janus |
| `@alxia/create` | `bun create @alxia [dir] [--template minimal\|api\|graphql\|react-router]`: the `create-alxia` bin, no module. Each template is files under `templates/<name>/`, copied by one `copyTemplate` (`src/copy.ts`) that rewrites `package.json` (`workspace:^` on `@alxia/*` replaced by the ranges it was published with), replaces the stored manifest's `name` (`my-app`, `my-api`, `my-graphql-api`), as a whole word, by the project's in every other text file (the README's `docker` commands), and renames `gitignore` and `_bunfig.toml`, which `bun publish` drops, to `.gitignore` and `bunfig.toml`, and `_biome.json`, which this repository's Biome would refuse as a nested root, to `biome.json`. Every template ships Biome: a standalone `biome.json` (spaces, double quotes, recommended rules), `@biomejs/biome` pinned exactly at the workspace's version, the scripts `lint`, `format`, `check`, `check:ci` (`biome ci`; `bun ci` is Bun's install) and `verify`, and `.vscode/`; a new project passes `bun run check:ci` with no finding. `minimal` is one route: `src/index.ts` exports `alxia().get('/', …)` and listens only `if (import.meta.main)`, `src/index.spec.ts` calls it with `app.request`, one dependency (`@alxia/core`), no OpenAPI, no generator, a Dockerfile that bundles `dist/index.js` (`verify`: `check:ci`, `typecheck`, `test`), and it is the template the README recommends first, and the prompt's default. `api` is alxia's own and spec first: `openapi.yaml` describes its operations, `bun run generate` (`nxgt-openapi generate`, `openapi-codegen.config.ts`, `alxia: true`, `validationErrors: false`) writes `src/generated/`, which is committed and which Biome skips (`!!**/src/generated`), `src/context.ts` holds the base (`decorate`) and its `Register` declaration, `src/routes/todos.ts` binds each route with `defineRoutes().route(operation, ...middlewares, handler)`, `src/app.ts` is `base.plugin(todoRoutes)`, `src/env.ts` is its `defineEnv` (`PORT`, `API_KEY`, redacted), `src/app.spec.ts` asserts `@alxia/openapi`'s `matchesSpec`, and `verify` starts with `bun run generate --check`; it has a Bun `Dockerfile` that builds `dist/server.js` and holds `dist/` alone (`start` runs `bun dist/server.js`), `.dockerignore` and `.env.example`; `graphql` is schema first on `@alxia/graphql` and GraphQL Yoga: `schema.graphql` is the contract, `bun run generate` (`graphql-codegen --config codegen.ts`: `typescript` and `typescript-resolvers`, `contextType: ../context#Context`, `mappers`) writes `src/generated/resolvers.ts`, committed and skipped by Biome, `src/context.ts` holds the base (`decorate({ env, db }).use(viewerOf)`, an inline middleware that types `viewer`) and `Context = GraphQLContext<typeof base>`, `src/resolvers.ts` is `Resolvers`, `src/schema.ts` imports `schema.graphql` with `{ type: 'text' }` (declared by `src/graphql.d.ts`, bundled by `bun run build`), a subscription over server-sent events, `src/env.ts` (`defineEnv`), `src/app.spec.ts` POSTs `/graphql` through `app.request`, and `verify` starts with `bun run generate --check`; `react-router` is React Router's official scaffold committed as generated plus `examples/react-router`'s alxia layer, its Bun `Dockerfile` included. No scaffold runs at creation. Every dependency is moved to the registry's newest at creation: alxia's within the ranges it was published with (the newest of the same minor while npm has not propagated the exact version yet), the rest within alxia's peer ranges; `@biomejs/biome`, pinned exactly, moves to the newest patch of its own minor, while the `api` template's `@nxgt/openapi-codegen` and the `graphql` template's three `@graphql-codegen/*` stay at the exact versions the templates ship (`KEPT_EXACT`), since `verify`'s `generate --check` fails on a generator patch that writes `src/generated/` differently | — (dev: core, env, graphql, openapi, react-router, whose versions it writes; @nxgt/openapi-codegen, @graphql-codegen/*, graphql, graphql-yoga) |

Its skeleton is `softistx/nxgt-http`'s: the Bun workspace, the root
`build.ts`, Biome, changesets, `scripts/publish.ts` and `verify:artifacts`.
A check added there is a check to port here.

## `examples/`

`examples/` holds applications, not packages. Each is `private` and
unscoped, and declares the packages by their npm range (`^0.1.0`), as a
user's app would, not by `workspace:^`: Bun links a range a workspace
member satisfies to that member, and `changeset version` moves the ranges
with each release (measured on a simulated minor of core). They are workspace
members, so one `bun install` covers them and Biome lints them, each in
its own style when it has a `biome.json`. The root `typecheck` and `test`
run theirs after the packages' (`scripts/workspace.ts <script> packages
examples`), so an example that no longer compiles or answers fails CI like
a package. The release scripts never see them: `publish.ts`,
`verify-artifacts.ts` (through `scripts/artifacts/packages.ts`) and
`check-nxgt-versions.ts` read `packages/*` alone, and a spec of each says
so. `newest-peers.ts` and `newest-majors.ts` take their ranges from
`packages/*` alone too, then move an example's own copy of each peer they
pinned (`followPins`), since two copies of vite do not work together. An
example's other dependencies still float in those jobs. Every example
defines `typecheck` and `test`, which the root runs. A change
confined to `examples/` needs no changeset. The convention is nxgt-data's.

| example | what it shows |
| --- | --- |
| `examples/react-router` | React Router's official template (`bunx create-react-router@latest`, committed as generated), then `@alxia/react-router` added in four changes (`bun add`, `alxia()` in `vite.config.ts`, `start: bun build/server/index.js`, a `bunfig.toml`), the template's Node `Dockerfile` replaced by a multi-stage one, built on `oven/bun:1` and run on `oven/bun:1-alpine`, whose image holds `build/` alone, then an optional `app/server.ts`. That file holds `createServer()` with logger, compress and secure-headers with a nonce per request and a policy the pages pass, a cookie session deriving `user`, `POST /api/todos` validated by Zod, `getLoadContext` and the `Register` declaration. On top of the template: `app/entry.server.tsx` as `react-router reveal` writes it, plus `nonceOf(loadContext)` in three lines; the home loader reading `alxiaOf(context).user`, a sign-in action, a todo form with a 400, and a page streamed behind `<Await>`. `app/server.spec.ts` builds it, runs `bun build/server/index.js` on a free port, starts `react-router dev` on a free port to check the nonce on every script there and in the build, and builds a copy without `app/server.ts` to check the default server. |

## Principles

- **No package has a dependency.** What one needs at runtime is a peer:
  `@alxia/core`, `zod`, `graphql-yoga`. Bun's and the web platform's own APIs —
  `Bun.CookieMap`, `Bun.file`, Web Crypto, `CompressionStream`, `node:zlib`
  — are not dependencies. `verify:artifacts` fails a manifest with a
  `dependencies` field that lists anything.
- **The core knows no validator.** It reads `~standard`, and nothing in
  `@alxia/core` or `@alxia/openapi` names Zod. What only Zod can do goes in
  `@alxia/zod`. Specs may use Zod, a devDependency, and `core` has a spec
  with a schema written by hand to keep it honest.
- **A store is a contract, with two answers.** What keeps state —
  `@alxia/rate-limit`, `@alxia/cache` — defines its store's interface and
  ships a memory store; `@alxia/redis` answers the same interface across
  processes. The plugin never knows which it was given.
- **Modular by plugin, not by option.** A feature that can live outside the
  core does, as a package: a middleware given to `use` when it acts on
  requests, a plugin when it adds routes or `decorate`s. A plugin is either
  an app given to `plugin` — it adds context, routes or typed replies — or
  a function `Plugin`, given to `plugin` too, that returns the app
  unchanged in type; `plugin` takes exactly one, and throws when a function
  returns anything but an app. `use` takes middlewares alone, and throws
  when given an app. Plugins use the core's public API only: if one needs
  more, export it from the core.
- **The types are the product.** A mistake a type can catch is a compile
  error: a params schema that does not read the path, an unknown key in a
  route, an undeclared status, a body its schema refuses. Each has a
  `@ts-expect-error` in a spec; a new check gets one too, and a probe that
  the assertion really fails when wrong.
- **The spec is the contract.** alxia is OpenAPI spec first: the document
  is the source, written, never generated from the app. The routes are
  bound to the operations generated from it (`@nxgt/openapi-codegen`'s
  `alxia` option, in the `api` template), `@alxia/openapi`'s `matchesSpec`
  checks that they match both ways, and a client is generated from the same
  document by the developer's own generator. The server's types
  check a handler — what its middlewares add, its `reply` against its
  `responds`, its path — and accumulate no route table for a client:
  `Alxia<Ctx, Prefix>`, and a route returns the app unchanged in type. A
  handler cannot return a raw `Response`. A middleware's `Response` is
  outside the contract: use it only for what no operation describes.
- **Order is meaning.** A middleware given to `use`, a `derive` and a
  `decorate` apply to the routes declared after them, at runtime and in the types
  alike; a group's stay inside it — its routes, and the requests no route
  matches under its prefix — and so do a plugin's that has a prefix of its
  own (`Scope.enclose`, `absorb`), which then adds nothing to the context
  after it (`MountedIn`). The app's `use()` middlewares also wrap
  the router: a request no route matches — a 404, a 405, a preflight —
  runs every one of them, wherever declared, in declaration order, then
  its answer, so a `use()` after a route runs on unmatched requests and
  never on that route. A route's middlewares run in the order given,
  `validate` and `responds` among them, and what one passes `next` is
  typed only after it. Errors are rejections through `next()`; what no
  middleware catches is answered at the route boundary, outermost — an
  `HttpError`'s status and body, a 500 —
  and `settle(ctx, next())` gives an observer that answer early without
  swallowing the error: once the observer returns, the error goes on to
  the middlewares around it (`settled.ts`), and the response it made is
  sent when none catches it. So an observer (logger, telemetry,
  secure-headers, cors, compress) goes first, and a try/catch middleware
  after the observers, so they see its reply; it catches the error
  wherever it stands. Keep the runtime and the types in step.
- **One route model.** A route, a socket's upgrade and `route(operation)`
  take the same `...middlewares`, each a plain `(ctx, next)` function, and
  `use(...middlewares)` gives them to every route declared after it,
  before the route's own. What a middleware passes `next` is inferred, and
  the middlewares after it read it typed; each is checked against the
  context in force where it stands (`Step` and `Missing`,
  `types/step.ts`), so a middleware that reads what that context does not
  give is one compile error on it, naming the key. `use(path, …)` is
  matched against the request's path: decided at declaration when the
  route's own pattern settles it (`reach` in `scope-path.ts`), checked per
  request with a pattern compiled once when it does not, so a
  `/users/:id` route requested as `/users/admin` runs
  `use('/users/admin', …)`. The request's path is read fail closed, as the
  router, the static files and React Router read it: segments decoded, an
  encoded `/` splitting one, empty ones collapsed, compared without case;
  a path without `%` nor `/.` is read in place, allocating nothing. A
  plugin's `use(path, …)` is rebased with its routes when it is mounted.
  `chain.ts` runs a route's chain and the unmatched chain alike. Every
  package middleware is given to `use`. `use` refuses an app, and a
  `validate` or `responds` (their mark, `Symbol.for`, shared by two copies
  of core), and a middleware given a path adds nothing, a compile error
  otherwise: a subtree's context is a group's. `derive` stays, the
  shorthand for a middleware that only adds. The forms 0.4 deprecated — the
  request hooks, a list of hooks and the two helpers that made them, a
  schema before the handler or in the options, `use(plugin)`,
  `plugin(middleware)` —
  were removed in 0.5, and each throws or fails to compile with a message
  naming what replaced it (`removed-forms.spec.ts`).
- **Register the base, not a key.** `Register` names the chain that builds
  the context (`context: typeof base`), never the app that mounts the
  routes, whose type would then read itself (TS7022), and never a context
  key, which would type routes declared before what adds it. What reads it
  requires it: `defineRoutes()` carries the registered context in its own
  as a requirement `plugin` checks (`RequiredIn`, `Mounted` in
  `plugin-method.ts`), and `contextStorage()` marks its plugin with it.
  `defineMiddleware(fn)` reads it too (`RegisteredContext`), and is
  refused where the context does not give it; a middleware the registered
  base is itself built with says `defineMiddleware<Empty>()(fn)`, or the
  base's type would read itself, and a package's middleware names what it
  reads (`<Empty>` or `<Requires>`), never the app's registration.
  `alxia()` stays on `BaseContext`. A spec that
  needs `Register` augmented runs `tsc` on a program of its own under
  `test/register/`, which the package's `tsconfig.json` excludes, and
  core's `test/declarations/registered.ts`, excluded too, is compiled by
  the declaration build alone.
- **What leaves the server is the schema's output.** A reply, an event, a
  socket message is validated and sent as its schema gives it back.

## Layering

```
core ◄── openapi, graphql, cors, secure-headers, compress, rate-limit, jwt, logger,
         telemetry, janus, context-storage, cache, language
         i18n ◄── language
         openapi (dev: secure-headers, for the apiDocs spec)
         janus   (dev: i18n, language, @nxgt/i18n for its specs)
         redis ◄── rate-limit, cache (optional peers: the stores' contracts)
         react-router   (peers: react-router; vite, optional, for /vite; dev: openapi, compress for its specs)
zod             (peer: zod; dev: core for its specs)
env             (standalone; dev: core for its Register spec)
create          (no peer; dev: core, env, graphql, openapi, react-router: the versions its projects install;
                 @nxgt/openapi-codegen and @graphql-codegen/*, the versions the api and graphql templates pin)
```

A package that uses a sibling declares it by `workspace:^`, as a peer and a
devDependency, and imports it by its published name, which resolves through
`node_modules` to the sibling's `dist/`. **There are no cycles.**

## Adapters to the nxgt suite

An integration with something the nxgt suite already does — telemetry,
Redis, identities — is an adapter over the nxgt package, never a second
implementation: `@alxia/telemetry` is `@nxgt/telemetry`, `@alxia/redis` is
`@nxgt/redis` and `@nxgt/redis-guard`, `@alxia/janus` is `@nxgt/janus`. The
nxgt package is a peer. Where the suite has a Hono adapter, the alxia one
mirrors it — `@nxgt/telemetry-hono`, `@nxgt/janus-hono` — and the table
below records what is kept twice.

- **Bun 1.4.2.** `@nxgt/redis` needs Bun 1.4's `RedisClient`; the
  repository pins the version nxgt does.
- **Redis in the specs.** `@alxia/redis`'s run against `$REDIS_URL`, or a
  `redis-server` from `$PATH` they start on a free port. CI runs a Redis
  service container and sets `REDIS_URL`. A spec never skips for want of
  Redis: it fails, saying so.

| Kept twice | Why |
| --- | --- |
| The HTTP attribute names, in `telemetry/src/attributes.ts` and `@nxgt/telemetry-hono`'s | importing them would depend on Hono; a server span from either must read the same in a dashboard. Change both together |
| The Apollo Sandbox page, in `graphql/src/sandbox.ts` and `@nxgt/shared-graphql`'s `renderSandbox` | that one is Hono's `html`; both start the Sandbox at the URL the page was asked at (nxgt-core#171). alxia's passes the path, and the page resolves it against its own address, so a TLS proxy in front of the server changes nothing; that one still passes the server's URL. Importing it would depend on Hono. Change both together |
| `bodyOf`, the permission guard's option types, the device cookie, in `janus/src/` and `@nxgt/janus-hono` | the same refusals and cookies whichever server answers; importing them would depend on Hono. Change both together. One divergence, on purpose: alxia's guard infers what `load`, `subject` and `ctx` read beyond `BaseContext` from their annotated parameters (`SubjectCtx` and `CheckCtx` on `PermissionOptions` and `OptionsArgs`, defaulted to `BaseContext`), and `plugin()` refuses an app that does not give it, and refuses the guard on every app when one is annotated `any`. Hono's callbacks take its `Context`, whose variables a middleware cannot require of the app, and `app.use()` checks nothing, so the Hono types have no such parameters. Every other part of the types stays in step |
| The body watcher, `logger/src/body.ts` and `telemetry/src/body.ts`, with `body.spec.ts` beside each | both time a streamed body to its end (`settled`, `watched`), and neither depends on the other; the core exports no such helper, and exporting one would be a minor of `@alxia/core`, which moves every package's peer range. The two `body.ts` are byte for byte the same but for their first line, and the two specs are the same. Change both together |
| The slots of each middleware form — `aBound`, `bBound`, `handledBound`, `head`, `reads`, `excludes`, `tail`, `out` — written out in `RouteForm`, `RouteOptionsForm`, `SocketForm`, `SocketOptionsForm`, `OperationForm` and `UseForm` (`packages/core/src/app/*-forms.ts`, `route-middlewares.ts`, `route-options.ts`, `socket-options.ts`), each extending `FormSlots` for its shape alone, which `Ladder` and `Bare` (`ladder.ts`) read through `Forms` (`forms.ts`). `Ladder` checks each middleware against its form's `reads` with `Step` and `Missing` (`types/step.ts`), and `Rest` and `Guarded` (`forms.ts`) refuse by its arity the call that the other form of the same method takes (`excludes`: `'object'` on a form whose first middleware stands where the options form's options stand, `'function'` on the options form), so that TypeScript reports the one form that applies | inheriting the shared slots from a base interface costs each call an instantiation more: measured on core's `tsc`, the version with bases made 631k types, the written-out one 558k (2.37M instantiations before the shared ladder, 2.53M after). Change the `reads` of the route, options, socket, socket options and operation forms (`RouteReads`) together, the two route forms' `handledBound` and `tail` together, and the `excludes` of each pair of forms of one method together |
| `PEER_RANGES` in `create/src/versions.ts` and the peer ranges of `@alxia/core` (`typescript`), `@alxia/zod` (`zod`), `@alxia/graphql` (`graphql`, `graphql-yoga`) and `@alxia/react-router` (`react-router`, `vite`) | the published `@alxia/create` cannot read its siblings' manifests, and holds a project's dependencies to these ranges. `versions.spec.ts` compares them: widening one of those peers fails there until `PEER_RANGES` is widened too, with a changeset for `@alxia/create` |
| React Router's official scaffold, in `create/templates/react-router/` and `examples/react-router` | both are `create-react-router`'s output committed as generated, plus the same alxia layer; the template is copied as it is, so a new project needs no network for its files and nothing to recognise. `create/src/templates/react-router.spec.ts` holds the template's `vite.config.ts`, `_bunfig.toml` and `Dockerfile` byte for byte to the example's `vite.config.ts`, `bunfig.toml` and `Dockerfile`; the regeneration script writes the example's `Dockerfile` over the scaffold's and gives the scaffold's `README.md` Bun's commands (`toBun`, which refuses an npm, npx, pnpm or yarn command it does not know), and `create/src/copy.spec.ts` refuses one in every stored template's README, `Dockerfile` or scripts. That pattern is kept twice, `OTHER_MANAGER` in the script and a copy in `copy.spec.ts`, since a package spec does not import from `scripts/`: change both together. When React Router ships a new major, once `@alxia/react-router`'s peer accepts it, regenerate the template with `bun scripts/regenerate-react-router-template.ts` (`bunx create-react-router@latest` with `--yes --no-install --no-git-init --no-agent-skills --no-motion`, then the layer), regenerate the example the same way, read both diffs, and add a patch changeset for `@alxia/create` |
| The projects' Biome setup: `create/templates/{minimal,api,graphql}/_biome.json`, `README.md` and `package.json` scripts, and `BIOME_CONFIG`, `BIOME_SCRIPTS` and `LINT_SECTION` in `scripts/templates/biome.ts`, which `scripts/regenerate-react-router-template.ts` writes into the `react-router` template | a template is files, and the regeneration script writes the scaffold from nothing. `templates.spec.ts` holds every template to the same `$schema`, `vcs`, `formatter`, `javascript` and `assist`, the same Biome scripts, the same `.vscode/settings.json`, and `@biomejs/biome` at the workspace's installed version; `scripts/templates/biome.spec.ts` holds the committed `_biome.json` to `BIOME_CONFIG`, and the `api` README to `LINT_SECTION` but for its lines on `dist/` and `verify`. `create/templates/biome.json` (`"root": false`) extends each `_biome.json`, so the root `biome ci` checks the templates by the union of their settings, and skips the `api` template's `src/generated/` as its `_biome.json` does (`!!**/src/generated` in both); each template's spec runs `bun run check:ci` on a generated project, by its own alone. Bumping the workspace's Biome fails `templates.spec.ts` until every template pins it, are formatted by it (the script for `react-router`) and pass. Change them together |
| The `SIGINT`/`SIGTERM` stop, in `create/templates/api/src/server.ts`, `graphql/src/server.ts`, `minimal/src/index.ts` and `react-router/src/server.ts`'s `start` | a template is the project's own code and cannot import it, and exporting a helper would be a minor of `@alxia/core`, which moves every package's peer range. All stop the app and exit, so Bun as a container's process 1 stops on `docker stop`; `minimal`'s is one line on `SIGTERM` alone, to stay small. Change them together |
| The `Dockerfile` of `create/templates/{minimal,api,graphql}` | each template is stored files and the Dockerfile is the project's own, so it cannot import a shared one; they differ in the bundle's name (`dist/index.js`, `dist/server.js`) and a comment. `templates.spec.ts` holds each to a build stage on `oven/bun:1`, a final `oven/bun:1-alpine` stage that copies `dist/` from the build alone, and `bun --no-install`; the `react-router` one is a variant over `build/`. Change them together |
| alxia's 400, as `ValidationErrorBody` in `core/src/app/refusal.ts` and as the `ValidationError` schema of `create/templates/api/openapi.yaml` | the spec-first `api` template declares the refusal alxia answers with, so a client generated from its document reads it, and `@nxgt/openapi-codegen`'s `validationErrors`, which would declare `@nxgt/openapi-hono`'s, is off. `responds` checks every reply with a declared status, a refusal's included: a body that drifts from the spec is a 500, which the template spec's 400 test catches. Change both together |
| `@nxgt/openapi-codegen`'s version, in `create/templates/api/package.json` (exact) and `create/package.json`'s devDependencies, and the committed `create/templates/api/src/generated/`; likewise `@graphql-codegen/cli`, `typescript` and `typescript-resolvers`, and `create/templates/graphql/src/generated/` | the templates' generated files are those versions' output; `templates/api.spec.ts` and `templates/graphql.spec.ts` hold the versions equal to the installed ones and run `bun run generate --check` on a copy. A bump (`nxgt:outdated` lists it) moves both, runs `bun run generate` in the template, reads the diff, and adds a patch changeset for `@alxia/create` |
| `scripts/check-nxgt-versions.ts`, its spec and `.github/workflows/nxgt-versions.yml`, here and in nxgt-data (itself from nxgt-janus) | each repository releases on its own, and this one's check reads no `examples/`. What differs here: the manifests come from `readManifests()` (`packages/*` alone), `latest` from `latestOnRegistry()`, each line names the peer range and whether it admits `latest`, and the issue asks for a changeset; `folderOf` and `manifestOf` are nxgt-data's alone. A fix to the check or the workflow belongs in every copy |
| `scripts/verify-artifacts.ts` and `scripts/artifacts/`, here and in nxgt-http, nxgt-data, nxgt-janus and nxgt-core | the skeleton is nxgt-http's, and each repository releases on its own. `emit.ts`, the declaration-emit stage, started here (#87); softistx/nxgt-http#98, softistx/nxgt-data#146, softistx/nxgt-janus#186 and softistx/nxgt-core#173 port it in, so the copies are in step once they land, with the same `emit.spec.ts`, the injectable tsc run and Bun's types, which this copy took back from them. The `#!` skip in `imports.ts` (#79) is in nxgt-data's copy (softistx/nxgt-data#146) and nxgt-http's (softistx/nxgt-http#97); nxgt-janus and nxgt-core have no `imports.ts`. `testCodeProblems` in `tarball.ts` skips a `templates/` folder here only: `@alxia/create`'s `api` template ships the project's own `src/app.spec.ts`, and no other repository ships templates. A check added to one copy belongs in the others |

## The build

Every package is built by the root `build.ts`: JavaScript from `Bun.build`
with `packages: 'external'`, declarations from `tsc` against
`tsconfig.build.json`. Entry points are declared under `alxia.entrypoints`,
each with a matching key in `exports`, or, for a bin, in `bin`: its entry
starts with `#!/usr/bin/env bun`, `build.ts` refuses a bin with no `#!`
line and makes it executable, and `verify:artifacts` runs it from the
installed tarball with `--help`.

- **Build before typecheck and tests**: `exports` points at `dist/`.
  `bun run build`, `typecheck` and `test` go through `scripts/workspace.ts`,
  which runs a package only after every sibling it names in any dependency
  field: `bun run --filter` started dependents beside their dependencies.
- **`@alxia/react-router`'s specs build a React Router app.** They run
  `react-router build` on `packages/react-router/fixture` (about a second)
  and import the package by its published name, its `dist/`, not `./index`:
  the fixture's build imports it so, and a spec holding the source would
  set an `alxiaContext` its loaders never read. The `/vite` specs start
  Vite in process and build with the plugin on copies of the fixture,
  `packages/react-router/.fixture-*`, gitignored and removed after, with
  its `app/server.ts` and, for the default server, without it; a build
  runs with `NODE_ENV=production`, since `bun test` sets `test`.
- **A build that exits 0 is not evidence the artifact loads.**
  `bun run verify:artifacts` packs, installs and imports every package.
  It also emits the declarations of each package's `test/declarations/*.ts`
  against the install, with this repository's `@types/bun`
  (`scripts/artifacts/emit.ts`): a type an exported app's `.d.ts` must name
  and the entry does not export fails there with TS2883, and nowhere else,
  since inside the workspace a package resolves to its own folder and tsc
  names the type by a relative path. A builder that adds a type to an app's
  type gets a case there. `emit.spec.ts` covers the stage without a pack,
  through a fake tsc.

## CI

`.github/workflows/ci.yml` runs four jobs on every pull request:

- **CI**, the required one: lint, build, typecheck, tests, `verify:artifacts`
  and the changeset check, on the lockfile's toolchain — the first
  alternative of each peer range (`typescript: ^6.0.3 || ^7.0.0` installs 6).
- **Newest peers**: `scripts/newest-peers.ts` pins each peer to the last
  alternative of its range, then the same build, typecheck, tests and
  `verify:artifacts`. Widening a range is all it takes for this to test it.
- **Newest majors**: `scripts/newest-majors.ts` pins each widened peer to
  npm's `latest`, without `bun.lock`, then build, typecheck and
  `verify:artifacts`, no tests. It tries a new major before any range
  accepts it, and warns when no range accepts it yet: the signal to widen,
  after which Newest peers runs the specs on it.

- **Templates**: `bun run verify:templates` (`scripts/verify-templates.ts`)
  packs every package, serves the tarballs from a registry on localhost
  that passes every other request to npm's (`scripts/templates/registry.ts`),
  and runs `bun create @alxia` against it, with an empty Bun cache, for each
  template (`scripts/templates/checks.ts`): the project installs this
  checkout's packages, then its `typecheck` and `build` run (the `minimal`,
  `api` and `graphql` templates' `verify` in place of `typecheck`:
  `generate --check` for the last two, `check:ci`, `typecheck`, `test`), and
  its `bun run start` answers (`GET /` 200, `POST /todos` 201, `POST /graphql`
  `{ __typename }` 200, `GET /` 200 and one `/assets/*.js` it names 200). It also runs
  `bunx @alxia/create --help`, and checks `@alxia/create`'s tarball holds
  each template's files, `gitignore` and `_bunfig.toml` included. Then it
  builds each project's `Dockerfile` and expects the same answer from the
  container (`scripts/templates/docker.ts`, which logs the image's size):
  `bun.lock` is pointed at the
  registry as `host.docker.internal`, mapped by `--add-host` on Linux. With
  no Docker daemon it skips that step locally and fails on CI (`CI` set). It
  needs the network: every non-alxia dependency comes from npm, at the
  newest versions `@alxia/create` resolves. A few minutes measured
  locally, most of it the four image builds; kept out of `bun run test`.

The last three resolve without a lockfile, so an upstream release can turn
them red with no change here. They are informational: read them, never make
them required. `newest-peers.ts` and `newest-majors.ts` rewrite manifests
in place; never commit what they write.

`.github/workflows/nxgt-versions.yml` runs one more, every Monday and on
`workflow_dispatch`, not on pull requests:

- **nxgt versions**: `bun run nxgt:outdated`
  (`scripts/check-nxgt-versions.ts`, spec'd beside it) lists each `@nxgt/*`
  devDependency of `packages/*` whose locked version is behind npm's
  `latest`, and whether its peer range admits that release (`^0.3.1` does
  not admit `0.4.0`: the bump widens it). Exit 0 when all are current, 1
  when something is behind, 2 when the registry did not answer, which is
  never read as "current". Something behind opens the issue *@nxgt/\*
  devDependencies behind npm latest*, or updates the one open, and fails the
  run; a later run with nothing behind closes it. The job's `permissions`
  are `contents: read` and `issues: write`, nothing more. The bump is a pull
  request like any other: the devDependency, the peer range when it must
  widen, `bun.lock`, and a changeset, since it is a change under
  `packages/`. Not Dependabot, though its Bun updater reads this
  `lockfileVersion` 1 lock: it would bump the devDependency alone, where a
  `^0.x` peer must widen with it and a changeset must come along, and it
  stops reading the lock the day it is rewritten as version 2, as
  nxgt-data's already is.

## TypeScript

`tsconfig.base.json` is strict past `strict`: `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`,
`noUnusedLocals` and the rest. An app's own tsconfig may hold any of them,
so the published declarations must compile under all of them. Only
`scripts/`, copied from nxgt-http, relaxes two.

## Releasing

Changesets, independent versions. A change under `packages/` needs one.
`scripts/publish.ts` publishes a package after every sibling it names in
any dependency field, devDependencies included: `@alxia/create` writes the
versions of its devDependencies into the projects it makes, which `bun
publish` turns from `workspace:^` into `^<version>`, so those must be on
the registry first. They are fixed when it is published: a release of
`@alxia/core` alone leaves new projects on the previous range, so a minor
of `core`, `openapi` or `react-router` that new projects should get comes
with a patch changeset for `@alxia/create`. `publish.ts` skips a version
the registry already has, so a name taken over from a retired package
starts above that package's last version: `@alxia/openapi`, formerly
`@alxia/openapi-routes`, was set to 0.3.0, the retired package's last, and
its first release under the name is the minor after it, 0.4.0. `npm
deprecate` of a retired package or name waits for the owner, and names the
retired range alone. npm can take minutes to serve a
version just published while `@alxia/create` is already visible: it then
writes the newest release of the same minor, whose `^` range still takes
the new one.
Merging to `develop` opens a "Version packages" PR; merging that publishes
with `bun publish`, in dependency order. Registry configuration lives in
`bunfig.toml`, never in `.npmrc`; publishing reads `$NPM_TOKEN`. Every
package is public and MIT, with its own copy of `LICENSE`.

## Conventions

- Biome, with tabs and single quotes. `./node_modules/.bin/biome check --write`
  before committing; `bunx biome ci` must pass. The templates under
  `packages/create/templates/` are in their projects' style, spaces and
  double quotes, from their own `_biome.json`, which
  `packages/create/templates/biome.json` extends.
- Commit messages: `<type>: <Capitalized summary>`, with `feat`, `fix`,
  `update`, `chore`, `docs`, `typo`, `ci`, `test` (specs and fixtures
  alone, no change a consumer sees).
- Dockerfiles build, and the final image holds the build output, not
  `node_modules`: a build stage runs `bun run build`, and the last stage
  copies its output alone, on `oven/bun:1-alpine` (the build stages stay
  on `oven/bun:1`). `create/src/copy.spec.ts` checks every template's.
- Bun is the package manager in every command, doc, template, Dockerfile
  and script: `bun install`, `bun run`, `bunx`, `bun create`, `oven/bun`,
  unless an exception is stated. The one documented exception: `npm create
  @alxia` also works, and is shown after `bun create @alxia`.
- Imports carry no extension. Specs live next to the code they test, files
  are organised in folders by role.
- A package's `README.md` is its npm page: by section, a copy-paste example
  each, and an **API** table of every export.
- A package's `docs/`, where it has one, is the long version, listed in
  `files` so it ships: `README.md` (an index of the pages), a guide
  (`guide/<area>.md` for a large package, a single `guide.md` for a small
  one), `troubleshooting.md` (one entry per error, headed by its exact
  message, or by its symptom for a trap that prints none) and `roadmap.md`.
  The README ends with a **Documentation** section linking them by full
  GitHub URL on `develop`, since npm does not resolve relative links.
