# @alxia/create

## 0.5.1

### Patch Changes

- [#235](https://github.com/softistx/alxia/pull/235) [`9d85fc8`](https://github.com/softistx/alxia/commit/9d85fc8817514d47776b7e29675b750dff7a002d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The roadmap ships the `api` template's client errors under 0.5.1, and the docs index names them.

- [#234](https://github.com/softistx/alxia/pull/234) [`153ce3c`](https://github.com/softistx/alxia/commit/153ce3ceaac2bfb5be2619e0d28bd087cfb46247) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Troubleshooting for the two errors an `api` project's tests can meet through the typed client, `ValidationError` and `UndeclaredStatusError`, linked from the template's README and the guide, and a spec that holds the template's `@nxgt/httpyz` and `@nxgt/openapi-httpyz` ranges equal to `@alxia/create`'s own.

## 0.5.0

### Minor Changes

- [#232](https://github.com/softistx/alxia/pull/232) [`3465ac2`](https://github.com/softistx/alxia/commit/3465ac2f67458858388662afcf385ecdeb8d2283) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `api` template's tests call the app through `@nxgt/openapi-httpyz` over the generated `operations.ts`, with `@nxgt/httpyz`'s `fetch` being `app.fetch`, instead of `openapi-fetch`: each reply is a union narrowed on its status. A new project's devDependencies hold `@nxgt/httpyz` and `@nxgt/openapi-httpyz` in place of `openapi-fetch`.

## 0.4.3

### Patch Changes

- [#229](https://github.com/softistx/alxia/pull/229) [`5970afd`](https://github.com/softistx/alxia/commit/5970afd4c99bf048297077f1ae7ce36590c18a7e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New projects get the `@alxia/react-router` minor with `withAlxia(fn)`, `context.alxia`, and `ctx.server` under `react-router dev`.

## 0.4.2

### Patch Changes

- [#220](https://github.com/softistx/alxia/pull/220) [`098daa2`](https://github.com/softistx/alxia/commit/098daa2b1e431298e32be168ce367c583514b28a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New projects install `@alxia/core` 0.14, so the templates match the alxia packages that now peer on `^0.14.0`.

## 0.4.1

### Patch Changes

- [#213](https://github.com/softistx/alxia/pull/213) [`2a77131`](https://github.com/softistx/alxia/commit/2a771316ce53a46d33df0dec11a77568f7990891) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `graphql` template's spec calls the app through `graphqlClient` from `@alxia/graphql/testing` instead of a hand-written helper.

- [#214](https://github.com/softistx/alxia/pull/214) [`b4195c0`](https://github.com/softistx/alxia/commit/b4195c0518ce2c5c8c68181e5cb3de67890c2ae8) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the roadmap versions the `graphqlClient` spec of the `graphql` template as 0.4.1.

## 0.4.0

### Minor Changes

- [#198](https://github.com/softistx/alxia/pull/198) [`b1d7af1`](https://github.com/softistx/alxia/commit/b1d7af1c466aff102d4e49fc4036ea9127c09911) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `api` and `graphql` templates take an optional `TRUSTED_PROXIES`. In `src/env.ts` (`defineEnv`) it is comma-separated CIDR ranges or addresses, each validated, listed in `.env.example`; set, `src/context.ts`'s base is built with `proxy: trustProxy({ trusted, untrusted: 'refuse' })`, so a trusted proxy's `X-Forwarded-For` sets `ctx.ip` and a forwarding header from any other connection is refused, while a request with none, a health probe's, passes. Unset, nothing changes. Each template has a `src/proxy.spec.ts` that calls `app.fetch` with a stub peer; the READMEs, the guide and the deploying recipe say how.

### Patch Changes

- [#200](https://github.com/softistx/alxia/pull/200) [`79fbd81`](https://github.com/softistx/alxia/commit/79fbd81a9e1d9e72cbd9d733085fbc8d73d3ed72) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New projects install `@alxia/core` with `app.all`, one route for every method at a path.

- [#202](https://github.com/softistx/alxia/pull/202) [`c7c994a`](https://github.com/softistx/alxia/commit/c7c994a48eeaa4b069bc81e0eeb73aa7217dd12e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `api` and `graphql` templates have a `src/env.spec.ts` that feeds `env.ts` a malformed `TRUSTED_PROXIES` and checks the error naming the entry, and the troubleshooting page has an entry for the 403 an untrusted peer gets.

## 0.3.5

### Patch Changes

- [#192](https://github.com/softistx/alxia/pull/192) [`3385725`](https://github.com/softistx/alxia/commit/33857253e8a67fc33f39884d58bdd55377ae2915) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New projects install a core whose `ctx.ip` is canonical and whose `trustProxy` has `untrusted: 'refuse-all'`; the templates are unchanged.

## 0.3.4

### Patch Changes

- [#188](https://github.com/softistx/alxia/pull/188) [`17d28fe`](https://github.com/softistx/alxia/commit/17d28fe08a73e4c549f04b98411364ff5c6715f5) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New projects install an `@alxia/core` whose guarded group refuses the 405 at its routes, so its `Allow` never tells an anonymous client what the guard keeps.

- [#190](https://github.com/softistx/alxia/pull/190) [`bc2573c`](https://github.com/softistx/alxia/commit/bc2573c7eb045fcfd954fa5457a340abefc32579) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New projects install a core that has `trustProxy` and `originalUrl`; the templates are unchanged.

## 0.3.3

### Patch Changes

- [#183](https://github.com/softistx/alxia/pull/183) [`89aa1df`](https://github.com/softistx/alxia/commit/89aa1df408840165fca6eb189aabedc3fee498ba) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New projects install a `@alxia/core` that has `app.fork()`; the templates are unchanged.

## 0.3.2

### Patch Changes

- [#166](https://github.com/softistx/alxia/pull/166) [`7cf96ea`](https://github.com/softistx/alxia/commit/7cf96ea0e9e05d0d1dad33fc315acdcf41d8f8da) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `matchesSpec` no longer fails on a route no operation declares. An app may serve routes its document does not describe (proxied, health, docs, hand-written) and still match it. It still throws on each operation with no route, which includes a route of another method or path than its operation. `strict: true` restores the exhaustive check, `exclude` and the `apiDocs()` and `health()` skips included; `matchesSpec` now returns a `MatchesSpecReport`, `{ extra: { method, path }[] }`, listing the undocumented routes without failing. The `api` template's spec test drops "and nothing else" from its title.
  
  Upgrading: to keep the old check, pass `strict: true`.

## 0.3.1

### Patch Changes

- [#165](https://github.com/softistx/alxia/pull/165) [`16c8ff2`](https://github.com/softistx/alxia/commit/16c8ff298cec31d4dded5244f6cadc234cbef30f) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The README and the guide describe the `graphql` template's per-request DataLoader: `src/loaders.ts`, `createLoaders()`, the `Context` with `loaders`, the `Note.author` resolver and `dataloader` among its dependencies.

## 0.3.0

### Minor Changes

- [#161](https://github.com/softistx/alxia/pull/161) [`4f2daa4`](https://github.com/softistx/alxia/commit/4f2daa4da46fc0f6b50bd4a984ecd6f8a496cced) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `graphql` template batches `Note.author` with a DataLoader built per request in the `context` option, so a list of notes loads its authors in one call instead of one per note. `dataloader` is a new dependency of the generated project, and its spec asserts one batch for N notes.

## 0.2.0

### Minor Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `api` template's tests call the app through a typed client: openapi-fetch over the generated `paths.ts`, with `app.fetch` as its `fetch`, so no server runs and every path, body and reply in `src/app.spec.ts` is typed by `openapi.yaml`. One test keeps `app.request`.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Two new templates, and the list is now `minimal`, `api`, `graphql`, `react-router`. `minimal` is the one to try alxia with: `src/index.ts` is `alxia().get('/', ({ reply }) => reply(200, { hello: 'world' }))`, listening only when it is the entry, with a test through `app.request`, Biome and a Dockerfile that builds and holds `dist/` alone; no OpenAPI, no generator, one dependency. It is also the prompt's default. `graphql` serves GraphQL with `@alxia/graphql` and GraphQL Yoga, schema first: `schema.graphql` is the contract, `bun run generate` writes typed `Resolvers` with GraphQL Code Generator (committed, `generate --check` first in `verify`, the generator pinned exactly and kept by `KEPT_EXACT`), an inline middleware types `viewer` in every resolver, a subscription streams over server-sent events, `PORT` is read with `defineEnv`, and the tests POST `/graphql` through `app.request`. The `api` template now reads `PORT` and `API_KEY` with `defineEnv` from `@alxia/env` (`src/env.ts`), and its `.env.example` follows. `--template` and the prompt name the four templates; `PEER_RANGES` holds `graphql` and `graphql-yoga` to `@alxia/graphql`'s ranges.

### Patch Changes

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New projects install the `@alxia/core` with problem details, the `health()` probes and the graceful shutdown of `listen`. The `api` template answers alxia's own errors as RFC 9457 problems (`alxia({ errors: "problem" })`, its `openapi.yaml` declaring the 400 as a `ValidationProblem` in `application/problem+json`); the `api` and `graphql` templates mount `health()` (`GET /health`, `GET /ready`) before their routes. The `minimal`, `api` and `graphql` templates no longer install their own `SIGINT` and `SIGTERM` handlers: `listen` drains the app and exits on them.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The templates' server prints `@alxia/core`'s route table in dev, through `listen({ onListen })`, and `listening on <url>` in production.
  
  `bun start` runs the build with `NODE_ENV=production`, in every template, so a project started outside its image is not in dev.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Every template's `dev` script sets `NODE_ENV=development` (`NODE_ENV=development bun --hot src/index.ts`, `NODE_ENV=development react-router dev`), since alxia's dev helps — the route table, a 404's hint, a 500's error page — are now on under `development` alone. The `api` template's `API_KEY` defaults to `dev-key` only when `NODE_ENV` is `development` or `test`: anywhere else it is required, and the app does not start without it, where it used to accept `dev-key` in production. The `graphql` template drops its `NODE_ENV` variable, which defaulted to `development`: GraphiQL follows `graphql()`'s default, the app's dev switch. Its `.env.example` leaves `API_KEY` and `API_DOCS` commented out, since Bun loads `.env` on `bun start` too, where they would give production the development key and a public `/docs`.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New projects install `@alxia/openapi` with `apiDocs`: the `api` template serves its API reference at `/docs`, from `openapi.yaml` imported into the bundle (`import spec from "../openapi.yaml"`), so the image, which holds `dist/` alone, needs no copy of the file. It is on in development and off elsewhere unless `API_DOCS=true`. `@alxia/openapi` moves from the template's `devDependencies` to its `dependencies`.

- [#151](https://github.com/softistx/alxia/pull/151) [`815211b`](https://github.com/softistx/alxia/commit/815211bb38525dd5d0f97265c1f1ebe14b5a3787) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The docs are organised around tasks. Each README and docs index links the new "Start in 5 minutes" and the recipes of the repository (authentication, a spec-first CRUD, a GraphQL API, file uploads, SSE and WebSockets, testing, errors, health and shutdown, caching and rate limiting, deploying), whose code is type-checked. `@alxia/core`'s README names the four templates of `bun create @alxia`. `@alxia/redis`'s roadmap gains its 0.2.0 entry and says which release removed `app.plugin(idempotency(…))`, and its troubleshooting entry for a handle that wires nothing carries `@nxgt/redis` 0.5's whole message. The tables of contents of the `@alxia/env` and `@alxia/janus` troubleshooting pages link the right headings.

## 0.1.7

### Patch Changes

- [#135](https://github.com/softistx/alxia/pull/135) [`3c00925`](https://github.com/softistx/alxia/commit/3c00925eead5f8409d23f1920ac07f92fbe72c00) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `api` template pins `@nxgt/openapi-codegen` at exactly 0.7.0, which writes alxia's own 400 body, validates `in: cookie` parameters as `cookies` and supports named server-sent events; its committed `src/generated/` is regenerated.

## 0.1.6

### Patch Changes

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New projects no longer install `@alxia/client`, which is retired: the `api` template's spec calls the app with `app.request()`. alxia is OpenAPI spec first, so a typed client is generated from the API's OpenAPI document, with a generator such as `@nxgt/openapi-codegen`.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New projects get the `@alxia/core` minor with the middleware model, and the API template is written in it: `requireKey` is a `defineMiddleware` that answers 401 before the body is read, then `validate({ body })` and `responds({ 201 })` stand among the route's middlewares, in place of a list of hooks and a schema. Its spec checks that a request without the key is refused before its body is.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `api` template mounts its routes with `base.plugin(todoRoutes)`, `@alxia/core`'s new method for plugins, and its docs say that `route(operation)` checks the handler's reply against the spec, an auth middleware's 401 being sent as it is.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `api` project is split across files: `src/context.ts` holds the base the routes read and registers it with `@alxia/core`'s `Register`, `src/routes/todos.ts` binds the operations with `defineRoutes()` and imports no app, and `src/app.ts` is `base.plugin(todoRoutes)`.

- [#134](https://github.com/softistx/alxia/pull/134) [`c503098`](https://github.com/softistx/alxia/commit/c503098a652439d816a56f2d731b61015d8237bd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `api` template is OpenAPI spec first. `openapi.yaml` describes its operations, `GET /todos`, `POST /todos` and `GET /todos/{id}`; `bun run generate` runs `@nxgt/openapi-codegen` with its `alxia` option into `src/generated/`, which is committed, so the project and its image build with no generation step; `src/routes/todos.ts` binds each route with `route(operations.createTodo, requireKey, handler)`; and `src/app.spec.ts` asserts `matchesSpec` from `@alxia/openapi`. `bun run verify` starts with `bun run generate --check`, which fails when `src/generated/` is not what `openapi.yaml` gives. New projects install `@alxia/openapi` at the version this release was published beside, and `@nxgt/openapi-codegen` pinned exactly and kept at that version, so `bun run verify` passes in a fresh project whatever a later generator release writes. Biome is pinned exactly too, moved to the newest patch of its minor.

## 0.1.5

### Patch Changes

- [#120](https://github.com/softistx/alxia/pull/120) [`78c8874`](https://github.com/softistx/alxia/commit/78c88747deef9923030b755b503afa4cecba5f4d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Both templates now ship Biome, set up: a `biome.json` of the project's own (Biome's recommended rules, two spaces and double quotes, imports sorted, Tailwind's directives read in the `react-router` project's CSS, `dist/`, `build/` and `.react-router/` skipped), `@biomejs/biome` as a devDependency pinned exactly, which the command moves to the newest patch of the same minor and keeps exact, and the scripts `lint`, `format`, `check` (`biome check --write`), `check:ci` (`biome ci`, named so since `bun ci` is Bun's install) and `verify` (`check:ci`, `typecheck`, then `test` or `build`). `.vscode/` recommends Biome's extension and formats on save. A new project passes `bun run check:ci` with no finding; the `api` template is now in that style, and Biome formatted three files of React Router's scaffold once. The name given to the command now also replaces the template's own (`my-api`, `my-app`) in the project's other files, as its README's `docker build -t` and `docker run`.

## 0.1.4

### Patch Changes

- [#117](https://github.com/softistx/alxia/pull/117) [`77d98d0`](https://github.com/softistx/alxia/commit/77d98d046e3fe7dae866ece6ccfe0c9617f4fa8c) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Every template's `Dockerfile` now runs the app on `oven/bun:1-alpine`, the build stages staying on `oven/bun:1`: each image is about 130 MB, where it was about 345 MB, and still runs as the non-root `bun` user. The `api` project's `src/server.ts` stops the app on `SIGINT` and `SIGTERM`, so `docker stop` no longer waits for its timeout. A native addon built for glibc alone does not load on Alpine: the troubleshooting page says to put the final stage back on `oven/bun:1`.

## 0.1.3

### Patch Changes

- [#115](https://github.com/softistx/alxia/pull/115) [`5da0f5e`](https://github.com/softistx/alxia/commit/5da0f5e1e5c715c12aa1d789c370b73d229b5147) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Every template's `Dockerfile` builds, and the image holds the build output alone, no `node_modules`. The `api` template's builds `dist/server.js` (now `--minify --sourcemap=linked`) and runs it; its `start` runs `bun dist/server.js` after `bun run build`, where it ran `src/server.ts`. The `react-router` template's copies `build/` alone, which `@alxia/react-router`'s plugin now bundles whole. New projects get that `@alxia/react-router`.

## 0.1.2

### Patch Changes

- [#113](https://github.com/softistx/alxia/pull/113) [`a74d045`](https://github.com/softistx/alxia/commit/a74d0455d5e8a4d97fe63d73dc45b1f763ba9a8b) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `api` template is now plain files that the command copies, as the `react-router` one is, and it gains the base files a project needs to ship: a `Dockerfile` on `oven/bun:1` that installs the production dependencies with `--frozen-lockfile` and runs `src/server.ts` as the image's non-root `bun` user, a `.dockerignore`, and a `.env.example` naming `PORT` and `API_KEY`. Its `start` script now runs `bun src/server.ts`, since Bun runs the TypeScript as it is; `bun run build` still bundles `dist/server.js` for a host with no `node_modules`. Its README has a section each for developing, testing, building and Docker.

## 0.1.1

### Patch Changes

- [#112](https://github.com/softistx/alxia/pull/112) [`c808d83`](https://github.com/softistx/alxia/commit/c808d836381bbcfb6a05b921483bfb088a1eb909) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `react-router` template's `Dockerfile` now builds and runs the app on Bun, in place of React Router's Node one: multi-stage on `oven/bun:1`, the production dependencies in a stage of their own, `bun run build`, then `bun build/server/index.js` as the image's non-root `bun` user. `docker build` works in a new project as it is written. The project's `README.md` gives Bun's commands where React Router's wrote npm's: `bun install`, `bun dev`, `bun run build`, and `bun.lock` among the files to deploy.

- [#110](https://github.com/softistx/alxia/pull/110) [`f918ed0`](https://github.com/softistx/alxia/commit/f918ed0ded1866d2ba7a914e82c20b0e7a2995b8) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `react-router` template is now plain files that the command copies: React Router's official template, as `create-react-router` wrote it, shipped in the package with alxia's layer. `create-react-router` no longer runs, and the "is not what this @alxia/create expects" refusals are gone. alxia's own packages now resolve at creation like every other dependency, to the newest within the ranges this release was published with. Right after a release, when the registry does not serve that exact version yet, the newest release of the same minor is written instead, so `bun install` no longer fails with `No version matching "^0.3.1"`.

## 0.1.0

### Minor Changes

- [#108](https://github.com/softistx/alxia/pull/108) [`7a3ca53`](https://github.com/softistx/alxia/commit/7a3ca53fb7369ba2f1c87aa3633a39f61c30457a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A new package, `@alxia/create`: `bun create @alxia [dir] [--template api|react-router]` writes a new alxia app — an API with Zod, a route hook, a spec and the typed client, or React Router's official template with `@alxia/react-router` added — with its dependencies at the newest versions alxia's peers accept.
