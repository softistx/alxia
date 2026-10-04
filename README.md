# alxia

A type-safe HTTP framework for Bun. Modular to the bone: the core has **no
dependency**, and everything else — Zod, OpenAPI, CORS, JWT, compression —
is a package you add, or don't.

OpenAPI spec first: the document is the contract. The routes are bound to
the operations generated from it, and a typed client is generated from it
by the generator of your choice — the `api` template uses
[`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen),
and [`@alxia/openapi`](packages/openapi) checks that the app routes every
operation of the document, and no other. The server's types check each
handler: what its middlewares add, its replies against its `responds`, its
path.

## Getting started

```sh
bun create @alxia my-app
```

It asks for a template — `api`, a spec-first alxia app: an `openapi.yaml`,
the operations generated from it, its routes, a middleware and a spec — or `react-router`, React Router's official template served by
alxia — writes the project, installs it, and prints `cd my-app` and
`bun dev` ([`@alxia/create`](packages/create)).

## Packages

| Package | |
| --- | --- |
| [`@alxia/core`](packages/core) | routes on `Bun.serve`, validated with any Standard Schema; replies typed by status; hooks, groups and plugins; cookies, server-sent events and WebSockets, typed; static files and Bun's HTML bundles |
| [`@alxia/zod`](packages/zod) | Zod 4: query and path coercions (`zq.int()`, `zq.array()`…), and a Zod schema as JSON Schema |
| [`@alxia/graphql`](packages/graphql) | GraphQL with Yoga and its plugins: behind the app's hooks, resolvers reading its typed context, subscriptions over SSE, GraphiQL or Apollo Sandbox |
| [`@alxia/react-router`](packages/react-router) | a React Router app served by alxia, under Bun: server rendering behind the app's hooks, loaders reading its typed context, `/api` routes beside the pages; one Vite plugin, no server file needed, for the dev server and a runnable build |
| [`@alxia/openapi`](packages/openapi) | OpenAPI spec first: the routes bound to the operations `@nxgt/openapi-codegen` generates from the document, and a test that every operation has its route, and no other (`matchesSpec`). Formerly `@alxia/openapi-routes`, now deprecated |
| [`@alxia/cors`](packages/cors) | CORS: preflights before routing, headers on every response |
| [`@alxia/secure-headers`](packages/secure-headers) | HSTS, CSP, nosniff and the rest |
| [`@alxia/rate-limit`](packages/rate-limit) | a rate limit: a 429 past it, with its headers; pluggable stores |
| [`@alxia/cache`](packages/cache) | HTTP response caching: TTL, stale-while-revalidate, one load per miss, tags, ETags; in memory or Redis |
| [`@alxia/language`](packages/language) | the request's language, typed: query, cookie, path, `Accept-Language` |
| [`@alxia/compress`](packages/compress) | zstd, Brotli, gzip, deflate: negotiated and streamed |
| [`@alxia/jwt`](packages/jwt) | JWTs on Web Crypto, and a typed bearer guard |
| [`@alxia/logger`](packages/logger) | a request id, structured logs, `Server-Timing` |
| [`@alxia/env`](packages/env) | environment variables, validated and typed at startup |
| [`@alxia/context-storage`](packages/context-storage) | the request's context anywhere it runs, typed by the app: `hono/context-storage` for alxia |
| [`@alxia/create`](packages/create) | `bun create @alxia`: a new app from a template, `api` or React Router's own, its dependencies at the newest versions alxia accepts |

Adapters to the [nxgt](https://github.com/softistx) suite:

| Package | |
| --- | --- |
| [`@alxia/telemetry`](packages/telemetry) | traces and logs on `@nxgt/telemetry`: a server span per request, named for its route |
| [`@alxia/redis`](packages/redis) | on `@nxgt/redis` and `@nxgt/redis-guard`: shared rate-limit and response-cache stores, idempotent routes, typed caches and locks |
| [`@alxia/i18n`](packages/i18n) | translations on `@nxgt/i18n`: `t()` in the request's language, typed keys, ICU |
| [`@alxia/janus`](packages/janus) | identities, sessions and permissions on `@nxgt/janus`: the user typed, the cookie renewed, refusals typed |

Not one package declares a dependency: what one needs at runtime — `zod`,
`graphql-yoga`, `@nxgt/*`, `@alxia/core` — is a peer, the app's own copy.

```ts
// server.ts
import { alxia, responds, validate } from '@alxia/core';
import { cors } from '@alxia/cors';
import { logger } from '@alxia/logger';
import { zq } from '@alxia/zod';
import { z } from 'zod';

const app = alxia()
	.plugin(logger())
	.plugin(cors())
	.get(
		'/users/:id',
		validate({ params: z.object({ id: zq.int() }) }),
		responds({ 200: z.object({ id: z.number(), name: z.string() }), 404: z.object({ error: z.literal('not_found') }) }),
		({ params, reply }) => (params.id === 1 ? reply(200, { id: 1, name: 'Ada' }) : reply(404, { error: 'not_found' })),
	);

app.listen(3000);

// a test, in process
const found = await app.request('/users/1');
found.status; // 200
```

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
./node_modules/.bin/biome check --write
```

The repository skeleton — the workspace, `build.ts`, Biome, changesets, the
release workflow and `verify:artifacts` — comes from
[softistx/nxgt-http](https://github.com/softistx/nxgt-http).
