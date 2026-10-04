# @alxia/create

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
