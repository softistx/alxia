# React Router on alxia

React Router's official template, served by
[alxia](https://github.com/softistx/alxia/tree/develop/packages/core) under
Bun through
[`@alxia/react-router`](https://github.com/softistx/alxia/tree/develop/packages/react-router).
The setup is three lines. The rest of the example shows what an optional
`app/server.ts` adds on top.

It lives in alxia's workspace and uses the packages by `workspace:^`. It is
never published.

## 1. Create the app

```sh
bunx create-react-router@latest my-app
cd my-app
```

This example was made that way: the default template, with Tailwind, its
welcome page and its `ErrorBoundary`. Its files are kept as generated,
except where the steps below change them, its package name, and a
`.gitignore` line for the spec's copies. That includes
`@react-router/serve`, which `start` no longer uses and an app of your own
can remove.

## 2. Add alxia

```sh
bun add @alxia/core @alxia/react-router
```

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

That is all. There is no server file: alxia's default server serves the
pages in `react-router dev` and from the build, with the client's hashed
files cached immutable.

## 3. Customise it (optional)

`app/server.ts`, with `createServer()` as its default export, puts alxia's
hooks around every page and its data. The plugin picks it up in dev and in
the build. Here it adds:

| file | |
| --- | --- |
| `app/server.ts` | `logger()`, `compress()`, and `secureHeaders()` with a policy React Router's inline scripts, its `<Form>` posts and the template's Google Fonts pass (the default blocks all three). Also a session deriving `user`, `POST /api/todos` validated by a Zod schema, `getLoadContext` setting React Router's own `userContext`, and the `Register` declaration that types `alxiaOf(context)` |
| `app/session.server.ts` | sessions in memory, keyed by the `sid` cookie. A hook reads the `Cookie` header itself; only a route handler gets `ctx.cookies`. Anyone may sign in by name: there is no real authentication |
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
`Bun.CookieMap` and the spec.

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

`bun run test` takes about a second and a half. It builds the app and runs
`bun build/server/index.js` on a free port. It then sends requests with a
browser's user agent: Bun's own is a bot to `isbot`, which gets the finished
page, never a stream. It also builds a copy without `app/server.ts`, which
checks the default server.

The template's `Dockerfile` is kept as generated, and it no longer works:
it is based on a Node image with no Bun, and copies a `package-lock.json`
the example does not have. The package's
[guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#deploying)
says how to deploy with Bun.

## Read more

- [The `@alxia/react-router` README](https://github.com/softistx/alxia/blob/develop/packages/react-router/README.md): the quick start, `createServer`'s options and the API.
- [Its guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md): how dev and the build work, customising the server, typing the loaders, the app's own keys, escape hatches, testing and deploying.
- [Its troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md): each message, and the traps that print none, the secure-headers policy among them.
- [`@alxia/logger`](https://github.com/softistx/alxia/tree/develop/packages/logger), [`@alxia/compress`](https://github.com/softistx/alxia/tree/develop/packages/compress) and [`@alxia/secure-headers`](https://github.com/softistx/alxia/tree/develop/packages/secure-headers): the plugins `app/server.ts` uses.
