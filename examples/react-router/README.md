# React Router on alxia

React Router's official template, served by
[alxia](https://github.com/softistx/alxia/tree/develop/packages/core) under
Bun through
[`@alxia/react-router`](https://github.com/softistx/alxia/tree/develop/packages/react-router).
The setup is four small changes. The rest of the example shows what an optional
`app/server.ts` adds on top.

It declares the packages by their npm versions (`^0.1.0`), as an app of
your own would. Inside alxia's workspace, Bun links those ranges to the
local packages, so CI runs it against the code in this repository, and each
release moves the ranges with it. It is never published.

## 1. Create the app

```sh
bunx create-react-router@latest my-app
cd my-app
```

This example was made that way: the default template, with Tailwind, its
welcome page and its `ErrorBoundary`. Its files are kept as generated,
except where the steps below change them, its package name, a
`.gitignore` line for the spec's copies, and its `Dockerfile`, which runs
on Bun ([5. Docker](#5-docker)). That includes
`@react-router/serve`, which `start` no longer uses and an app of your own
can remove.

## 2. Add alxia

```sh
bun add @alxia/core @alxia/react-router
bun add -d typescript@^6
```

The template comes with TypeScript 5.9. alxia's packages ask for 6 or 7,
so `bun add` warns until it is raised; 7 works too.

```diff
 // vite.config.ts
+import { alxia } from "@alxia/react-router/vite";
 import { reactRouter } from "@react-router/dev/vite";
 import tailwindcss from "@tailwindcss/vite";
 import { defineConfig } from "vite";

 export default defineConfig({
-  plugins: [tailwindcss(), reactRouter()],
+  plugins: [tailwindcss(), reactRouter(), alxia()],
   resolve: {
     tsconfigPaths: true,
   },
 });
```

```diff
 // package.json
-    "start": "react-router-serve ./build/server/index.js",
+    "start": "bun build/server/index.js",
```

```toml
# bunfig.toml, a new file beside package.json
[run]
bun = true
```

The `react-router` CLI is a Node script (`#!/usr/bin/env node`): where a
node is installed, `bun run dev` would start it on Node, and alxia's
server needs Bun. `bun = true` makes `bun run` start it on Bun.

That is all. The plugin also builds the server for Bun: packages resolve
their `bun` export condition, and `bun` and `bun:*` stay imports of the
build
([Built for Bun](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#built-for-bun)).
There is no server file: alxia's default server serves the
pages in `react-router dev` and from the build, with the client's hashed
files cached immutable.

## 3. Customise it (optional)

`app/server.ts`, with `createServer()` as its default export, puts alxia's
hooks around every page and its data. The plugin picks it up in dev and in
the build. Here it adds:

| file | |
| --- | --- |
| `app/server.ts` | `logger()`, `compress()`, and `secureHeaders()` with `nonce: true` and a policy React Router's scripts, its `<Form>` posts and the template's Google Fonts pass (the default blocks all three); `script-src` has a fresh nonce per request, no `'unsafe-inline'`. Also a session deriving `user`, `POST /api/todos` validated by a Zod schema, `getLoadContext` setting React Router's own `userContext`, and the `Register` declaration that types `alxiaOf(context)` |
| `app/entry.server.tsx` | React Router's own, from `bunx react-router reveal entry.server`, plus three lines: `nonceOf(loadContext)` from `@alxia/react-router`, given to `<ServerRouter nonce>` and to `renderToPipeableStream` (below) |
| `app/session.server.ts` | sessions in memory, keyed by the `sid` cookie, which the `derive` reads from the request's `cookies`. Anyone may sign in by name: there is no real authentication |
| `app/todos.server.ts` | the todos, in memory, and `NewTodo`, the schema both the page's form and the API's body are validated with |
| `app/context.ts` | `userContext`, a React Router context key, for a route that does not import alxia |
| `app/routes/home.tsx` | the template's home page. Its loader reads `user` and `log` with `alxiaOf(context)`, typed by `Register` |
| `app/routes/login.tsx` | a sign-in action that sets the session cookie and redirects, or returns `data({ error }, { status: 400 })` |
| `app/routes/todos.tsx` | a todo list: a `<Form>`, the schema's message with a 400, the new todo under the name from `context.get(userContext)` |
| `app/routes/slow.tsx` | a page streamed behind `<Await>`: the shell and its fallback first, the deferred value 400 ms later |
| `app/server.spec.ts` | the app as it ships (see below) |

The added dependencies are `@alxia/logger`, `@alxia/compress`,
`@alxia/secure-headers` and `zod`. `@types/bun` is a dev dependency, and
`"bun"` is added to the tsconfig's `types` for the session's
`Bun.Cookie` and the spec.

The nonce takes three lines in the revealed entry, and every script React
Router and React render then carries the one the response's policy names:

```diff
 import { PassThrough } from "node:stream";

+import { nonceOf } from "@alxia/react-router";
 import type { EntryContext, RouterContextProvider } from "react-router";
 …
     const { pipe, abort } = renderToPipeableStream(
-      <ServerRouter context={routerContext} url={request.url} />,
+      <ServerRouter
+        context={routerContext}
+        url={request.url}
+        nonce={nonceOf(loadContext)}
+      />,
       {
+        nonce: nonceOf(loadContext),
         [readyOption]() {
```

The `<ServerRouter>` line is one line made longer; the formatter wraps it.
`biome.json` turns `useConst` off for that file, so the template's `let`s
stay as generated.

`app/server.ts` is optional for a new app, but this example's routes read
what it derives (`user`, `log`), so they need it. Within alxia's
repository the example also has a `test` script and a `biome.json`, which
keeps the template's code style under the repository's Biome.

## 4. Run it

From alxia's repository root, once, since the example imports the packages'
`dist/`:

```sh
bun install
bun run build
```

Then, in `examples/react-router`:

```sh
bun run dev        # Vite with HMR, alxia answering the pages and /api: http://localhost:5173
bun run build      # build/client, and build/server/index.js
bun run start      # bun build/server/index.js, on PORT (3000) and HOST (0.0.0.0)
bun run typecheck  # react-router typegen, then tsc
bun run test       # the spec
```

`bun run test` takes about four seconds. It builds the app and runs
`bun build/server/index.js` on a free port. It then sends requests with a
browser's user agent: Bun's own is a bot to `isbot`, which gets the finished
page, never a stream. It starts `react-router dev` on a free port too, and
checks there and in the build that every script carries the nonce of its
response's policy, a new one each time. It also builds a copy without
`app/server.ts`, which checks the default server, and resolves Vite's
config to check that the server build resolves the `bun` condition and
targets `esnext`.

## 5. Docker

The template's `Dockerfile` builds and runs on Node, which no longer runs
the app once `start` runs Bun. This one replaces it, the same one
[`@alxia/create`](https://github.com/softistx/alxia/tree/develop/packages/create)'s
`react-router` template ships: multi-stage, every dependency and
`bun run build` in a stage of their own on `oven/bun:1`, and a final
image on `oven/bun:1-alpine`, about 130 MB, holding `build/` alone, no
`node_modules`, running
`bun --no-install build/server/index.js` as the image's non-root `bun`
user. The
plugin bundles every package into `build/server/index.js` under
`react-router build`, so `build/` needs nothing else
([Self-contained](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#self-contained)).
The template's `.dockerignore` is kept.

```sh
docker build -t react-router-example .
docker run -p 3000:3000 react-router-example
```

Inside alxia's repository the example has no `bun.lock` of its own, the
workspace's is at the root, so the image resolves the published
`@alxia/*` versions its `package.json` names. Until
`@alxia/react-router` 0.4.0, the first whose plugin bundles the build, is
published, that image's container stops at startup with
[`Cannot find package '…'`](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#error-cannot-find-package--from-appbuildserverindexjs):
its `build/` still imports the packages the image does not hold. An app of your own commits
its `bun.lock`, which the image installs from with `--frozen-lockfile`.
The package's
[guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#docker)
has the commented file.

## Read more

- [The `@alxia/react-router` README](https://github.com/softistx/alxia/blob/develop/packages/react-router/README.md): the quick start, `createServer`'s options and the API.
- [Its guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md): how dev and the build work, customising the server, typing the loaders, the app's own keys, the CSP nonce, escape hatches, testing and deploying.
- [Its troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md): each message, and the traps that print none, the secure-headers policy among them.
- [`@alxia/logger`](https://github.com/softistx/alxia/tree/develop/packages/logger), [`@alxia/compress`](https://github.com/softistx/alxia/tree/develop/packages/compress) and [`@alxia/secure-headers`](https://github.com/softistx/alxia/tree/develop/packages/secure-headers): the plugins `app/server.ts` uses.
