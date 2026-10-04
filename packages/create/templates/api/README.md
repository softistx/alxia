# An alxia API

An [alxia](https://github.com/softistx/alxia) app with
[Zod](https://zod.dev), made with `bun create @alxia`. It is OpenAPI spec
first: `openapi.yaml` is the contract, the routes are bound to the
operations generated from it, and a client is generated from the same file.

- `openapi.yaml`: the API's operations, `GET /todos`, `POST /todos` and
  `GET /todos/{id}`, their bodies, parameters and replies.
- `src/generated/`: what `bun run generate` writes from it, with
  [`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen)
  (`openapi-codegen.config.ts`). `alxia.ts` holds each operation as the
  data `app.route()` takes. Never edit it: change `openapi.yaml`, then
  generate.
- `src/context.ts`: the base, what every route reads (the todos), and
  its `Register` declaration: a route file reads that context with no
  import of the app. Register the base, never the app, which mounts the
  route files and would be typed by itself.
- `src/routes/todos.ts`: the routes, `defineRoutes()`, each bound to an
  operation. `route(operations.createTodo, requireKey, handler)` runs its
  middlewares in order: `requireKey`, made with `defineMiddleware`,
  answers 401 without the `x-api-key` header; the operation's body is
  validated just before the handler, and every reply checked against the
  operation's responses.
- `src/app.ts`: the app, `base.use(todoRoutes)`. Mounting the routes on
  an app that does not give the base's context is a compile error.
- `src/server.ts`: listens on `PORT`, 3000 by default.
- `src/app.spec.ts`: `app.request()`, no port, and `matchesSpec` from
  [`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi): every
  operation of `openapi.yaml` has its route, and no route is outside it.
- `biome.json`: Biome's lint and format settings ([Lint and format](#lint-and-format)).

## The contract first

A new route starts in `openapi.yaml`:

1. Add the operation, with an `operationId`: `deleteTodo`, say.
2. `bun run generate`: `src/generated/alxia.ts` now exports
   `operations.deleteTodo`.
3. Bind it in `src/routes/todos.ts`, with the middlewares it needs:
   `.route(operations.deleteTodo, requireKey, ({ params, reply }) => …)`.
   The handler's `params`, `body` and `reply` are typed by the spec.
4. `bun test`: `matchesSpec` fails while an operation has no route.

`src/generated/` is committed, so the project builds with no generation
step, in Docker too. `bun run verify` runs `bun run generate --check`
first: it fails when `src/generated/` is not what `openapi.yaml` gives.
`@nxgt/openapi-codegen` is pinned exactly, since another release may
write the files differently: after moving it, run `bun run generate`.

A client in another project is generated from the same `openapi.yaml`,
with the generator of its choice: `@nxgt/openapi-codegen` writes types,
Zod validators and the operations a typed client reads.

## Environment

Bun loads `.env` on every command. Copy `.env.example` to `.env` to set
`PORT` and `API_KEY`. Outside development, set `API_KEY`: its default,
`dev-key`, is for development only.

```sh
cp .env.example .env
```

## Develop

```sh
bun dev          # http://localhost:3000, restarted on every change
```

```sh
curl -X POST localhost:3000/todos \
  -H 'content-type: application/json' -H 'x-api-key: dev-key' \
  -d '{"title":"Write a route"}'
```

## Test

```sh
bun test         # src/app.spec.ts: in process, no port
bun run typecheck
bun run generate # src/generated/, from openapi.yaml
```

## Lint and format

[Biome](https://biomejs.dev) lints and formats the project, as `biome.json`
sets it: Biome's recommended rules, spaces, double quotes, imports
sorted. What the build writes, `dist/`, is skipped, and so is what
`bun run generate` writes, `src/generated/`.

```sh
bun run check      # lint, format and sort imports, fixing what it can
bun run lint       # lint only
bun run format     # format only, in place
bun run check:ci   # what CI runs: changes nothing, fails on an error
bun run verify     # generate --check, check:ci, typecheck, then test
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
`dist/server.js`, minified, with its source map beside it, and `bun start`
runs it: what production and the image run.

```sh
bun run build    # dist/server.js and dist/server.js.map
bun start        # bun dist/server.js
```

`bun start` before any build fails with `Module not found
"dist/server.js"`: build first. `dist/` needs Bun and nothing else, no
`node_modules`. Bun reads the
source map, so a stack trace names the lines of `src/`. `bun dev` and
`bun test` run the TypeScript as it is, with no build.

A dependency that cannot be bundled, a native addon, is left out with
`--external <name>` in the `build` script, and must then be installed
beside `dist/`.

## Docker

The `Dockerfile` builds in a stage of its own, on `oven/bun:1`, and runs
on `oven/bun:1-alpine`. The build stage
installs every dependency with `--frozen-lockfile`, from the `bun.lock`
that `bun install` wrote (commit it), and runs `bun run build`. The image
holds `dist/` alone, no `node_modules` and no `src/`, and runs
`bun --no-install dist/server.js` as its non-root `bun` user: a package
missing from the bundle fails at startup instead of being fetched from
npm. `src/server.ts` stops the app on `SIGTERM`, so `docker stop` is
immediate. A native addon built for glibc alone does not load on
Alpine: put the final stage back on `oven/bun:1`.

```sh
docker build -t my-api .
docker run --rm -p 3000:3000 -e API_KEY=change-me my-api
```

Next: [Getting started](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/getting-started.md)
and the rest of [`@alxia/core`'s guide](https://github.com/softistx/alxia/tree/develop/packages/core/docs).
