# Guide

How `bun create @alxia` asks, what each template writes, how the `api`
project grows from its OpenAPI document and the `graphql` one from its
schema, and how the command chooses the versions it writes.

- [Running it](#running-it)
- [The `minimal` template](#the-minimal-template)
- [The `api` template](#the-api-template)
  - [Adding an operation](#adding-an-operation)
- [The `graphql` template](#the-graphql-template)
  - [Adding a field](#adding-a-field)
- [The `react-router` template](#the-react-router-template)
- [Lint and format](#lint-and-format)
- [Docker](#docker)
- [Versions](#versions)
- [In a script or CI](#in-a-script-or-ci)

## Running it

```sh
bun create @alxia
```

With no arguments it asks two questions, each with a default an empty
answer takes:

```
Where should the project go? [alxia-app] my-app
Which template? minimal, api, graphql or react-router [minimal]
```

then writes the project, runs `bun install` in it, and prints what to run
next:

```
Done: my-app holds the minimal template. Next:

  cd my-app
  bun dev
```

| option | default | |
| --- | --- | --- |
| `[dir]` | asked, `alxia-app` | where to write: empty, or not there yet |
| `--template <name>`, `--template=<name>`, `-t <name>` | asked, `minimal` | `minimal`, `api`, `graphql` or `react-router` |
| `--no-install` | install | write the files, skip `bun install` |
| `--help`, `-h` | | the usage, and nothing else |

What the command line gives is not asked: `bun create @alxia my-app
--template react-router` asks nothing. The directory must be empty or not
exist yet; `.` writes into the current one, when it is empty, and the next
steps then start at `bun dev`. The package name in `package.json` is the
directory's name, lowercased, with `-` for anything npm refuses, and the
same name replaces the template's own (`my-api`, `my-app`) in its other
files, as the README's `docker build -t` and `docker run`: `bun create
@alxia "Mon Super Projet"` writes `mon-super-projet` in both.

`bun create @alxia` is `bunx @alxia/create`: Bun maps `bun create @scope`
to the package `@scope/create`, and npm maps `npm create @scope` the same
way. Any of the three runs the same bin, on Bun.

The templates are files shipped in this package, under `templates/minimal/`,
`templates/api/`, `templates/graphql/` and `templates/react-router/`, and copied as they are:
nothing is downloaded but the dependencies. `package.json` is written
again, with the directory's name, alxia's versions and the newest of the
others ([Versions](#versions)); in every other text file, the template's
own name, as a whole word, becomes the project's. Three files are stored
under another name and take theirs back on the copy: `gitignore` is
written as `.gitignore` and `_bunfig.toml` as `bunfig.toml`, since `bun
publish` leaves those out of a tarball, and `_biome.json` as `biome.json`,
since alxia's own Biome refuses a second root configuration inside its
repository ([Lint and format](#lint-and-format)).

## The `minimal` template

The template to try alxia with: one file, one dependency, a test.

```
my-app/
├── src/
│   ├── index.ts        the app, exported; listens only when it is the entry file
│   └── index.spec.ts   bun test: app.request(), no port
├── package.json
├── tsconfig.json
├── biome.json          Biome: lint, format, imports sorted
├── .vscode/            Biome's extension recommended, format on save
├── Dockerfile          bun run build, then dist/ alone, on oven/bun:1-alpine
├── .dockerignore
├── .gitignore
└── README.md
```

```ts
// src/index.ts
import { alxia } from "@alxia/core";

export const app = alxia().get("/", ({ reply }) =>
  reply(200, { hello: "world" }),
);

// Only when this file is the entry: the test imports `app` and listens on
// no port.
if (import.meta.main) {
  // In dev, the URL and the route table; in production, the URL alone. On
  // SIGINT and SIGTERM, listen drains the requests in flight and exits.
  app.listen({
    port: Number(Bun.env["PORT"] ?? 3000),
    onListen: ({ dev, table, url }) =>
      console.log(dev ? table : `listening on ${url}`),
  });
}
```

`bun dev` runs `NODE_ENV=development bun --hot src/index.ts`, which
prints the route table `@alxia/core` writes in dev — on under
`NODE_ENV=development` alone; `bun start` runs `NODE_ENV=production bun dist/index.js`, what
`bun run build` wrote, and the image sets `NODE_ENV=production`, under
which it prints the URL alone. `import.meta.main` is why
the spec can import `app` without opening a port, and why the one file is
both the app and its server. `listen` shuts the app down gracefully on
`SIGINT` and `SIGTERM`, then exits, so as a container's process 1 Bun stops
at once on `docker stop`: the template installs no handler of its own.

The spec:

```ts
// src/index.spec.ts
import { expect, test } from "bun:test";
import { app } from "./index";

test("GET / says hello", async () => {
  const response = await app.request("/");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ hello: "world" });
});
```

What it leaves out is the point: one dependency, `@alxia/core`; no
OpenAPI, no code generation, no validator, no `.env` file (`PORT` is read
as it is). `bun run verify` is `check:ci`, `typecheck`, then `test`. When
the app outgrows one file, move to the layout of the
[`api`](#the-api-template) or [`graphql`](#the-graphql-template) template,
or read
[`@alxia/core`'s guide](https://github.com/softistx/alxia/tree/develop/packages/core/docs).

## The `api` template

```
my-api/
├── openapi.yaml               the contract: every operation, its parameters, body and replies
├── openapi-codegen.config.ts  how `bun run generate` reads it
├── src/
│   ├── generated/             what `bun run generate` writes: committed, never edited
│   ├── env.ts                 defineEnv from @alxia/env: PORT, API_KEY and API_DOCS
│   ├── context.ts             the base: what every route reads, and its Register
│   ├── routes/todos.ts        defineRoutes(): one route per operation
│   ├── app.ts                 the app: the base, health(), apiDocs, the routes, and its type
│   ├── app.spec.ts            bun test: the typed client over app.fetch, and matchesSpec
│   └── server.ts              app.listen on env.PORT, which stops on SIGINT and SIGTERM
├── package.json
├── tsconfig.json
├── biome.json                 Biome: lint, format, imports sorted
├── .vscode/                   Biome's extension recommended, format on save
├── Dockerfile                 bun run build, then dist/ alone, on oven/bun:1-alpine
├── .dockerignore
├── .env.example               PORT, API_KEY and API_DOCS, for a .env Bun loads
├── .gitignore
└── README.md
```

The project is OpenAPI spec first: `openapi.yaml` is written first, the
code is generated from it, and the app binds a handler to each generated
operation. A client in another project is generated from the same file.

### `openapi.yaml`

Three operations, each with an `operationId`, which names it everywhere
after:

| operation | `operationId` | replies |
| --- | --- | --- |
| `GET /todos` | `listTodos` | 200, the todos |
| `POST /todos` | `createTodo` | 201, the todo; 400; 401 without the `x-api-key` header (`security: apiKey`) |
| `GET /todos/{id}` | `getTodo` | 200; 400, an `id` that is not a whole number of 1 or more; 404 |

```yaml
# openapi.yaml, in part
  /todos/{id}:
    get:
      operationId: getTodo
      summary: One todo
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer, minimum: 1 }
      responses:
        "200":
          description: The todo
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Todo" }
        "400":
          $ref: "#/components/responses/ValidationError"
        "404":
          description: No todo has this id
          content:
            application/json:
              schema: { $ref: "#/components/schemas/NotFound" }
```

The 400 is declared once, as `components.responses.ValidationError`, and
is the body alxia itself sends when a request breaks the operation's
schemas, `@alxia/core`'s `ValidationErrorBody`:

```json
{ "error": "validation", "issues": [{ "target": "body", "path": ["title"], "code": "too_small", "message": "…" }] }
```

Declared in the spec, it is in every generated client's types, and the
app checks its own refusals against it like any other reply.

### `openapi-codegen.config.ts`

```ts
import { defineConfig } from "@nxgt/openapi-codegen";

export default defineConfig({
  input: "openapi.yaml",
  output: "src/generated",
  alxia: true,
  validationErrors: false,
});
```

| option | value | effect |
| --- | --- | --- |
| `input` | `"openapi.yaml"` | the spec |
| `output` | `"src/generated"` | where the files go |
| `alxia` | `true` | adds `alxia.ts`: each operation as the data `app.route()` takes |
| `validationErrors` | `false` | declares no 400 of the generator's own (below) |

`validationErrors` is `true` by default, and then declares another
server's 400 body, `{ status, message, timestamp, issues }`, in the
files a client reads (`types.ts`, `zod.ts`, `operations.ts`,
`paths.ts`). alxia never sends that body. Turned off, the generated files
declare only the spec's own 400, which is the one alxia sends.

### `src/generated/`

`bun run generate` runs `nxgt-openapi generate`, the bin of
[`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen):

```
openapi.yaml → src/generated: 5 written, 0 unchanged
```

| file | holds |
| --- | --- |
| `alxia.ts` | one `as const` constant per operation, `{ method, path, schema }`, with the path in alxia's form (`/todos/:id`), the request's Zod schemas, a schema per response status and the `operationId`; and `operations`, all of them by `operationId` |
| `zod.ts` | a Zod schema per component schema: `zTodo`, `zNewTodo`, … |
| `types.ts` | a TypeScript type per component schema: `Todo`, `NewTodo`, … |
| `operations.ts`, `paths.ts` | the operations and paths as types, for a typed client |

```ts
// src/generated/alxia.ts, in part
export const createTodo = {
  method: "POST",
  path: "/todos",
  schema: {
    body: zNewTodo,
    response: { 201: zTodo, 400: zValidationError, 401: zUnauthorized },
    detail: { operationId: "createTodo", summary: "Add a todo" },
  },
} as const;
```

**The folder is committed.** Nothing is generated at install or at build:

- `bun install` runs no script, and `bun dev`, `bun test` and
  `bun run build` read the files as they are;
- the `Dockerfile` is the same as without a spec: its build stage runs
  `bun run build`, and `openapi.yaml` is not read;
- a clone builds offline, and a review shows what a change to
  `openapi.yaml` changed in the code.

The cost is that the files can drift from the spec: `openapi.yaml` edited
and `bun run generate` forgotten. `bun run verify` runs
`bun run generate --check` first, which writes nothing, lists each stale
file and exits 1
([troubleshooting](troubleshooting.md#openapiyaml--srcgenerated-out-of-date-run-nxgt-openapi-generate)).

`biome.json` skips `src/generated/`, `"!!**/src/generated"` in its
`files.includes`, as it skips `dist/`: the generator writes its own
style, and `bun run check` would otherwise rewrite the files and make
`generate --check` fail.

`@nxgt/openapi-codegen` is a devDependency pinned exactly, since another
release may write the files differently. The command keeps the version
the template ships, never moving it to a newer patch ([Versions](#versions)),
so `bun run verify` passes in a fresh project whatever a later release
writes. Moving it is a change to review:

```sh
bun add --dev --exact @nxgt/openapi-codegen@latest
bun run generate
git diff src/generated
```

What the generator does not write, in 0.7.0, and how the app does it
instead:

- **`security`**: no middleware is generated from it. Authentication is
  a middleware the app writes, `requireKey` here, given to the routes
  that need it.
- **A cookie parameter in the client files**: `alxia.ts` validates it as
  the route's `cookies`; `types.ts`, `zod.ts`, `operations.ts` and
  `paths.ts` leave it out with an `ignored` warning, since a client does not
  set cookies.
- **Server-sent events with text data**: the operation is left out of
  `alxia.ts` with a warning; give each event's data a JSON `contentSchema`,
  or declare that route by hand with `@alxia/core`'s `eventStream`. Named
  events whose data is JSON are generated.

### `src/env.ts`

```ts
import { defineEnv } from "@alxia/env";
import { z } from "zod";

// `bun dev` and `bun test` run in development and test; anything else,
// production included, is a deployment.
const local = ["development", "test"].includes(Bun.env.NODE_ENV ?? "");

export const env = defineEnv(
  {
    PORT: z.coerce.number().default(3000),
    API_KEY: local ? z.string().min(1).default("dev-key") : z.string().min(1),
    API_DOCS: z.stringbool().default(Bun.env.NODE_ENV === "development"),
  },
  { secret: ["API_KEY"] },
);
```

[`defineEnv`](https://github.com/softistx/alxia/tree/develop/packages/env/docs)
checks the environment once, when the module is first imported: a missing
or malformed variable stops the process with every issue, before it listens.
`API_KEY` is a secret, so it prints as `***`. It defaults to `dev-key`
under `NODE_ENV=development` and `test` alone: anywhere else — `bun start`,
the image — it is required, and the app does not start without it.
`API_DOCS` turns the API reference at `/docs` on: by default in
development alone. `Bun.env`, not `process.env.NODE_ENV`, which
`bun build` would replace with the mode of the build. `src/server.ts` listens on `env.PORT` and
`src/routes/todos.ts` compares the `x-api-key` header with `env.API_KEY`.
`@alxia/env` and `zod` are dependencies.

### `src/context.ts`

```ts
import { alxia } from "@alxia/core";
import type { Todo } from "./generated/types";

const todos: Todo[] = [];

// The base: what every route reads, decorated or derived here. It is
// registered below, so a route file reads it with no import of the app.
// alxia's own errors — a 400 the schemas refuse, a 404 no route matches, a
// 500 — are RFC 9457 problems, as openapi.yaml declares them.
export const base = alxia({ errors: "problem" }).decorate({ todos });

// Register the base, never the app: the app mounts the route files, whose
// type reads this, and would then be typed by itself.
declare module "@alxia/core" {
  interface Register {
    context: typeof base;
  }
}
```

The base is what every route reads: here the todos, decorated. Register it
once, and each route file reads that context with no import of the app
([Register and AppContext](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/types.md#register-and-appcontext)).
Register `base`, never `app`: `app` mounts the route files, whose type
reads `Register`, so it would be typed by itself, `TS7022`. A `derive`
for a `user` from a session goes here too, and every route then reads
`user` typed.

### `src/routes/todos.ts`

```ts
import { defineMiddleware, defineRoutes } from "@alxia/core";
import { env } from "../env";
import { operations } from "../generated/alxia";

// A middleware of the routes it is given to: it answers 401 without the key,
// before the body is read. openapi.yaml declares that 401.
const requireKey = defineMiddleware(({ request, reply }, next) =>
  request.headers.get("x-api-key") === env.API_KEY
    ? next()
    : reply(401, { error: "unauthorized" as const }),
);

// Each route is an operation of openapi.yaml, generated into
// src/generated/alxia.ts: its method, path and schemas come from the spec,
// so the handler is all that is written here. The request is validated
// just before the handler, and its reply against the spec's responses.
// `todos` is the registered context's: defineRoutes() reads it, and the
// app that mounts these routes must give it.
export const todoRoutes = defineRoutes()
  .route(operations.listTodos, ({ todos, reply }) => reply.ok(todos))
  .route(operations.createTodo, requireKey, ({ body, todos, reply }) => {
    const todo = { id: todos.length + 1, title: body.title, done: false };
    todos.push(todo);
    return reply.created(todo);
  })
  .route(operations.getTodo, ({ params, todos, reply }) => {
    const todo = todos.find(({ id }) => id === params.id);
    return todo
      ? reply.ok(todo)
      : reply.notFound({ error: "not_found" as const });
  });
```

`defineRoutes()` is a plugin, `alxia()` at runtime, typed with the
registered context: the handlers read `todos`. It requires that context
of the app that mounts it, so `alxia().plugin(todoRoutes)` is a compile
error. It takes no prefix here: an operation's path is already whole.

### `src/app.ts`

```ts
import { health } from "@alxia/core";
import { apiDocs } from "@alxia/openapi";
import spec from "../openapi.yaml";
import { base } from "./context";
import { env } from "./env";
import { todoRoutes } from "./routes/todos";

// The base, then the probes (GET /health, GET /ready) before any guard,
// the API reference at /docs (on in development; API_DOCS=true elsewhere),
// and the route files: each requires the base's context, so mounting one
// before it is a compile error. openapi.yaml is imported, so `bun run build`
// puts it inside dist/server.js: the image needs no copy of it.
export const app = base
  .plugin(health())
  .plugin(apiDocs({ spec, enabled: env.API_DOCS }))
  .plugin(todoRoutes);

export type App = typeof app;
```

`health()` answers `GET /health` (liveness) and `GET /ready` (readiness),
and `apiDocs` serves a Scalar page at `/docs` with the document at
`/docs/openapi.yaml` and `/docs/openapi.json`. `matchesSpec` leaves both
out: no operation of `openapi.yaml` describes them. The document is public
wherever `/docs` is on.

```ts
route(operation, ...middlewares, handler)
```

- **The operation gives the method, the path and the schemas.** The
  handler is all the route writes; its `params`, `body` and `reply` are
  typed by the spec: `params.id` is a number, as `openapi.yaml` declares
  it, and `reply` takes only the statuses the operation declares.
- **The middlewares run in the order given.** `requireKey` comes first,
  so a request without the key is a 401 before its body is read, whatever
  the body
  ([A route's middlewares](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/middleware.md#a-routes-middlewares)).
- **The request is validated just before the handler**: an empty
  `title` is a 400 naming `title`, `/todos/first` a 400 naming `id`, and
  the handler never runs. To validate before a middleware instead, place
  `validate(operations.createTodo)` among the middlewares.
- **The handler's reply is checked against the spec's responses**: a
  reply the spec refuses is not sent; the client gets a 500
  ([troubleshooting](troubleshooting.md#responsevalidationerror-post-todos-the-201-reply-does-not-match-its-schema)).
  A middleware's own reply, `requireKey`'s 401, is sent as it is; to check
  it against `Unauthorized` too, place `responds(operations.createTodo)`
  before `requireKey`.
- **`todos` lives in memory**: replace the array with your database,
  given to the routes the same way, by `decorate`.

### `src/app.spec.ts`

The spec calls the app through the client the generated `paths.ts`
describes, [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) (a dev
dependency), whose `fetch` is `app.fetch`: in process, no server, no port,
and every path, parameter, body and reply typed by `openapi.yaml`.

```ts
import { expect, test } from "bun:test";
import { matchesSpec } from "@alxia/openapi";
import createClient from "openapi-fetch";
import { app } from "./app";
import { env } from "./env";
import { operations } from "./generated/alxia";
import type { paths } from "./generated/paths";

const api = createClient<paths>({
  baseUrl: "http://alxia.test",
  fetch: (request) => app.fetch(request),
  headers: { "x-api-key": env.API_KEY },
});

test("routes every operation of openapi.yaml, and nothing else", () => {
  matchesSpec(app, operations);
});

test("creates a todo from JSON", async () => {
  const { data, response } = await api.POST("/todos", {
    body: { title: "Write a route" },
  });
  expect(response.status).toBe(201);
  expect(data?.title).toBe("Write a route");
});
```

`matchesSpec(app, operations)`, from
[`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi), throws
when an operation has no route, or a route has no operation, naming each.
The spec also checks the 400, the 401 before the body and the 404 through
the client, and keeps one test on `app.request()`: the client sends only
what the spec allows, so a request it forbids (`/todos/first`) goes
through `app.request`. See
[Testing with the generated client](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/testing.md).

### Adding an operation

A route starts in `openapi.yaml`. To add `DELETE /todos/{id}`:

1. Declare it, with an `operationId`:

   ```yaml
   # openapi.yaml, under /todos/{id}, beside get
       delete:
         operationId: deleteTodo
         security:
           - apiKey: []
         parameters:
           - name: id
             in: path
             required: true
             schema: { type: integer, minimum: 1 }
         responses:
           "204":
             description: The todo, removed
           "400":
             $ref: "#/components/responses/ValidationError"
           "401":
             description: No x-api-key header, or not the key
             content:
               application/json:
                 schema: { $ref: "#/components/schemas/Unauthorized" }
           "404":
             description: No todo has this id
             content:
               application/json:
                 schema: { $ref: "#/components/schemas/NotFound" }
   ```

2. Generate:

   ```sh
   bun run generate
   ```

   `src/generated/alxia.ts` now exports `operations.deleteTodo`. Until
   the app routes it, `bun test` fails:

   ```
   TypeError: matchesSpec(): 1 operation has no route: DELETE /todos/:id (deleteTodo)
   ```

3. Bind it in `src/routes/todos.ts`, after the `getTodo` route:

   ```ts
     .route(operations.deleteTodo, requireKey, ({ params, todos, reply }) => {
       const index = todos.findIndex(({ id }) => id === params.id);
       if (index === -1) return reply.notFound({ error: "not_found" as const });
       todos.splice(index, 1);
       return reply.noContent();
     });
   ```

4. Check, and commit `openapi.yaml` with `src/generated/`:

   ```sh
   bun run verify
   ```

### The rest

The scripts:

| script | runs |
| --- | --- |
| `bun dev` | `NODE_ENV=development bun --watch src/server.ts`: restarted on every change, on `PORT` or 3000, with alxia's dev helps and `/docs` on |
| `bun test` | the spec |
| `bun run generate` | `nxgt-openapi generate`: `src/generated/` from `openapi.yaml`. `bun run generate --check` writes nothing and exits 1 when a file is stale |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run build` | `bun build src/server.ts --target=bun --outdir=dist --minify --sourcemap=linked`: one file, its dependencies bundled |
| `bun start` | `NODE_ENV=production bun dist/server.js`: the build, after `bun run build` |
| `bun run check` | `biome check --write`: lint, format, sort imports, fixing what it can |
| `bun run lint`, `bun run format` | `biome lint`, `biome format --write` |
| `bun run check:ci` | `biome ci`: read-only, for CI |
| `bun run verify` | `generate --check`, `check:ci`, `typecheck`, then `test` |

`start` runs what `build` wrote, as production and the image do:

```sh
bun run build && bun start
```

`dist/server.js` holds every dependency, so it runs on a host that has Bun
and no `node_modules`. It is minified, and `dist/server.js.map` beside it
is linked from it: Bun reads the map, so a stack trace names the lines of
`src/`. `bun dev` and `bun test` run the TypeScript as it is, with no
build.

Bun loads `.env` on every command. `.env.example` names the variables
`src/env.ts` reads, `PORT` (3000 by default), `API_KEY` (`dev-key` by
default in development and test alone, required elsewhere) and `API_DOCS`:
copy it to `.env`, which `.gitignore` keeps out of git and `.dockerignore`
out of the image. Its `API_KEY` and `API_DOCS` are commented out: Bun
loads `.env` on `bun start` too, where a development key or a public
`/docs` would defeat the defaults; set them for a deployment in its own
environment.

`tsconfig.json` holds the settings alxia's own packages are checked under:
`strict`, and past it `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`,
`noUnusedLocals` and the rest. Hence `Bun.env["PORT"]` and not
`Bun.env.PORT` (in the `minimal` project), and Biome's `useLiteralKeys`, which would ask for the
second, is off in `biome.json`. Loosen what you would rather not keep:
alxia's types, and the generated files, compile under each one, and under
none.

## The `graphql` template

A GraphQL API with [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server),
served by `@alxia/graphql` as a route of the app, behind its middlewares.
It is schema first, as the `api` project is spec first: `schema.graphql` is
written first, the resolvers are typed from it.

```
my-graphql-api/
├── schema.graphql          the contract: Query, Mutation, Subscription and their types
├── codegen.ts              how `bun run generate` reads it
├── src/
│   ├── generated/resolvers.ts  what `bun run generate` writes: committed, never edited
│   ├── env.ts              defineEnv: PORT
│   ├── store.ts            in-memory users, tokens and notes, and the pub/sub
│   ├── loaders.ts          createLoaders(): the DataLoaders of one request
│   ├── context.ts          the base, the viewerOf middleware, and Context
│   ├── resolvers.ts        const resolvers: Resolvers
│   ├── schema.ts           createSchema from schema.graphql and the resolvers
│   ├── app.ts              health() and graphql(app, { schema, context }) mounted on the base
│   ├── graphql.d.ts        declares the *.graphql module
│   ├── app.spec.ts         bun test: POST /graphql through app.request()
│   └── server.ts           app.listen on env.PORT, which stops on SIGINT and SIGTERM
├── package.json
├── tsconfig.json
├── biome.json              Biome; skips dist/ and src/generated/
├── .vscode/
├── Dockerfile              bun run build, then dist/ alone, on oven/bun:1-alpine
├── .dockerignore
├── .env.example            PORT, for a .env Bun loads
├── .gitignore
└── README.md
```

`bun dev` serves `http://localhost:3000/graphql`; a browser's GET opens
GraphiQL, and a POST answers queries:

```sh
curl localhost:3000/graphql -H 'content-type: application/json' \
  -H 'authorization: Bearer ada-token' \
  -d '{"query":"mutation { addNote(text: \"Hello\") { id author { name } } }"}'
```

### `schema.graphql` and `codegen.ts`

The schema declares `Query` (`me`, `notes`), `Mutation` (`addNote(text:
String!): Note!`), `Subscription` (`noteAdded: Note!`) and the `User` and
`Note` types. `bun run generate` is `graphql-codegen --config codegen.ts`:

```ts
// codegen.ts
const config: CodegenConfig = {
  schema: "schema.graphql",
  generates: {
    "src/generated/resolvers.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        contextType: "../context#Context",
        mappers: { Note: "../store#NoteRecord" },
        useTypeImports: true,
        useIndexSignature: true,
      },
    },
  },
};
```

It writes the schema's types and `Resolvers`, whose context is the app's own
`Context` and whose `Note` is the `NoteRecord` the store holds, so a resolver
returns the record and `Note.author` reads it. `src/generated/` is
committed, so nothing is generated at install or build, in Docker too, and
Biome skips it. Never edit it.

Why GraphQL Code Generator: it is the de facto standard for typed
resolvers from a `schema.graphql`, and the generator that types `Resolvers`
with a custom context type and mappers. It is a devDependency, so the image
stays bundle-only. Lighter tools were not chosen: gql.tada types documents,
not resolvers, and Pothos is code first.

### `src/context.ts`, `src/resolvers.ts`

```ts
// src/context.ts
import { alxia, defineMiddleware } from "@alxia/core";
import type { GraphQLContext } from "@alxia/graphql";
import { env } from "./env";
import type { Loaders } from "./loaders";
import { db } from "./store";

const viewerOf = defineMiddleware(({ request }, next) => {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  const id = token === undefined ? undefined : db.tokens.get(token);
  return next({
    viewer: (id === undefined ? undefined : db.users.get(id)) ?? null,
  });
});

export const base = alxia().decorate({ env, db }).use(viewerOf);
export type Context = GraphQLContext<typeof base, { loaders: Loaders }>;
```

`viewerOf` is a middleware given to `use`: it reads
`Authorization: Bearer <token>` and passes `next({ viewer })`, the user or
`null`. It never refuses, so a query may be anonymous (`me` is `null`), and
`viewer` is typed in every resolver through `GraphQLContext`, whose second
argument types the `loaders` the `context` option of `src/app.ts` adds.
The tokens in `src/store.ts` are for development (`ada-token`): look a
session up, or verify a JWT, in the same place.

```ts
// src/resolvers.ts, in part
export const resolvers: Resolvers = {
  Query: {
    me: (_, __, { viewer }) => viewer,
    notes: (_, __, { db }) => db.notes,
  },
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

A field the schema lacks, or a value its type refuses, is a compile error.
`addNote` throws a `GraphQLError` with the code `UNAUTHENTICATED` when
`viewer` is `null` ([troubleshooting](troubleshooting.md#sign-in-to-add-a-note)).

### `src/loaders.ts`: one batch per request

```ts
// src/loaders.ts
import DataLoader from "dataloader";
import { findUsers } from "./store";

export function createLoaders() {
  return { user: new DataLoader(findUsers) };
}

export type Loaders = ReturnType<typeof createLoaders>;
```

`Note.author` calls `loaders.user.load(note.authorId)`. A DataLoader
collects the `load` calls of one tick into one call of `findUsers` (in a
database, one `WHERE id IN (...)`), so a list of N notes loads its authors
in one batch, not N calls. It also caches each key it has seen, so loaders
are built per request, never shared: `src/app.ts` passes `context` to
`graphql()`, and a shared loader would serve one user's data to another and
never see a change. `dataloader` is a dependency of the project; the spec
asserts one batch for N notes and a fresh set of loaders per request.

### `src/app.ts` and the subscription

```ts
export const app = base
  .plugin(health())
  .plugin((app) =>
    graphql(app, { schema, context: () => ({ loaders: createLoaders() }) }),
  );
```

`health()` answers `GET /health` and `GET /ready`. GraphiQL follows the
app's dev switch, `graphql()`'s default: on under `bun dev`, which sets
`NODE_ENV=development`, off under `bun start` and in the image. `noteAdded` is served over server-sent events, Yoga's default,
so no WebSockets: a request with `Accept: text/event-stream` gets a result
each time `addNote` publishes to the `createPubSub` of `src/store.ts`:

```sh
curl -N localhost:3000/graphql -H 'content-type: application/json' \
  -H 'accept: text/event-stream' \
  -d '{"query":"subscription { noteAdded { text author { name } } }"}'
```

That pub/sub lives in one process: across several, back it with a broker.

### `src/env.ts`

`defineEnv` from `@alxia/env` reads `PORT` (3000 by default), checked once,
when the module is first imported: a malformed one stops the process with
every issue, before it listens. Bun loads `.env`; copy `.env.example` to
`.env` to set it.

### Adding a field

1. Add it to `schema.graphql`: `notesBy(userId: ID!): [Note!]!` on `Query`.
2. `bun run generate`: `Resolvers` has `notesBy`, its arguments typed.
3. Write the resolver in `src/resolvers.ts`:
   `notesBy: (_, { userId }, { db }) => db.notes.filter(…)`.
4. Add a query to `src/app.spec.ts`, which POSTs to `/graphql` through
   `app.request()`, with no port, and `bun test`.

`bun run verify` is `generate --check`, `check:ci`, `typecheck`, then
`test`: it fails when `src/generated/` is not what `schema.graphql` gives.

The spec's `query` helper types its result by hand (`Result`). To type each
operation's variables and data from `schema.graphql`, add
`@graphql-codegen/client-preset` and write the operations with its `graphql()`
tag; the template does not ship it, to keep `src/generated/` to the
resolvers.

### The build bundles the schema

`src/schema.ts` imports the schema as text:

```ts
import typeDefs from "../schema.graphql" with { type: "text" };
```

`src/graphql.d.ts` declares the `*.graphql` module for TypeScript, and
`bun run build` puts the file's content in `dist/server.js`, so the image
holds `dist/` alone and no `.graphql` file beside it.

### Pinned versions

`@graphql-codegen/cli` (7.4.3), `typescript` and `typescript-resolvers`
(6.1.0 each) are pinned exactly, and `@alxia/create` keeps them at those
versions ([Versions](#versions)): a generator patch may write
`src/generated/` differently, which `generate --check` would then fail in a
fresh project. To move them, run `bun run generate`, read `git diff
src/generated`, then `bun run verify`
([troubleshooting](troubleshooting.md#srcgenerated-changes-after-moving-graphql-codegen)).

The scripts are those of the [`api`](#the-rest) project, with `generate` as
`graphql-codegen --config codegen.ts` and `start` as `NODE_ENV=production bun dist/server.js`.
For Yoga's plugins, the IDE and the typed context, see
[`@alxia/graphql`'s guide](https://github.com/softistx/alxia/tree/develop/packages/graphql/docs).

## The `react-router` template

It is React Router's official template, shipped inside this package and
copied: what `create-react-router` wrote, committed as it wrote it, with the
same small change
[`examples/react-router`](https://github.com/softistx/alxia/tree/develop/examples/react-router)
made to it. Nothing is downloaded but the dependencies, and nothing runs
before `bun install`. The change, against React Router's files:

```diff
 // package.json
   "scripts": {
-    "start": "react-router-serve ./build/server/index.js",
+    "start": "NODE_ENV=production bun build/server/index.js",
   },
   "dependencies": {
+    "@alxia/core": "^0.3.1",
+    "@alxia/react-router": "^0.2.0",
```

```diff
 // vite.config.ts
+import { alxia } from "@alxia/react-router/vite";
 import { reactRouter } from "@react-router/dev/vite";
 …
-  plugins: [tailwindcss(), reactRouter()],
+  plugins: [tailwindcss(), reactRouter(), alxia()],
```

```diff
 // package.json
   "scripts": {
+    "lint": "biome lint",
+    "format": "biome format --write",
+    "check": "biome check --write",
+    "check:ci": "biome ci",
+    "verify": "bun run check:ci && bun run typecheck && bun run build"
   },
   "devDependencies": {
+    "@biomejs/biome": "2.5.15",
```

```toml
# bunfig.toml, new
[run]
# The React Router CLI is a node script: this starts it on Bun, which
# alxia's server needs, even where a node is installed.
bun = true
```

The `Dockerfile` is alxia's, in place of React Router's, which builds and
runs on Node ([Docker](#docker)). `biome.json` and `.vscode/` are new,
and the README gains a Lint and format section
([Lint and format](#lint-and-format)); Biome formatted the scaffold once,
which changed three of its files: `app/app.css`'s font list wraps
differently, and `app/routes.ts` and `app/routes/home.tsx` have their
imports sorted. Every other file is React Router's:
`app/`, `public/`, `tsconfig.json`, `react-router.config.ts`, its
`README.md` (with Bun's commands where it wrote npm's: `bun install`,
`bun dev`, `bun run build`), `.gitignore` and `.dockerignore`. `package.json` takes the directory's name, and its
versions are moved to the newest the registry has ([Versions](#versions)):
the template's own are where they start.

The template follows React Router's majors, not its every release: it is
written again from `create-react-router` when React Router ships one that
`@alxia/react-router` accepts, in a new `@alxia/create`. Between two, the
files are what `create-react-router` wrote when the template was last
generated (React Router 8.4.0 in this release), and the versions are the newest of that major.

There is no `app/server.ts`: the plugin's default server serves the pages
in `bun dev` and from the build. To put alxia's middlewares or `/api` routes in
front of the pages, write it out and edit it:

```sh
bunx alxia-react-router reveal
```

The [`@alxia/react-router` guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md)
goes from there.

## Lint and format

Every project lints and formats with [Biome](https://biomejs.dev), in one
style whichever template wrote it. Its `biome.json` is a root
configuration of its own, extending nothing:

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["**", "!!**/build", "!!**/.react-router"] },
  "formatter": { "enabled": true, "indentStyle": "space" },
  "css": { "parser": { "tailwindDirectives": true } },
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "correctness": { "noEmptyPattern": "off" }
    }
  },
  "assist": {
    "enabled": true,
    "actions": { "source": { "organizeImports": "on" } }
  },
  "overrides": [
    {
      "includes": ["**/app/welcome/**"],
      "linter": { "rules": { "a11y": { "noSvgWithoutTitle": "off" } } }
    }
  ]
}
```

That is the `react-router` project's, written here compact. The `api`
and `graphql` projects' skip `dist/` and `src/generated/` instead of
`build/` and `.react-router/`, and the `minimal` one `dist/` alone; they have no
CSS settings and no overrides, and turns `complexity.useLiteralKeys` off
in place of `noEmptyPattern` ([the `api` template](#the-api-template)).

- **The style is Biome's default but for spaces**: two spaces, double
  quotes, 80 columns. React Router's scaffold is written so, and so is
  the `package.json` the command writes: formatting the scaffold once
  changed three of its files, where tabs would change every line. The
  other projects take the same style, so they read alike.
- **`$schema` is the installed Biome's own schema**, so an editor checks
  the file against the version `bun install` put in `node_modules`,
  whichever the command wrote.
- **What is generated is skipped.** `files.includes` leaves `dist/` and
  `src/generated/`, or `build/` and `.react-router/`, out, and `vcs.useIgnoreFile` every path
  `.gitignore` names, the project in a git repository or not (with no
  `.gitignore` and no git repository, Biome refuses to run:
  [troubleshooting](troubleshooting.md#-biome-couldnt-find-an-ignore-file-in-the-following-folder-)).
- **Two rules are off in the `react-router` project, for the scaffold's
  own code.** `noEmptyPattern`: `meta({}: Route.MetaArgs)` is React
  Router's idiom for a route module's function that reads none of its
  arguments. `noSvgWithoutTitle`, under `app/welcome/` alone: the welcome
  page's logos, which a project replaces.
- **`css.parser.tailwindDirectives`** lets Biome read Tailwind v4's
  `@import "tailwindcss"` and `@theme` in `app/app.css`.

`@biomejs/biome` is a devDependency pinned exactly, as Biome recommends,
since a release may format differently. The command moves it to the
newest patch of the same minor and keeps it exact: a minor may add a
recommended rule the template was not checked against
([Versions](#versions)). To move it later:

```sh
bun add --dev --exact @biomejs/biome@latest
bunx biome migrate --write
```

| script | runs |
| --- | --- |
| `bun run check` | `biome check --write`: lint, format and sort imports, fixing what it can |
| `bun run lint` | `biome lint` |
| `bun run format` | `biome format --write` |
| `bun run check:ci` | `biome ci`: changes nothing, and fails on any error |
| `bun run verify` | `minimal`: `check:ci`, `typecheck`, then `test`; `api` and `graphql`: `generate --check`, then those; `react-router`: `check:ci`, `typecheck`, then `build` |

The read-only one is `check:ci`, not `ci`: `bun ci` is Bun's
`bun install --frozen-lockfile`, and a script named `ci` would only run
as `bun run ci`. A CI job runs:

```sh
bun install --frozen-lockfile
bun run verify
```

`.vscode/extensions.json` recommends Biome's extension, `biomejs.biome`,
and `.vscode/settings.json` makes it the default formatter, formatting on
save. Another editor reads `biome.json` through Biome's own extension for
it.

## Docker

Each project's `Dockerfile` builds it on Bun's official `oven/bun:1`
image, Debian's, and runs it on `oven/bun:1-alpine`, as that image's
non-root `bun` user (uid 1000). The installs are
`--frozen-lockfile`, from the `bun.lock` the command's `bun install`
wrote: commit it.

Each one builds in a stage of its own, and the image holds the build
output alone: no `node_modules`, no sources. The dependencies are inside
the bundle, so the image is the base image and a few hundred kilobytes to
a few megabytes: about 130 MB, where the same build on `oven/bun:1` is
about 345 MB.

The build stages stay on Debian: the tools a build runs, Vite's,
Tailwind's and any package's install script, are tried on glibc first,
and Alpine saves nothing there, since the stage is not shipped. What is
shipped is JavaScript, which Bun runs the same on musl. A native addon is
the exception: one built for glibc alone cannot load on Alpine, and the
final stage goes back to `oven/bun:1`
([troubleshooting](troubleshooting.md#error--is-linked-against-glibc-dt_needed-libmso6-but-this-bun-build-uses-musl)). A dependency that cannot be bundled is kept external and
copied in: see
[troubleshooting](troubleshooting.md#error-cannot-find-package--from-appdistserverjs).

### `minimal`

Two stages, as `api`'s below: every dependency and `bun run build`, which
writes `dist/index.js`, then an image with `dist/` alone, running
`bun --no-install dist/index.js`. `listen`, called only when
`src/index.ts` is the entry file, stops the app on `SIGTERM` and exits.

```sh
cd my-app
docker build -t my-app .
docker run -p 3000:3000 my-app
```

### `api`

Two stages: every dependency, installed with
`bun install --frozen-lockfile`, then `bun run build`, which writes
`dist/server.js` and its source map; then an image with `dist/` alone,
running `bun --no-install dist/server.js`, `start`'s command with
Bun's `--no-install` (not create-alxia's option of the same name), so that a package missing from the bundle fails at
startup rather than being fetched from npm, written out so that Bun
is the container's process. `listen` stops the app on `SIGINT` and `SIGTERM`,
then exits: as process 1, Bun would otherwise ignore them, and `docker stop`
would wait.
Nothing is generated in the image: `src/generated/` is committed, and
`COPY . .` brings it with the rest, so the build stage runs no
`bun run generate` and needs no `openapi.yaml`.

```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* bunfig.toml* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
USER bun
EXPOSE 3000
CMD ["bun", "--no-install", "dist/server.js"]
```

`.dockerignore` keeps `node_modules`, `dist`, `.env`, the README and the
specs out of the context.

```sh
cd my-api
docker build -t my-api .
docker run -p 3000:3000 -e API_KEY=change-me my-api
```

The server listens on `PORT`, 3000 in the image; `API_KEY` is required
there, and the container exits at once without it. `-e API_DOCS=true`
serves `/docs` from the image: `openapi.yaml` is inside the bundle.

### `graphql`

The same two stages as `api`'s, `Dockerfile` and all but the file name:
`bun run build` writes `dist/server.js`, with `schema.graphql` bundled in
as text, and the image holds `dist/` alone and runs
`bun --no-install dist/server.js`. `src/generated/` is committed, so the
build generates nothing. The image sets `NODE_ENV=production`, under which
GraphiQL is off. `listen` stops the app on `SIGINT` and `SIGTERM`.

```sh
cd my-graphql-api
docker build -t my-graphql-api .
docker run -p 3000:3000 my-graphql-api
```

### `react-router`

Two stages: every dependency and `bun run build`, then an image with
`build/` alone, running `bun --no-install build/server/index.js`,
`start`'s command with `--no-install`.
`@alxia/react-router`'s plugin bundles every package into
`build/server/index.js` under `react-router build`, so `build/` needs no
`node_modules`
([Self-contained](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#self-contained)).
`.dockerignore` keeps `node_modules`, `build` and `.react-router` out of
the context.

```sh
cd my-site
docker build -t my-site .
docker run -p 3000:3000 my-site
```

The commented file, and what to change to write files from the container,
are in
[`@alxia/react-router`'s guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#docker).

## Versions

A template ships the versions it was generated with, and React Router's
lags behind its own releases. So before installing, the command
asks the registry for every dependency's versions, and writes `^` the
newest one alxia accepts, or the version alone for a dependency the
template pins exactly:

| dependency | moved to the newest within |
| --- | --- |
| `@alxia/core`, `@alxia/env`, `@alxia/graphql`, `@alxia/openapi`, `@alxia/react-router` | the ranges this `@alxia/create` was published with, such as `^0.3.1`; while the registry does not serve that version yet, the newest of its minor, `~0.3.0` |
| `typescript` | `^6.0.3 \|\| ^7.0.0`, every alxia package's peer range |
| `zod` | `^4.2.0`, `@alxia/zod`'s |
| `vite` | `^7.0.0 \|\| ^8.0.0`, `@alxia/react-router`'s |
| `react-router`, `@react-router/*` | `^8.0.0`, `@alxia/react-router`'s; the `@react-router/*` packages take `react-router`'s version, which `@react-router/node` pins exactly |
| `@biomejs/biome` | its own minor, from the exact version the template pins (`~2.5.15`): written exactly, `2.5.16`, never `^`. A minor of Biome may add a recommended rule |
| `graphql` | `^16.11.0 \|\| ^17.0.0`, `@alxia/graphql`'s; so a new project may declare `^17` where the template ships `^16.11.0` |
| `graphql-yoga` | `^5.16.0`, `@alxia/graphql`'s |
| `@graphql-codegen/cli`, `@graphql-codegen/typescript`, `@graphql-codegen/typescript-resolvers` | none: the template's exact versions, 7.4.3, 6.1.0 and 6.1.0, are kept, for the reason `@nxgt/openapi-codegen`'s are: `generate --check` |
| `@nxgt/openapi-codegen` | none: the template's exact version, `0.7.0`, is kept. Any release may write `src/generated/` differently, and `bun run verify` checks it with `generate --check` |
| anything else: `react`, `isbot`, Tailwind, `@types/*` | no alxia range: npm's `latest` |

The command prints each move, and each newer major it left out:

```
Resolving the newest versions alxia accepts...
  isbot ^5.1.36 -> ^5.2.2
  @types/node ^22 -> ^26.6.4
  typescript ^5.9.3 -> ^7.0.2
  vite ^8.0.3 -> ^8.3.2
  …
```

```
  typescript: kept to ^6.0.3 || ^7.0.0, where the newest is 7.0.2; npm's latest, 8.0.0, is outside it
```

The registry is the one `BUN_CONFIG_REGISTRY` names, else
`npm_config_registry` (which `npm create` sets), else
`https://registry.npmjs.org`. Each package's metadata has five seconds; one
that does not arrive keeps the template's version, and the command warns
and goes on.

alxia's own packages stay within the ranges they were published with, so
a project is always written with a set released together, and its patches
since. `bunx @alxia/create@latest` takes the newest set; `bun update` moves
an existing project's within its ranges.

Right after a release, npm can take a few minutes to serve a version
while the `@alxia/create` published beside it is already there. The
command then writes the newest release of the same minor, whose `^` range
takes the new version once it arrives, and says so:

```
  @alxia/core: the registry has no release within ^0.3.1 yet; wrote ^0.3.0, the newest of ~0.3.0
```

## In a script or CI

Given a directory and a template, the command asks nothing:

```sh
bun create @alxia my-api --template api --no-install
```

With no terminal and something missing, it refuses rather than guess
([Troubleshooting](troubleshooting.md#create-alxia-no-directory-given-and-no-terminal-to-ask-in)).
It exits 0 once the project is written and installed, and 1 on any
refusal or failure.
