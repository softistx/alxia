# Guide

How `bun create @alxia` asks, what each template writes, and how it
chooses the versions it writes.

- [Running it](#running-it)
- [The `api` template](#the-api-template)
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
Which template? api or react-router [api]
```

then writes the project, runs `bun install` in it, and prints what to run
next:

```
Done: my-app holds the api template. Next:

  cd my-app
  bun dev
```

| option | default | |
| --- | --- | --- |
| `[dir]` | asked, `alxia-app` | where to write: empty, or not there yet |
| `--template <name>`, `--template=<name>`, `-t <name>` | asked, `api` | `api` or `react-router` |
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

Both templates are files shipped in this package, under
`templates/api/` and `templates/react-router/`, and copied as they are:
nothing is downloaded but the dependencies. `package.json` is written
again, with the directory's name, alxia's versions and the newest of the
others ([Versions](#versions)); in every other text file, the template's
own name, as a whole word, becomes the project's. Three files are stored
under another name and take theirs back on the copy: `gitignore` is
written as `.gitignore` and `_bunfig.toml` as `bunfig.toml`, since `bun
publish` leaves those out of a tarball, and `_biome.json` as `biome.json`,
since alxia's own Biome refuses a second root configuration inside its
repository ([Lint and format](#lint-and-format)).

## The `api` template

```
my-api/
├── src/
│   ├── app.ts        the app, and its type
│   ├── app.spec.ts   bun test: app.request(), no port
│   └── server.ts     app.listen(PORT), stopped on SIGTERM
├── package.json
├── tsconfig.json
├── biome.json        Biome: lint, format, imports sorted
├── .vscode/          Biome's extension recommended, format on save
├── Dockerfile        bun run build, then dist/ alone, on oven/bun:1-alpine
├── .dockerignore
├── .env.example      PORT and API_KEY, for a .env Bun loads
├── .gitignore
└── README.md
```

`src/app.ts` is one route, `POST /todos`, with what a real one needs: a
body validated by a Zod schema, a declared reply, and a middleware of its own.

```ts
import { alxia, defineMiddleware, responds, validate } from "@alxia/core";
import { z } from "zod";

const Todo = z.object({ id: z.number(), title: z.string(), done: z.boolean() });
const NewTodo = z.object({ title: z.string().min(1) });

/** Set API_KEY in the environment: this default is for development. */
export const apiKey = Bun.env["API_KEY"] ?? "dev-key";

// A middleware of the routes it is given to: it answers 401 without the key,
// before the body is read.
const requireKey = defineMiddleware(({ request, reply }, next) =>
  request.headers.get("x-api-key") === apiKey
    ? next()
    : reply(401, { error: "unauthorized" as const }),
);

const todos: z.infer<typeof Todo>[] = [];

export const app = alxia()
  .decorate({ todos })
  .post(
    "/todos",
    requireKey,
    validate({ body: NewTodo }),
    responds({ 201: Todo }),
    ({ body, todos, reply }) => {
      const todo = { id: todos.length + 1, title: body.title, done: false };
      todos.push(todo);
      return reply.created(todo);
    },
  );

export type App = typeof app;
```

- The middlewares run in the order given. `requireKey` stands before
  `validate`, so it runs before the body is read: a request without the key
  is a 401 whatever its body
  ([A route's middlewares](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/middleware.md#a-routes-middlewares)).
- `validate({ body: NewTodo })` answers an empty `title` with a 400 naming
  `title`, before the handler runs; the handler reads `body` typed by it.
- `responds({ 201: Todo })` types the handler's `reply` and checks what it
  sends.
- `todos` lives in memory: replace the array with your database, given to
  the routes the same way, by `decorate`.

`src/app.spec.ts` calls the app in process, no port, with `app.request()`
and a JSON body:

```ts
const response = await app.request("/todos", {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": apiKey },
  body: JSON.stringify({ title: "Write a route" }),
});
expect(response.status).toBe(201);
```

alxia is OpenAPI spec first: a typed client for other programs is generated
from the API's OpenAPI document, with the generator of your choice, such as
`@nxgt/openapi-codegen`, rather than read from the app's type.

The scripts:

| script | runs |
| --- | --- |
| `bun dev` | `bun --watch src/server.ts`: restarted on every change, on `PORT` or 3000 |
| `bun test` | the spec |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run build` | `bun build src/server.ts --target=bun --outdir=dist --minify --sourcemap=linked`: one file, its dependencies bundled |
| `bun start` | `bun dist/server.js`: the build, after `bun run build` |
| `bun run check` | `biome check --write`: lint, format, sort imports, fixing what it can |
| `bun run lint`, `bun run format` | `biome lint`, `biome format --write` |
| `bun run check:ci` | `biome ci`: read-only, for CI |
| `bun run verify` | `check:ci`, `typecheck`, then `test` |

`start` runs what `build` wrote, as production and the image do:

```sh
bun run build && bun start
```

`dist/server.js` holds every dependency, so it runs on a host that has Bun
and no `node_modules`. It is minified, and `dist/server.js.map` beside it
is linked from it: Bun reads the map, so a stack trace names the lines of
`src/`. `bun dev` and `bun test` run the TypeScript as it is, with no
build.

Bun loads `.env` on every command. `.env.example` names the two variables
the app reads, `PORT` (3000 by default) and `API_KEY` (`dev-key` by
default, for development only): copy it to `.env`, which `.gitignore`
keeps out of git and `.dockerignore` out of the image.

`tsconfig.json` holds the settings alxia's own packages are checked under:
`strict`, and past it `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`,
`noUnusedLocals` and the rest. Hence `Bun.env["API_KEY"]` and not
`Bun.env.API_KEY`, and Biome's `useLiteralKeys`, which would ask for the
second, is off in `biome.json`. Loosen what you would rather not keep:
alxia's types compile under each one, and under none.

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
+    "start": "bun build/server/index.js",
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
in `bun dev` and from the build. To put alxia's hooks or `/api` routes in
front of the pages, write it out and edit it:

```sh
bunx alxia-react-router reveal
```

The [`@alxia/react-router` guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md)
goes from there.

## Lint and format

Both projects lint and format with [Biome](https://biomejs.dev), in one
style whichever template wrote them. Their `biome.json` is a root
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
project's skips `dist/` instead of `build/` and `.react-router/`, has no
CSS settings and no overrides, and turns `complexity.useLiteralKeys` off
in place of `noEmptyPattern` ([the `api` template](#the-api-template)).

- **The style is Biome's default but for spaces**: two spaces, double
  quotes, 80 columns. React Router's scaffold is written so, and so is
  the `package.json` the command writes: formatting the scaffold once
  changed three of its files, where tabs would change every line. The
  `api` project takes the same style, so the two read alike.
- **`$schema` is the installed Biome's own schema**, so an editor checks
  the file against the version `bun install` put in `node_modules`,
  whichever the command wrote.
- **What is generated is skipped.** `files.includes` leaves `dist/`, or
  `build/` and `.react-router/`, out, and `vcs.useIgnoreFile` every path
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
| `bun run verify` | `check:ci`, `typecheck`, then `test` (`api`) or `build` (`react-router`) |

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

### `api`

Two stages: every dependency, installed with
`bun install --frozen-lockfile`, then `bun run build`, which writes
`dist/server.js` and its source map; then an image with `dist/` alone,
running `bun --no-install dist/server.js`, `start`'s command with
Bun's `--no-install` (not create-alxia's option of the same name), so that a package missing from the bundle fails at
startup rather than being fetched from npm, written out so that Bun
is the container's process. `src/server.ts` stops the app on `SIGTERM`:
as process 1, Bun would otherwise ignore it, and `docker stop` would wait.

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

The server listens on `PORT`, 3000 in the image; set `API_KEY`, whose
default is for development.

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
| `@alxia/core`, `@alxia/react-router` | the ranges this `@alxia/create` was published with, such as `^0.3.1`; while the registry does not serve that version yet, the newest of its minor, `~0.3.0` |
| `typescript` | `^6.0.3 \|\| ^7.0.0`, every alxia package's peer range |
| `zod` | `^4.2.0`, `@alxia/zod`'s |
| `vite` | `^7.0.0 \|\| ^8.0.0`, `@alxia/react-router`'s |
| `react-router`, `@react-router/*` | `^8.0.0`, `@alxia/react-router`'s; the `@react-router/*` packages take `react-router`'s version, which `@react-router/node` pins exactly |
| `@biomejs/biome` | its own minor, from the exact version the template pins (`~2.5.15`): written exactly, `2.5.16`, never `^` |
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
