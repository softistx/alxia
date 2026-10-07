# @alxia/create

Start an [alxia](https://github.com/softistx/alxia) app in one command: a
minimal one to try alxia with, an API with Zod written OpenAPI spec first, a
GraphQL API written schema first, or React Router's official template
served by alxia.

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
bun create @alxia my-app --template minimal      # the template to try alxia with
bun create @alxia my-api --template api
bun create @alxia my-graph --template graphql
bun create @alxia my-site --template react-router
```

`minimal` is the one to start with: one file, one dependency, a test, and
`bun dev` answering in 30 seconds.

| template | what it writes |
| --- | --- |
| `minimal` | the smallest alxia app: `src/index.ts` exports `app = alxia().get("/", …)` and listens on `PORT` only when it is the entry file, `src/index.spec.ts` calls it with `app.request()`; `bun dev` (`NODE_ENV=development bun --hot`), `build`, `start`, `typecheck`, a strict `tsconfig.json`, Biome and `verify` (`check:ci`, `typecheck`, then `test`), a `Dockerfile` running on `oven/bun:1-alpine`, `.dockerignore`, `.gitignore`, `.vscode/` and a README. One dependency, `@alxia/core`: no OpenAPI, no code generation, no validator, no env file |
| `api` | an `@alxia/core` app with Zod, OpenAPI spec first: `openapi.yaml` declares `GET /todos`, `POST /todos` and `GET /todos/{id}`; `bun run generate` writes `src/generated/` from it with [`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen) (`openapi-codegen.config.ts`), committed, so nothing is generated at install or build; `src/env.ts` reads `PORT`, `API_KEY`, `API_DOCS` and an optional `TRUSTED_PROXIES` (CIDR ranges, which adds `trustProxy({ trusted, untrusted: "refuse" })` to the base when set: `ctx.ip` from a trusted proxy's `X-Forwarded-For`, a forwarding header from any other connection refused, health probes untouched) with `defineEnv` from [`@alxia/env`](https://www.npmjs.com/package/@alxia/env), `API_KEY` a secret defaulting to `dev-key` under `NODE_ENV` `development` and `test` alone, required anywhere else; `src/context.ts` holds the base the routes read, `alxia({ errors: "problem" })` so alxia's own errors are RFC 9457 problems as `openapi.yaml` declares them, and registers it with `@alxia/core`'s `Register`; `src/routes/todos.ts`, made with `defineRoutes()`, reads that context with no import of the app and binds each operation with `route(operation, …middlewares, handler)`, as `route(operations.createTodo, requireKey, handler)`, where `requireKey`, made with `defineMiddleware`, answers 401 without an API key, and the operation's schemas validate the request and check the handler's reply; `src/app.ts` mounts `health()` (`GET /health`, `GET /ready`), `apiDocs` from `@alxia/openapi` (the API reference at `/docs`, from `openapi.yaml` imported into the bundle; on in development, else with `API_DOCS=true`) and the routes on the base; a `bun test` spec, `src/proxy.spec.ts`, building the base behind `TRUSTED_PROXIES` and calling `app.fetch` with a peer, `src/env.spec.ts`, checking that a malformed `TRUSTED_PROXIES` stops the app, and a `bun test` spec calling the app through the typed [`@nxgt/openapi-httpyz`](https://www.npmjs.com/package/@nxgt/openapi-httpyz) client over the generated `operations.ts`, its `fetch` being `app.fetch` (in process, no server; replies narrowed on their status), keeping one `app.request()` test, and asserting `matchesSpec` from [`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi): every operation has its route, and `strict: true` also fails on a route outside the spec; `bun dev` (`NODE_ENV=development`) restarting on change, `typecheck`, `build`, a strict `tsconfig.json`, Biome (`biome.json`, `lint`, `format`, `check`, `check:ci`), `verify`, starting with `generate --check`, a `Dockerfile` running on `oven/bun:1-alpine`, `.dockerignore`, `.gitignore`, `.env.example`, `.vscode/` and a README. `@alxia/openapi` is a dependency; `@nxgt/httpyz`, `@nxgt/openapi-httpyz` and `@nxgt/openapi-codegen` are devDependencies |
| `graphql` | a GraphQL API with [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) through [`@alxia/graphql`](https://www.npmjs.com/package/@alxia/graphql), schema first: `schema.graphql` is the contract (`Query`, `Mutation`, `Subscription`); `bun run generate` writes `src/generated/resolvers.ts` from it with [GraphQL Code Generator](https://the-guild.dev/graphql/codegen) (`codegen.ts`), committed, typing `Resolvers` with the app's context; `src/context.ts` holds the base and `viewerOf`, a middleware reading `Authorization: Bearer <token>` so every resolver reads a typed `viewer`; `src/loaders.ts`, `createLoaders()`, the [DataLoader](https://github.com/graphql/dataloader)s of one request, built per request by the `context` option of `graphql()` in `src/app.ts` so `Note.author` loads the authors of a list of notes in one batch (`findUsers`) instead of one call per note; `src/resolvers.ts`; `src/schema.ts` and `src/app.ts` mounting `health()` and `graphql(app, { schema, context })`, GraphiQL on in dev alone; `src/env.ts` (`PORT` and the optional `TRUSTED_PROXIES`, as `api`) with `defineEnv`; `src/store.ts`, in memory, with the pub/sub of the `noteAdded` subscription (server-sent events); a `bun test` spec posting to `/graphql` through `app.request()`, `src/proxy.spec.ts`, the base behind `TRUSTED_PROXIES`, and `src/env.spec.ts`, a malformed one refused; the same scripts, `Dockerfile`, Biome and `.vscode/` as `api`, `verify` starting with `generate --check`, and a `.env.example`. `@alxia/graphql`, `@alxia/env`, `dataloader`, `graphql` and `graphql-yoga` are dependencies; the code generator is a devDependency |
| `react-router` | React Router's official template, as `create-react-router` writes it, shipped in this package and copied, with [`@alxia/react-router`](https://www.npmjs.com/package/@alxia/react-router) added as its README says: `alxia()` in `vite.config.ts`'s plugins, `dev` under `NODE_ENV=development`, `start` running `NODE_ENV=production bun build/server/index.js`, a `bunfig.toml` starting React Router's CLI on Bun, a `Dockerfile` running on `oven/bun:1-alpine` in place of React Router's Node one, and Biome as the `api` project has it, the scaffold formatted by it once. No server file: the default one serves the pages; `bunx alxia-react-router reveal` writes it out to customise |

The heart of the `api` project, its middleware and a route bound to an
operation of `openapi.yaml` (the whole file, and how to add an operation,
are in the [guide](https://github.com/softistx/alxia/blob/develop/packages/create/docs/guide.md#the-api-template)):

```ts
// src/context.ts, in part: the base, registered
export const base = alxia().decorate({ todos });

declare module "@alxia/core" {
  interface Register {
    context: typeof base;
  }
}

// src/routes/todos.ts, in part: no import of the app
const requireKey = defineMiddleware(({ request, reply }, next) =>
  request.headers.get("x-api-key") === env.API_KEY
    ? next()
    : reply(401, { error: "unauthorized" as const }),
);

export const todoRoutes = defineRoutes()
  .route(operations.createTodo, requireKey, ({ body, todos, reply }) => {
    const todo = { id: todos.length + 1, title: body.title, done: false };
    todos.push(todo);
    return reply.created(todo);
  });

// src/app.ts
export const app = base.plugin(todoRoutes);
```

`operations.createTodo` is `POST /todos` as `openapi.yaml` declares it:
the body is validated just before the handler, which reads it typed, and
the handler's reply is checked against the spec's responses; `requireKey`'s
401 is its own, sent as it is. To change the API, edit `openapi.yaml` and run
`bun run generate`; never edit `src/generated/`.

The `graphql` project's heart, a schema and a resolver reading the typed
`viewer` (the walk-through, with subscriptions and how to add a field, is in the
[guide](https://github.com/softistx/alxia/blob/develop/packages/create/docs/guide.md#the-graphql-template)):

```ts
// schema.graphql, in part
//   type Mutation { addNote(text: String!): Note! }

// src/context.ts, in part: a middleware, then the resolvers' context
const viewerOf = defineMiddleware(({ request }, next) => {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const id = token === undefined ? undefined : db.tokens.get(token);
  return next({ viewer: (id === undefined ? undefined : db.users.get(id)) ?? null });
});
export const base = alxia().decorate({ env, db }).use(viewerOf);
export type Context = GraphQLContext<typeof base, { loaders: Loaders }>;

// src/resolvers.ts, in part: `Resolvers` is generated from the schema
export const resolvers: Resolvers = {
  Mutation: {
    addNote: (_, { text }, { viewer, db }) => {
      if (viewer === null) {
        throw new GraphQLError("Sign in to add a note", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }
      // …
    },
  },
  Note: {
    // The notes of one query load their authors in one batch (N+1 otherwise).
    author: (note, _, { loaders }) => loaders.user.load(note.authorId),
  },
};
```

To change the API, edit `schema.graphql` and run `bun run generate`; never
edit `src/generated/`.

## Lint and format

Every project ships [Biome](https://biomejs.dev), set up the same way: a
`biome.json` of its own with Biome's recommended rules, spaces and
double quotes, imports sorted, the build output (and `.react-router/`
or `src/generated/`, where the project has them) skipped; `@biomejs/biome` pinned exactly, as Biome asks; and
`.vscode/` recommending its extension, formatting on save. A new project
passes `bun run check:ci` with no finding.

| script | runs |
| --- | --- |
| `bun run check` | `biome check --write`: lint, format and sort imports, fixing what it can |
| `bun run lint` | `biome lint` |
| `bun run format` | `biome format --write` |
| `bun run check:ci` | `biome ci`: what CI runs, read-only |
| `bun run verify` | `minimal`: `check:ci`, `typecheck`, then `test`; `api` and `graphql`: `generate --check`, then those; `react-router`: `check:ci`, `typecheck`, then `build` |
| `bun run generate` | `api`: `nxgt-openapi generate`, `src/generated/` from `openapi.yaml`; `graphql`: `graphql-codegen`, `src/generated/resolvers.ts` from `schema.graphql`; with `--check`, writes nothing and exits 1 when a file is stale |

```sh
cd my-api
bun run verify
```

`check:ci` and not `ci`, since `bun ci` is Bun's frozen-lockfile install,
which a script named `ci` would not replace. The
[guide](https://github.com/softistx/alxia/blob/develop/packages/create/docs/guide.md#lint-and-format)
has the settings and why.

## Docker

Every project builds into an image as it is written: built on
`oven/bun:1`, run on `oven/bun:1-alpine` as the non-root `bun` user, an
image of about 130 MB. Each `Dockerfile`
builds in a stage of its own, and the image holds the build output alone,
no `node_modules`:

- `minimal`: `bun run build` bundles `src/index.ts` into `dist/index.js`; the
  image holds `dist/` and runs `bun --no-install dist/index.js`.
- `api`: `bun run build` bundles `src/server.ts` and its dependencies into
  `dist/server.js`, `src/generated/` included as it is committed, so the
  build generates nothing; the image holds `dist/` and runs `bun --no-install dist/server.js`.
- `graphql`: `bun run build` bundles `src/server.ts`, its dependencies and
  `schema.graphql` (imported as text) into `dist/server.js`, `src/generated/`
  included as it is committed; the image holds `dist/` and runs
  `bun --no-install dist/server.js`, with GraphiQL off (`NODE_ENV=production`, so alxia's dev switch is off).
- `react-router`: `bun run build`, every dependency bundled into
  `build/server/index.js` by `@alxia/react-router`'s plugin; the image
  holds `build/` and runs `bun --no-install build/server/index.js`.

```sh
cd my-api
docker build -t my-api .
docker run -p 3000:3000 -e API_KEY=change-me my-api   # API_KEY is required: the app does not start without it
```

`minimal` and `graphql` run the same way, with no `-e`: `docker run -p 3000:3000 my-app`.

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
| `--template <name>`, `-t` | `minimal`, `api`, `graphql` or `react-router`. Asked when not given, `minimal` by default |
| `--no-install` | write the files, skip `bun install` |
| `--help`, `-h` | the usage |

Given both `dir` and `--template`, it asks nothing, so it runs in a script
or CI.

## Versions

- **alxia's packages** — `@alxia/core`, `@alxia/env` (`api`, `graphql`), `@alxia/openapi` (`api`),
  `@alxia/graphql` (`graphql`) and `@alxia/react-router` (`react-router`) — are moved to the newest version on the registry
  within the ranges this release of `@alxia/create` was published with:
  `^0.3.1` writes `^0.3.4` once 0.3.4 is out, never `^0.4.0`. Just after a
  release, while the registry does not serve that version yet, the newest of
  the same minor is written (`^0.3.0`, which takes 0.3.1 once it arrives),
  and the output says so. `bunx @alxia/create@<version>` picks an older set.
- **Everything else** — Zod, TypeScript, Vite, React, React Router, GraphQL,
  Tailwind — is moved to the newest version on the registry when the project is
  written, within the range alxia's packages accept: TypeScript within
  `^6.0.3 || ^7.0.0`, Vite within `^7.0.0 || ^8.0.0`, React Router and its
  packages within `^8.0.0`, Zod within `^4.2.0`, `graphql` within `^16.11.0 || ^17.0.0` and `graphql-yoga`
  within `^5.16.0`; what no alxia package
  constrains goes to npm's `latest`. A newer major outside alxia's range is
  left out, and the output says so.
- **Biome** is pinned exactly, and written exactly: the newest patch of the
  template's minor, `2.5.15` writing `2.5.16` but never `2.6.0`, whose new
  rules the template was not checked against.
- **The code generators** are pinned exactly and kept at the template's
  versions, never moved to a newer patch: `@nxgt/openapi-codegen` (`api`,
  `0.7.0`) and GraphQL Code Generator's `@graphql-codegen/cli`,
  `typescript` and `typescript-resolvers` (`graphql`). `bun run verify` runs
  `generate --check` over the committed `src/generated/`, which a release
  that writes the files differently would fail in a fresh project.

The registry is the one `BUN_CONFIG_REGISTRY` or `npm_config_registry`
names, else npmjs.org; when it does not answer, the template's own
versions stay, with a warning.

## Other package managers

```sh
bunx @alxia/create my-app --template minimal
npm create @alxia my-app -- --template minimal
```

The bin runs on Bun (`#!/usr/bin/env bun`) whichever runner starts it, and
the project it writes installs with `bun install`.

## API

| export | |
| --- | --- |
| `create-alxia` | the bin `bun create @alxia`, `bunx @alxia/create` and `npm create @alxia` run. The package exports no module |

## Documentation

- [Guide](https://github.com/softistx/alxia/blob/develop/packages/create/docs/guide.md): each template file by file, adding an operation to the `api` project and a field to the `graphql` one, what the `react-router` template adds to React Router's, Biome's settings, each `Dockerfile`, how versions are chosen, and running it in CI.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/create/docs/troubleshooting.md): each message the command prints, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/create/docs/roadmap.md): what is coming, and what is not planned.
- [Recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md): [Start in 5 minutes](https://github.com/softistx/alxia/blob/develop/docs/start.md), [A spec-first CRUD API](https://github.com/softistx/alxia/blob/develop/docs/recipes/spec-first-crud.md), [A GraphQL API](https://github.com/softistx/alxia/blob/develop/docs/recipes/graphql-api.md), [Deploy with Docker](https://github.com/softistx/alxia/blob/develop/docs/recipes/deploying.md).
