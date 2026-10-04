# Roadmap

What `@alxia/create` gives a new app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/create/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **Running `create-react-router` at creation.** The template is its
  output, committed and copied: a new project needs nothing but the
  registry, and no change upstream can stop the command. It is generated
  again from the scaffold when React Router ships a new major.
- **A runtime dependency.** The prompts are Bun's `prompt()`, the registry
  is read with `fetch`, versions are compared with `Bun.semver`.

## Shipped

### Next release

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
- **No client package in a new project.** The `api` template's spec calls
  the app with `app.request()`, and the project installs `@alxia/core`
  alone of alxia's packages. alxia is OpenAPI spec first: a typed client
  is generated from the API's OpenAPI document, with a generator such as
  `@nxgt/openapi-codegen`.

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
