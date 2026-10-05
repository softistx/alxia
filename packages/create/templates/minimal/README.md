# A minimal alxia app

An [alxia](https://github.com/softistx/alxia) app in one route, made with
`bun create @alxia`: the quickest way to see alxia run. Nothing else is set
up: no OpenAPI, no code generation, no validator.

```ts
// src/index.ts
export const app = alxia().get("/", ({ reply }) =>
  reply(200, { hello: "world" }),
);
```

```sh
bun dev                    # http://localhost:3000, reloaded on every change
curl localhost:3000        # {"hello":"world"}
```

- `src/index.ts`: the app, and `app.listen()` on `PORT` (3000 by default)
  when the file is run, not when a test imports it.
- `src/index.spec.ts`: `app.request()`, no port: the request goes through
  the app and the response comes back.
- `biome.json`: Biome's lint and format settings ([Lint and format](#lint-and-format)).

## Where next

- Add a route: `.get("/users/:id", ({ params, reply }) => …)` after the
  first. Order is meaning: a middleware given to `use` applies to the routes
  after it.
- Validate a body with `validate` and Zod (`bun add zod`), see
  [Routes and validation](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/routes.md).
- Describe the API first, with an OpenAPI document and the operations
  generated from it: `bun create @alxia my-service --template api`.
- Serve GraphQL: `bun create @alxia my-service --template graphql`.

## Test

```sh
bun test           # src/index.spec.ts: in process, no port
bun run typecheck
```

## Lint and format

[Biome](https://biomejs.dev) lints and formats the project, as `biome.json`
sets it: Biome's recommended rules, spaces, double quotes, imports
sorted. What the build writes, `dist/`, is skipped.

```sh
bun run check      # lint, format and sort imports, fixing what it can
bun run lint       # lint only
bun run format     # format only, in place
bun run check:ci   # what CI runs: changes nothing, fails on an error
bun run verify     # check:ci, typecheck, then test
```

`bun run check:ci`, not `bun ci`: `bun ci` is Bun's frozen-lockfile
install. In VS Code, `.vscode/` recommends Biome's extension and formats
on save with it.

`@biomejs/biome` is pinned exactly, since a release of Biome may format
differently. To move it:

```sh
bun add --dev --exact @biomejs/biome@latest
bunx biome migrate --write
```

## Build

`bun run build` bundles the server and its dependencies into one file,
`dist/index.js`, minified, with its source map beside it, and `bun start`
runs it: what production and the image run.

```sh
bun run build    # dist/index.js and dist/index.js.map
bun start        # bun dist/index.js
```

`bun start` before any build fails with `Module not found
"dist/index.js"`: build first. `dist/` needs Bun and nothing else, no
`node_modules`. A dependency that cannot be bundled, a native addon, is
left out with `--external <name>` in the `build` script, and must then be
installed beside `dist/`.

## Docker

The `Dockerfile` builds in a stage of its own, on `oven/bun:1`, and runs
on `oven/bun:1-alpine`. The build stage installs every dependency with
`--frozen-lockfile`, from the `bun.lock` that `bun install` wrote (commit
it), and runs `bun run build`. The image holds `dist/` alone, no
`node_modules` and no `src/`, and runs `bun --no-install dist/index.js` as
its non-root `bun` user. `src/index.ts` stops the app on `SIGTERM`, so
`docker stop` is immediate.

```sh
docker build -t my-app .
docker run --rm -p 3000:3000 my-app
```

Next: [Getting started](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/getting-started.md)
and the rest of [`@alxia/core`'s guide](https://github.com/softistx/alxia/tree/develop/packages/core/docs).
