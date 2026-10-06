# Roadmap

What `@alxia/create` gives a new app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/create/CHANGELOG.md).

## Now

- **Two templates: `minimal` and `graphql`.** `minimal` is one file, one
  dependency and a test, the template to try alxia with, and what the
  prompt offers first. `graphql` is a GraphQL Yoga API served by
  `@alxia/graphql`, schema first: `schema.graphql` is the contract, GraphQL
  Code Generator types the resolvers (committed, checked by
  `generate --check`), `viewer` is typed in every resolver, and
  `noteAdded` is a subscription over server-sent events.
- **The `api` template reads its environment with `defineEnv`.**
  `src/env.ts`, from `@alxia/env`, checks `PORT` and `API_KEY` (a secret)
  once, before the server listens; `src/context.ts` no longer exports
  `apiKey`.
- **The `api` project split across files.** `src/context.ts` holds the
  base the routes read and registers it with `@alxia/core`'s `Register`;
  `src/routes/todos.ts` binds the operations with `defineRoutes()`,
  reading that context with no import of the app; `src/app.ts` mounts
  them, `base.plugin(todoRoutes)`.
- **Production-safe defaults.** Every `dev` script sets
  `NODE_ENV=development`, the only mode alxia's dev helps run in; the
  `api` project's `API_KEY` is required outside development and test; the
  `api` and `graphql` projects mount `health()`, the `api` project answers
  alxia's own errors as problems and serves `/docs` from the bundled
  `openapi.yaml`; no template installs signal handlers of its own, as
  `listen` drains and exits on `SIGINT` and `SIGTERM`.
- **The `api` template's tests use a typed client.** `src/app.spec.ts` calls
  the app through openapi-fetch over the generated `paths.ts`, with
  `app.fetch` as its `fetch`: in process, typed by `openapi.yaml`.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **Running `create-react-router` at creation.** The template is its
  output, committed and copied: a new project needs nothing but the
  registry, and no change upstream can stop the command. It is generated
  again from the scaffold when React Router ships a new major.
- **Generating the `api` project's code at install or build.**
  `src/generated/` is committed: `bun install` runs no script, the
  `Dockerfile` needs no generation step, a clone builds offline, and a
  review shows what a change to `openapi.yaml` changed in the code.
  `bun run verify`'s `generate --check` keeps the files equal to the spec.
- **Generating the OpenAPI document from the app.** The document is
  written first and the routes are bound to it; a spec read back from the
  code would describe whatever the code does.
- **A runtime dependency.** The prompts are Bun's `prompt()`, the registry
  is read with `fetch`, versions are compared with `Bun.semver`.
- **A code-first GraphQL template (Pothos, Nexus).** The `graphql`
  template is schema first, as the `api` one is spec first: the schema file
  is the contract, and the resolvers are typed from it.

## Shipped

### 0.4.1

- **`graphqlClient` in the `graphql` template.** Its spec calls the app through `graphqlClient` from `@alxia/graphql/testing`, in place of a helper of its own.

### 0.4.0

- **`TRUSTED_PROXIES` in the `api` and `graphql` templates.** Optional and
  unset by default, so a new project behaves as before; set to the load
  balancer's CIDR ranges, the base declares `trustProxy({ trusted,
  untrusted: 'refuse' })`: `ctx.ip` from a trusted proxy's
  `X-Forwarded-For`, a forwarding header from any other connection refused,
  health probes passing. Each template tests it with a peer.
- **A core with `app.all`.** New projects install `@alxia/core` 0.11, which
  declares one route for every method at a path.

### 0.1.6

- **The `api` project is OpenAPI spec first.** `openapi.yaml` declares
  its operations; `bun run generate` writes `src/generated/` from it with
  `@nxgt/openapi-codegen`, committed, so the project and its image build
  with no generation step and offline; `src/app.ts` binds each operation
  with `route(operations.createTodo, requireKey, handler)`, which
  validates the request and checks the handler's reply against the spec; the
  spec asserts `matchesSpec` from `@alxia/openapi`, so no operation lacks
  a route; and `bun run verify` starts with `generate --check`, which
  fails when `src/generated/` drifts from `openapi.yaml`. New projects
  install `@alxia/openapi` at the version this release was published
  beside, and `@nxgt/openapi-codegen` pinned exactly, at the version the template ships.
- **The `api` project is written in `@alxia/core`'s middleware model.**
  `requireKey` is a `defineMiddleware` that answers 401 before the body
  is read, given to the route among its middlewares.
- **No client package in a new project.** The `api` template's spec calls
  the app with `app.request()`; a typed client is generated from
  `openapi.yaml`, with a generator such as `@nxgt/openapi-codegen`.

### 0.1.5

- **Both projects lint and format with Biome.** Each has a `biome.json`
  of its own (recommended rules, spaces and double quotes, imports
  sorted, the build output skipped), `@biomejs/biome` pinned exactly,
  the scripts `lint`, `format`, `check`, `check:ci` and `verify`, and
  `.vscode/` recommending Biome's extension. A new project passes
  `bun run check:ci` with no finding.
- **The project's name in its README.** The name given to the command,
  normalised, replaces the template's own, as a whole word, in every text
  file, as the README's
  `docker build -t` and `docker run`.

### 0.1.4

- **The images run on Alpine.** Every `Dockerfile`'s final stage is
  `oven/bun:1-alpine`, the build stages staying on `oven/bun:1`: each
  image is about 130 MB, where it was about 345 MB. The `api` project
  stops on `SIGTERM`, so `docker stop` no longer waits.

### 0.1.3

- **Every `Dockerfile` builds, and the image holds the build alone.** The
  `api` template's builds `dist/server.js`, bundled, minified and source
  mapped, and runs it with no `node_modules` and no `src/`; `start` runs
  `dist/server.js` after `bun run build`. The `react-router` template's
  copies `build/` alone, which `@alxia/react-router`'s plugin now bundles
  whole. Each image is about 50 MB (api) and 150 MB (react-router)
  smaller.

### 0.1.2

- **The `api` template is files, copied, with a `Dockerfile`.** It ships
  under `templates/api/` and is copied as `react-router`'s is. New in it:
  a `Dockerfile` on `oven/bun:1`, `.dockerignore` and `.env.example`.

### 0.1.1

- **The `react-router` template's `Dockerfile` runs on Bun.** It replaces
  React Router's Node one: multi-stage on `oven/bun:1`, the production
  dependencies apart, `bun run build`, then `bun build/server/index.js` as
  the image's non-root `bun` user. `docker build` works in a new project
  as it is.
- **The `react-router` project's README runs Bun.** React Router's own
  README, with `bun install`, `bun dev` and `bun run build` where it wrote
  npm's commands.
- **The `react-router` template is files, copied.** React Router's official
  template ships inside `@alxia/create`, with alxia's layer, and is copied
  as it is: no `create-react-router` runs, and no change in it can make the
  command refuse.
- **alxia's packages resolve at creation too.** `@alxia/core`
  and `@alxia/react-router` move to the newest version
  within the ranges `@alxia/create` was published with. Right after a
  release, while the registry does not serve that version yet, the newest
  of the same minor is written, so `bun install` no longer fails with
  `No version matching "^0.3.1"`.

### 0.1.0

- `bun create @alxia [dir] [--template api|react-router] [--no-install]`,
  asking for what is not given; the `api` and `react-router` templates;
  dependencies at the newest versions alxia's peer ranges accept.
