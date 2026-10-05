# Start in 5 minutes

This page takes you from nothing to an alxia app with a route, a
middleware, a validated query, a checked environment and a test, then runs
it in development and in Docker. You need [Bun](https://bun.sh) 1.4.2 or
later, and Docker for the last step.

Every file below is checked: `bun run check:doc-snippets` type-checks them
and runs the test, in a project made of these files alone.

## Make the project

```sh
bun create @alxia my-app --template minimal
cd my-app
bun dev
```

`minimal` is the default template: one dependency, `@alxia/core`, no
generated code. (`npm create @alxia` works too; the project it writes runs
on Bun either way.) The other templates start from another shape: `api`,
spec first, from an OpenAPI document
([spec-first CRUD](recipes/spec-first-crud.md)); `graphql`
([a GraphQL API](recipes/graphql-api.md)); `react-router`, React Router's own
template served by alxia ([`@alxia/react-router`](../packages/react-router))

`bun dev` reloads `src/index.ts` on every change and prints the route table:

```text
alxia listening on http://localhost:3000/ (dev)
  GET  /
```

```sh
curl localhost:3000
# {"hello":"world"}
```

This is the route, as the template writes it:

```ts excerpt
import { alxia } from "@alxia/core";

export const app = alxia().get("/", ({ reply }) =>
  reply(200, { hello: "world" }),
);
```

An `alxia()` app is a value: `.get(path, handler)` returns it with one route
more, and `reply(status, body)` is how a handler answers. The file exports
`app` and listens only when it is the entry (`if (import.meta.main)`), so a
test imports `app` and opens no port.

## A first route

A path parameter is typed from the path: `:name` is `params.name`, a
`string`. The handler of the second route, at the end of this page, reads
four things from its context, each added by a step below:

```ts excerpt
  .get(
    "/hello/:name",
    // validate(…), below
    ({ params, query, env, requestId, reply }) =>
      reply(200, {
        message: `${query.greeting ?? env.GREETING}, ${params.name}`,
        requestId,
      }),
  );
```

## A middleware

A middleware is a plain `(ctx, next)` function. It returns `next(added)`,
and what it adds is typed in everything after it, or a reply, which ends the
request. `defineMiddleware` is for one you share between routes: this one
gives every request an id and sends it back.

```ts
// file: src/request-id.ts
import { defineMiddleware } from "@alxia/core";

export const requestId = defineMiddleware(async ({ request }, next) => {
  const id = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const response = await next({ requestId: id }); // `requestId`, typed, after this
  response.headers.set("x-request-id", id);
  return response;
});
```

`use` applies a middleware to the routes after it, and to every request no
route matches. Order is meaning: give it before the routes that read it.

```ts excerpt
export const app = alxia()
  // …
  .use(requestId)
```

## Validate the request

`validate` checks the parts of a request with any
[Standard Schema](https://standardschema.dev), Zod here (`bun add zod`), and
gives the handler the schema's output. A request it refuses is answered with
a 400 that lists every issue, before the handler runs.

```ts excerpt
  .get(
    "/hello/:name",
    validate({
      params: z.object({ name: z.string().min(2) }),
      query: z.object({ greeting: z.string().min(1).optional() }),
    }),
```

## Read the environment once

`defineEnv` (`bun add @alxia/env`) checks the environment when the module is
first imported. A missing or malformed variable stops the process before it
listens, with every issue; a variable declared `secret` prints as `***`.

```ts
// file: src/env.ts
import { defineEnv } from "@alxia/env";
import { z } from "zod";

export const env = defineEnv({
  PORT: z.coerce.number().default(3000),
  GREETING: z.string().min(1).default("Hello"),
});
```

`decorate({ env })`, above, puts it in every handler's context, typed. Here
is the whole of `src/index.ts`, with everything above in it:

```ts
// file: src/index.ts
import { alxia, validate } from "@alxia/core";
import { z } from "zod";
import { env } from "./env";
import { requestId } from "./request-id";

export const app = alxia()
  .decorate({ env })
  .use(requestId)
  .get("/", ({ reply }) => reply(200, { hello: "world" }))
  .get(
    "/hello/:name",
    validate({
      params: z.object({ name: z.string().min(2) }),
      query: z.object({ greeting: z.string().min(1).optional() }),
    }),
    ({ params, query, env, requestId, reply }) =>
      reply(200, {
        message: `${query.greeting ?? env.GREETING}, ${params.name}`,
        requestId,
      }),
  );

// Only when this file is the entry: the test imports `app` and listens on
// no port.
if (import.meta.main) {
  app.listen({
    port: env.PORT,
    onListen: ({ dev, table, url }) =>
      console.log(dev ? table : `listening on ${url}`),
  });
}
```

`params.name`, `query.greeting`, `env.GREETING` and `requestId` are each
typed, from the path, the schema, `defineEnv` and the middleware. A typo in
any of them is a compile error, not a 500.

## Test it

`app.request` calls the app in process: no server, no port.

```ts
// file: src/index.spec.ts
import { expect, test } from "bun:test";
import { app } from "./index";

test("greets by name, and echoes a request id", async () => {
  const response = await app.request("/hello/Ada?greeting=Hi", {
    headers: { "x-request-id": "r-1" },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("x-request-id")).toBe("r-1");
  expect(await response.json()).toEqual({ message: "Hi, Ada", requestId: "r-1" });
});

test("a name that is too short is a 400 naming it", async () => {
  const response = await app.request("/hello/A");
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: "validation",
    issues: [{ target: "params", path: ["name"] }],
  });
});

test("a path no route has is a 404", async () => {
  expect((await app.request("/nowhere")).status).toBe(404);
});
```

```sh
bun test
```

## Run it, build it, ship it

`bun dev` now prints two routes, and what runs before each one's handler.
Edit a route and save: the server reloads and the table prints again. A
path no route has is answered, in development, with the route it was
probably meant for:

```text
alxia listening on http://localhost:3000/ (dev)
  GET  /             anonymous
  GET  /hello/:name  anonymous › validate
```

```sh
curl localhost:3000/hellos
# {"error":"not_found","hint":"did you mean GET /hello/:name?"}
```

`bun run build` bundles the app and everything it imports into one file,
`dist/index.js`, and `bun start` runs it with `NODE_ENV=production`: no
route table, no dev error page, the URL alone.

```sh
bun run build
bun start
```

The `Dockerfile` the template wrote builds in one stage and runs in another.
The final image holds `dist/` and nothing else, no `node_modules` and no
sources:

```dockerfile excerpt
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
CMD ["bun", "--no-install", "dist/index.js"]
```

```sh
docker build -t my-app .
docker run --rm -p 3000:3000 my-app
```

## Where next

- A task to do: the [recipes](recipes/README.md): authentication, a
  spec-first CRUD, GraphQL, uploads, SSE and WebSockets, testing, errors,
  health and shutdown, caching and rate limiting, deploying.
- The reference: [`@alxia/core`'s guide](../packages/core/docs/README.md),
  and the [package table](../README.md#packages).
