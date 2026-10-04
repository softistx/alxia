# @alxia/create

## 0.1.1

### Patch Changes

- [#112](https://github.com/softistx/alxia/pull/112) [`c808d83`](https://github.com/softistx/alxia/commit/c808d836381bbcfb6a05b921483bfb088a1eb909) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `react-router` template's `Dockerfile` now builds and runs the app on Bun, in place of React Router's Node one: multi-stage on `oven/bun:1`, the production dependencies in a stage of their own, `bun run build`, then `bun build/server/index.js` as the image's non-root `bun` user. `docker build` works in a new project as it is written. The project's `README.md` gives Bun's commands where React Router's wrote npm's: `bun install`, `bun dev`, `bun run build`, and `bun.lock` among the files to deploy.

- [#110](https://github.com/softistx/alxia/pull/110) [`f918ed0`](https://github.com/softistx/alxia/commit/f918ed0ded1866d2ba7a914e82c20b0e7a2995b8) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `react-router` template is now plain files that the command copies: React Router's official template, as `create-react-router` wrote it, shipped in the package with alxia's layer. `create-react-router` no longer runs, and the "is not what this @alxia/create expects" refusals are gone. alxia's own packages now resolve at creation like every other dependency, to the newest within the ranges this release was published with. Right after a release, when the registry does not serve that exact version yet, the newest release of the same minor is written instead, so `bun install` no longer fails with `No version matching "^0.3.1"`.

## 0.1.0

### Minor Changes

- [#108](https://github.com/softistx/alxia/pull/108) [`7a3ca53`](https://github.com/softistx/alxia/commit/7a3ca53fb7369ba2f1c87aa3633a39f61c30457a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A new package, `@alxia/create`: `bun create @alxia [dir] [--template api|react-router]` writes a new alxia app — an API with Zod, a route hook, a spec and the typed client, or React Router's official template with `@alxia/react-router` added — with its dependencies at the newest versions alxia's peers accept.
