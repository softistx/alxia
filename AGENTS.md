# AGENTS.md

Instructions for any coding agent working in `alxia`.

## What this repository is

A type-safe HTTP framework for Bun, published as `@alxia/*`:

| package | what it is | peers |
| --- | --- | --- |
| `@alxia/core` | the framework: routes, hooks, groups, plugins, cookies, SSE, WebSockets | — |
| `@alxia/client` | the client of an app, typed from `typeof app` alone | core |
| `@alxia/openapi` | the OpenAPI 3.2 document of an app, from its route schemas | core |
| `@alxia/openapi-routes` | `implemented` and `matchesSpec`: every operation of an OpenAPI document has a route, read from `app.routes` | core |
| `@alxia/zod` | Zod coercions (`zq`) and the OpenAPI converter | zod |
| `@alxia/graphql` | GraphQL Yoga as a route: the app's hooks and typed context, Yoga's plugins | core, graphql-yoga, graphql |
| `@alxia/react-router` | a React Router framework app served by the app: the pages as a catch-all behind its hooks, loaders reading its typed context, the client build's files; `createServer()` and `/vite`'s `alxia()` plugin, zero config: a default server without `app/server.ts`, a runnable `build/server/index.js`; the `alxia-react-router reveal` bin writes the default server out | core, react-router; vite (optional, `/vite`) |
| `@alxia/cors`, `@alxia/secure-headers`, `@alxia/compress` | function plugins: global hooks | core |
| `@alxia/rate-limit`, `@alxia/jwt`, `@alxia/logger` | app plugins: typed context, typed replies, routes | core |
| `@alxia/env` | environment variables through any Standard Schema | — |
| `@alxia/cache` | HTTP response caching, a store contract and a memory store | core |
| `@alxia/language` | the request's language, typed by the supported ones | core |
| `@alxia/i18n` | translations on `@nxgt/i18n`, the language from `@alxia/language` | core, language, @nxgt/i18n |
| `@alxia/context-storage` | the request's context through `AsyncLocalStorage`, as nxgt-core reads Hono's with `hono/context-storage` | core |
| `@alxia/telemetry` | a server span per request, on `@nxgt/telemetry` | core, @nxgt/telemetry |
| `@alxia/redis` | rate-limit and response-cache stores, idempotency, caches and locks, on `@nxgt/redis` and `@nxgt/redis-guard` | core, @nxgt/redis, @nxgt/redis-guard, zod; rate-limit and cache (optional) |
| `@alxia/janus` | sessions, refusals and permissions, on `@nxgt/janus` | core, @nxgt/janus |

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
| `examples/react-router` | React Router's official template (`bunx create-react-router@latest`, committed as generated), then `@alxia/react-router` added in three lines (`bun add`, `alxia()` in `vite.config.ts`, `start: bun build/server/index.js`), then an optional `app/server.ts`. That file holds `createServer()` with logger, compress and secure-headers with a policy the pages pass, a cookie session deriving `user`, `POST /api/todos` validated by Zod, `getLoadContext` and the `Register` declaration. On top of the template: the home loader reading `alxiaOf(context).user`, a sign-in action, a todo form with a 400, and a page streamed behind `<Await>`. `app/server.spec.ts` builds it, runs `bun build/server/index.js` on a free port, and builds a copy without `app/server.ts` to check the default server. |

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
  core does, as a package. A plugin is either an app given to `use` — it
  adds context, routes or typed replies — or a function `Plugin` that adds
  global hooks and returns the app unchanged in type. Plugins use the
  core's public API only: if one needs more, export it from the core.
- **The types are the product.** A mistake a type can catch is a compile
  error: a params schema that does not read the path, an unknown key in a
  route, an undeclared status, a body its schema refuses. Each has a
  `@ts-expect-error` in a spec; a new check gets one too, and a probe that
  the assertion really fails when wrong.
- **The client is honest.** Every status a route may answer is in its type:
  its declared replies, the replies of the hooks before it, its 400 when it
  validates, the 500 of every route. A handler cannot return a raw
  `Response`. A global hook's `Response` is outside the contract: use it
  only for what a typed client never asks.
- **Order is meaning.** A route hook applies to the routes declared after
  it, at runtime and in the types alike; a group's stay inside it. Global
  hooks apply everywhere. Keep the two in step.
- **What leaves the server is the schema's output.** A reply, an event, a
  socket message is validated and sent as its schema gives it back.

## Layering

```
core ◄── client, openapi, openapi-routes, graphql, cors, secure-headers, compress, rate-limit, jwt, logger,
         telemetry, janus, context-storage, cache, language
         i18n ◄── language
         redis ◄── rate-limit, cache (optional peers: the stores' contracts)
         react-router   (peers: react-router; vite, optional, for /vite; dev: openapi, compress for its specs)
zod             (peer: zod; dev: core, client, openapi for its specs)
env             (standalone)
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
| `bodyOf`, the permission guard's option types, the device cookie, in `janus/src/` and `@nxgt/janus-hono` | the same refusals and cookies whichever server answers; importing them would depend on Hono. Change both together. One divergence, on purpose: alxia's guard infers what `load`, `subject` and `ctx` read beyond `BaseContext` from their annotated parameters (`SubjectCtx` and `CheckCtx` on `PermissionOptions` and `OptionsArgs`, defaulted to `BaseContext`), and `use()` refuses an app that does not give it, and refuses the guard on every app when one is annotated `any`. Hono's callbacks take its `Context`, whose variables a middleware cannot require of the app, and `app.use()` checks nothing, so the Hono types have no such parameters. Every other part of the types stays in step |
| The body watcher, `logger/src/body.ts` and `telemetry/src/body.ts`, with `body.spec.ts` beside each | both time a streamed body to its end (`settled`, `watched`), and neither depends on the other; the core exports no such helper, and exporting one would be a minor of `@alxia/core`, which moves every package's peer range. The two `body.ts` are byte for byte the same but for their first line, and the two specs are the same. Change both together |
| `scripts/check-nxgt-versions.ts`, its spec and `.github/workflows/nxgt-versions.yml`, here and in nxgt-data (itself from nxgt-janus) | each repository releases on its own, and this one's check reads no `examples/`. What differs here: the manifests come from `readManifests()` (`packages/*` alone), `latest` from `latestOnRegistry()`, each line names the peer range and whether it admits `latest`, and the issue asks for a changeset; `folderOf` and `manifestOf` are nxgt-data's alone. A fix to the check or the workflow belongs in every copy |
| `scripts/verify-artifacts.ts` and `scripts/artifacts/`, here and in nxgt-http, nxgt-data, nxgt-janus and nxgt-core | the skeleton is nxgt-http's, and each repository releases on its own. `emit.ts`, the declaration-emit stage, started here (#87); softistx/nxgt-http#98, softistx/nxgt-data#146, softistx/nxgt-janus#186 and softistx/nxgt-core#173 port it in, so the copies are in step once they land, with the same `emit.spec.ts`, the injectable tsc run and Bun's types, which this copy took back from them. The `#!` skip in `imports.ts` (#79) is in nxgt-data's copy (softistx/nxgt-data#146) and nxgt-http's (softistx/nxgt-http#97); nxgt-janus and nxgt-core have no `imports.ts`. A check added to one copy belongs in the others |

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

`.github/workflows/ci.yml` runs three jobs on every pull request:

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

The last two resolve without a lockfile, so an upstream release can turn
them red with no change here. They are informational: read them, never make
them required. Both scripts rewrite manifests in place; never commit what
they write.

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
Merging to `develop` opens a "Version packages" PR; merging that publishes
with `bun publish`, in dependency order. Registry configuration lives in
`bunfig.toml`, never in `.npmrc`; publishing reads `$NPM_TOKEN`. Every
package is public and MIT, with its own copy of `LICENSE`.

## Conventions

- Biome, with tabs and single quotes. `./node_modules/.bin/biome check --write`
  before committing; `bunx biome ci` must pass.
- Commit messages: `<type>: <Capitalized summary>`, with `feat`, `fix`,
  `update`, `chore`, `docs`, `typo`, `ci`, `test` (specs and fixtures
  alone, no change a consumer sees).
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
