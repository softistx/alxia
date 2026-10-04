# @alxia/create

Start an [alxia](https://github.com/softistx/alxia) app in one command: an
API with Zod, written OpenAPI spec first, or React Router's official
template served by alxia.

```sh
bun create @alxia my-app
```

`bun create @alxia` runs this package's bin, as `bun create <name>` runs
`create-<name>` and `bun create @scope` runs `@scope/create`. It asks for
what it is not given, writes the project, installs it and prints the next
steps:

```sh
cd my-app
bun dev
```

It needs Bun 1.4.2 or later, which the projects it writes run on.

## Templates

```sh
bun create @alxia my-api --template api
bun create @alxia my-site --template react-router
```

| template | what it writes |
| --- | --- |
| `api` | an `@alxia/core` app with Zod, OpenAPI spec first: `openapi.yaml` declares `GET /todos`, `POST /todos` and `GET /todos/{id}`; `bun run generate` writes `src/generated/` from it with [`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen) (`openapi-codegen.config.ts`), committed, so nothing is generated at install or build; `src/app.ts` binds each operation with `route(operation, …middlewares, handler)`, as `route(operations.createTodo, requireKey, handler)`, where `requireKey`, made with `defineMiddleware`, answers 401 without an API key, and the operation's schemas validate the request and check every reply; a `bun test` spec calling the app with `app.request()` and asserting `matchesSpec` from [`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi): every operation has its route, and no route is outside the spec; `bun dev` restarting on change, `typecheck`, `build`, a strict `tsconfig.json`, Biome (`biome.json`, `lint`, `format`, `check`, `check:ci`), `verify`, starting with `generate --check`, a `Dockerfile` running on `oven/bun:1-alpine`, `.dockerignore`, `.gitignore`, `.env.example`, `.vscode/` and a README. `@alxia/openapi` and `@nxgt/openapi-codegen` are devDependencies |
| `react-router` | React Router's official template, as `create-react-router` writes it, shipped in this package and copied, with [`@alxia/react-router`](https://www.npmjs.com/package/@alxia/react-router) added as its README says: `alxia()` in `vite.config.ts`'s plugins, `start` running `bun build/server/index.js`, a `bunfig.toml` starting React Router's CLI on Bun, a `Dockerfile` running on `oven/bun:1-alpine` in place of React Router's Node one, and Biome as the `api` project has it, the scaffold formatted by it once. No server file: the default one serves the pages; `bunx alxia-react-router reveal` writes it out to customise |

The heart of the `api` project, its middleware and a route bound to an
operation of `openapi.yaml` (the whole file, and how to add an operation,
are in the [guide](https://github.com/softistx/alxia/blob/develop/packages/create/docs/guide.md#the-api-template)):

```ts
// src/app.ts, in part
import { alxia, defineMiddleware } from "@alxia/core";
import { operations } from "./generated/alxia";

const requireKey = defineMiddleware(({ request, reply }, next) =>
  request.headers.get("x-api-key") === apiKey
    ? next()
    : reply(401, { error: "unauthorized" as const }),
);

export const app = alxia()
  .decorate({ todos })
  .route(operations.createTodo, requireKey, ({ body, todos, reply }) => {
    const todo = { id: todos.length + 1, title: body.title, done: false };
    todos.push(todo);
    return reply.created(todo);
  });
```

`operations.createTodo` is `POST /todos` as `openapi.yaml` declares it:
the body is validated just before the handler, which reads it typed, and
every reply, `requireKey`'s 401 included, is checked against the spec's
responses. To change the API, edit `openapi.yaml` and run
`bun run generate`; never edit `src/generated/`.

## Lint and format

Both projects ship [Biome](https://biomejs.dev), set up the same way: a
`biome.json` of their own with Biome's recommended rules, spaces and
double quotes, imports sorted, the build output and `.react-router/`
skipped; `@biomejs/biome` pinned exactly, as Biome asks; and
`.vscode/` recommending its extension, formatting on save. A new project
passes `bun run check:ci` with no finding.

| script | runs |
| --- | --- |
| `bun run check` | `biome check --write`: lint, format and sort imports, fixing what it can |
| `bun run lint` | `biome lint` |
| `bun run format` | `biome format --write` |
| `bun run check:ci` | `biome ci`: what CI runs, read-only |
| `bun run verify` | `api`: `generate --check`, `check:ci`, `typecheck`, then `test`; `react-router`: `check:ci`, `typecheck`, then `build` |
| `bun run generate` | `api` only: `nxgt-openapi generate`, `src/generated/` from `openapi.yaml`; with `--check`, writes nothing and exits 1 when a file is stale |

```sh
cd my-api
bun run verify
```

`check:ci` and not `ci`, since `bun ci` is Bun's frozen-lockfile install,
which a script named `ci` would not replace. The
[guide](https://github.com/softistx/alxia/blob/develop/packages/create/docs/guide.md#lint-and-format)
has the settings and why.

## Docker

Both projects build into an image as they are written: built on
`oven/bun:1`, run on `oven/bun:1-alpine` as the non-root `bun` user, an
image of about 130 MB. Each `Dockerfile`
builds in a stage of its own, and the image holds the build output alone,
no `node_modules`:

- `api`: `bun run build` bundles `src/server.ts` and its dependencies into
  `dist/server.js`, `src/generated/` included as it is committed, so the
  build generates nothing; the image holds `dist/` and runs `bun --no-install dist/server.js`.
- `react-router`: `bun run build`, every dependency bundled into
  `build/server/index.js` by `@alxia/react-router`'s plugin; the image
  holds `build/` and runs `bun --no-install build/server/index.js`.

```sh
cd my-api
docker build -t my-api .
docker run -p 3000:3000 -e API_KEY=change-me my-api
```

```sh
cd my-site
docker build -t my-site .
docker run -p 3000:3000 my-site
```

Commit the `bun.lock` that `bun install` wrote: the image installs from it
with `--frozen-lockfile`. The
[guide](https://github.com/softistx/alxia/blob/develop/packages/create/docs/guide.md#docker)
has the stages, and
[troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/create/docs/troubleshooting.md#error-cannot-find-package--from-appdistserverjs)
what to do for a dependency that cannot be bundled, and for a
[native addon built for glibc alone](https://github.com/softistx/alxia/blob/develop/packages/create/docs/troubleshooting.md#error--is-linked-against-glibc-dt_needed-libmso6-but-this-bun-build-uses-musl),
which does not load on Alpine.

## Options

| option | |
| --- | --- |
| `[dir]` | where to write the project: a directory that is empty or does not exist yet. Asked when not given |
| `--template <name>`, `-t` | `api` or `react-router`. Asked when not given |
| `--no-install` | write the files, skip `bun install` |
| `--help`, `-h` | the usage |

Given both `dir` and `--template`, it asks nothing, so it runs in a script
or CI.

## Versions

- **alxia's packages** — `@alxia/core`, `@alxia/openapi` (`api`) and
  `@alxia/react-router` (`react-router`) — are moved to the newest version on the registry
  within the ranges this release of `@alxia/create` was published with:
  `^0.3.1` writes `^0.3.4` once 0.3.4 is out, never `^0.4.0`. Just after a
  release, while the registry does not serve that version yet, the newest of
  the same minor is written (`^0.3.0`, which takes 0.3.1 once it arrives),
  and the output says so. `bunx @alxia/create@<version>` picks an older set.
- **Everything else** — Zod, TypeScript, Vite, React, React Router, Tailwind
  — is moved to the newest version on the registry when the project is
  written, within the range alxia's packages accept: TypeScript within
  `^6.0.3 || ^7.0.0`, Vite within `^7.0.0 || ^8.0.0`, React Router and its
  packages within `^8.0.0`, Zod within `^4.2.0`; what no alxia package
  constrains goes to npm's `latest`. A newer major outside alxia's range is
  left out, and the output says so.
- **Biome and `@nxgt/openapi-codegen`** are pinned exactly, and written
  exactly: the newest patch of the template's minor, `2.5.15` writing
  `2.5.16` but never `2.6.0`, whose new rules the template was not checked
  against, and `0.6.0` writing `0.6.1` once it is out, never `0.7.0`, which may write
  `src/generated/` differently.

The registry is the one `BUN_CONFIG_REGISTRY` or `npm_config_registry`
names, else npmjs.org; when it does not answer, the template's own
versions stay, with a warning.

## Other package managers

```sh
bunx @alxia/create my-app --template api
npm create @alxia my-app -- --template api
```

The bin runs on Bun (`#!/usr/bin/env bun`) whichever runner starts it, and
the project it writes installs with `bun install`.

## API

| export | |
| --- | --- |
| `create-alxia` | the bin `bun create @alxia`, `bunx @alxia/create` and `npm create @alxia` run. The package exports no module |

## Documentation

- [Guide](https://github.com/softistx/alxia/blob/develop/packages/create/docs/guide.md): each template file by file, adding an operation to the `api` project, what the `react-router` template adds to React Router's, Biome's settings, each `Dockerfile`, how versions are chosen, and running it in CI.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/create/docs/troubleshooting.md): each message the command prints, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/create/docs/roadmap.md): what is coming, and what is not planned.
