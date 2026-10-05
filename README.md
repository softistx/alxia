# alxia

alxia is a type-safe HTTP framework for Bun, spec first, and GraphQL is just
as welcome. The OpenAPI document is the contract: the routes are bound to the
operations generated from it, a test fails when one is missing, and the server's
types check each handler, what its middlewares add, its replies against what
it declares, and its path. A GraphQL API is schema first in the same way, its
resolvers typed from the schema and reading the same typed context, behind
the same middlewares. Modular to the bone: the core has **no dependency**, and
everything else (Zod, OpenAPI, GraphQL, CORS, JWT, Redis) is a package you add,
or don't.

```sh
bun create @alxia my-app
```

It asks for a template (`--template` names it) and writes the project,
installs it, and prints `cd my-app` and `bun dev`:

- `minimal`, the default: one route, one dependency, a test and a Dockerfile
- `api`: OpenAPI spec first, the operations generated from `openapi.yaml`,
  a typed test client
- `graphql`: GraphQL schema first, typed resolvers, subscriptions, GraphiQL
- `react-router`: React Router's official template, served by alxia

(`npm create @alxia` works too.) A route, validated, with its replies declared:

```ts
// file: server.ts
import { alxia, responds, validate } from '@alxia/core';
import { zq } from '@alxia/zod';
import { z } from 'zod';

const User = z.object({ id: z.number(), name: z.string() });

export const app = alxia().get(
	'/users/:id',
	validate({ params: z.object({ id: zq.int() }) }), // params.id: number
	responds({ 200: User, 404: z.object({ error: z.literal('not_found') }) }), // a reply is one of these
	({ params, reply }) => (params.id === 1 ? reply(200, { id: 1, name: 'Ada' }) : reply(404, { error: 'not_found' })),
);

app.listen(3000); // in a test, in process: await app.request('/users/1')
```

## Where to go

- **[Start in 5 minutes](docs/start.md)**: a project, a route, a middleware,
  `validate`, `defineEnv`, a test, `bun run dev`, `bun run build`, Docker.
- **[The recipes](docs/recipes/README.md)**: one page per task, each with a
  complete example that runs: [authentication](docs/recipes/authentication.md),
  [a spec-first CRUD](docs/recipes/spec-first-crud.md),
  [a GraphQL API](docs/recipes/graphql-api.md),
  [file uploads](docs/recipes/file-uploads.md),
  [SSE and WebSockets](docs/recipes/sse-and-websockets.md),
  [testing](docs/recipes/testing.md),
  [errors](docs/recipes/errors.md),
  [health and shutdown](docs/recipes/health-and-shutdown.md),
  [caching and rate limiting](docs/recipes/caching-and-rate-limiting.md),
  [deploying](docs/recipes/deploying.md).
- **[The packages](#packages)**: each has a README, and a `docs/` with its
  guide, troubleshooting and roadmap. [`@alxia/core`'s](packages/core/docs/README.md)
  is the place to read how a route, a middleware and a reply work.

## Packages

| Package | |
| --- | --- |
| [`@alxia/core`](packages/core) | routes on `Bun.serve`, validated with any Standard Schema; replies typed by status; middlewares, groups and plugins; cookies, server-sent events and WebSockets, typed; static files and Bun's HTML bundles |
| [`@alxia/zod`](packages/zod) | Zod 4: query and path coercions (`zq.int()`, `zq.array()`…) |
| [`@alxia/graphql`](packages/graphql) | GraphQL with Yoga and its plugins: behind the app's middlewares, resolvers reading its typed context, subscriptions over SSE, GraphiQL or Apollo Sandbox |
| [`@alxia/react-router`](packages/react-router) | a React Router app served by alxia, under Bun: server rendering behind the app's middlewares, loaders reading its typed context, `/api` routes beside the pages; one Vite plugin, no server file needed, for the dev server and a runnable build |
| [`@alxia/openapi`](packages/openapi) | OpenAPI spec first: the routes bound to the operations `@nxgt/openapi-codegen` generates from the document, and a test that every operation has its route (`matchesSpec`, and with `strict: true` no other). Named `@alxia/openapi-routes` until 0.4 |
| [`@alxia/cors`](packages/cors) | CORS: a middleware that answers preflights before routing and adds its headers to every response |
| [`@alxia/secure-headers`](packages/secure-headers) | HSTS, CSP, nosniff and the rest |
| [`@alxia/rate-limit`](packages/rate-limit) | a rate limit: a 429 past it, with its headers; pluggable stores |
| [`@alxia/cache`](packages/cache) | HTTP response caching: TTL, stale-while-revalidate, one load per miss, tags, ETags; in memory or Redis |
| [`@alxia/language`](packages/language) | the request's language, typed: query, cookie, path, `Accept-Language` |
| [`@alxia/compress`](packages/compress) | zstd, Brotli, gzip, deflate: negotiated and streamed |
| [`@alxia/jwt`](packages/jwt) | JWTs on Web Crypto, and a typed bearer guard |
| [`@alxia/logger`](packages/logger) | a request id, structured logs, `Server-Timing` |
| [`@alxia/env`](packages/env) | environment variables, validated and typed at startup |
| [`@alxia/context-storage`](packages/context-storage) | the request's context anywhere it runs, typed by the app: `hono/context-storage` for alxia |
| [`@alxia/create`](packages/create) | `bun create @alxia`: a new app from a template (`minimal`, `api`, `graphql` or `react-router`), its dependencies at the newest versions alxia accepts |

Adapters to the [nxgt](https://github.com/softistx) suite:

| Package | |
| --- | --- |
| [`@alxia/telemetry`](packages/telemetry) | traces and logs on `@nxgt/telemetry`: a server span per request, named for its route |
| [`@alxia/redis`](packages/redis) | on `@nxgt/redis`: shared rate-limit and response-cache stores, idempotent routes, typed caches and locks |
| [`@alxia/i18n`](packages/i18n) | translations on `@nxgt/i18n`: `t()` in the request's language, typed keys, ICU |
| [`@alxia/janus`](packages/janus) | identities, sessions and permissions on `@nxgt/janus`: the user typed, the cookie renewed, refusals typed |

Not one package declares a dependency: what one needs at runtime — `zod`,
`graphql-yoga`, `@nxgt/*`, `@alxia/core` — is a peer, the app's own copy.

## Examples

- [`examples/react-router`](examples/react-router): React Router's official
  template served by alxia: three lines to set up, then an optional
  `app/server.ts` with a session, an `/api`, secure headers and a streamed
  page. Run `bun run dev` in its folder after `bun install` and
  `bun run build` at the repository root.

## Development

Bun 1.4.2 or later.

```sh
bun install
bun run build        # first, in dependency order: packages resolve each other through dist/
bun run typecheck
bun run test         # @alxia/redis needs REDIS_URL, or redis-server on PATH
bun run verify:artifacts
bun run check:docs   # no broken link or anchor, and every snippet of the recipes type-checks
./node_modules/.bin/biome check --write
```

The repository skeleton — the workspace, `build.ts`, Biome, changesets, the
release workflow and `verify:artifacts` — comes from
[softistx/nxgt-http](https://github.com/softistx/nxgt-http).
