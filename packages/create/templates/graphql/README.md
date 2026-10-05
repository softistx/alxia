# An alxia GraphQL API

An [alxia](https://github.com/softistx/alxia) app serving GraphQL with
[GraphQL Yoga](https://the-guild.dev/graphql/yoga-server), made with
`bun create @alxia`. It is schema first: `schema.graphql` is the contract,
the resolvers are typed from it, and the endpoint is a route of the app,
behind its middlewares.

```sh
bun dev                    # http://localhost:3000/graphql, GraphiQL in a browser
```

```sh
curl localhost:3000/graphql -H 'content-type: application/json' \
  -d '{"query":"{ __typename }"}'
curl localhost:3000/graphql -H 'content-type: application/json' \
  -H 'authorization: Bearer ada-token' \
  -d '{"query":"mutation { addNote(text: \"Hello\") { id author { name } } }"}'
```

- `schema.graphql`: the API's types, `Query`, `Mutation` and `Subscription`.
  Change it first.
- `src/generated/resolvers.ts`: what `bun run generate` writes from it, with
  [GraphQL Code Generator](https://the-guild.dev/graphql/codegen)
  (`codegen.ts`): the schema's types and `Resolvers`, typed with the app's
  context. Never edit it.
- `src/resolvers.ts`: the resolvers, `const resolvers: Resolvers`. A field the
  schema lacks, or a value its type refuses, is a compile error, and each
  resolver reads `viewer`, `db` and `env` from its context, typed.
- `src/context.ts`: the base app and its middleware. `viewerOf` reads
  `Authorization: Bearer <token>` and gives every resolver `viewer`: the
  user, or `null`. `Context` is `GraphQLContext<typeof base>`, which
  `codegen.ts` hands to `Resolvers`.
- `src/schema.ts`, `src/app.ts`: `createSchema` from `schema.graphql` and the
  resolvers, then `health()`'s probes (`GET /health`, `GET /ready`) and
  `graphql(app, { schema })` mounted on the base.
- `src/env.ts`: `defineEnv` from
  [`@alxia/env`](https://www.npmjs.com/package/@alxia/env): `PORT`, checked
  once, when the module is first imported. A malformed one stops the
  process with every issue, before it listens.
- `src/store.ts`: the in-memory users, tokens and notes, and the pub/sub the
  subscription reads. Swap it for your database.
- `src/server.ts`: listens on `env.PORT`, 3000 by default, and shuts down
  gracefully on `SIGINT` and `SIGTERM`, which `listen` handles.
- `src/app.spec.ts`: POST `/graphql` through `app.request()`, no port:
  queries, the mutation with and without a token, and the subscription.
- `biome.json`: Biome's lint and format settings ([Lint and format](#lint-and-format)).

## The schema first

A new field starts in `schema.graphql`:

1. Add it: `notesBy(userId: ID!): [Note!]!` on `Query`, say.
2. `bun run generate`: `Resolvers` now has `notesBy`, with its arguments typed.
3. Write the resolver in `src/resolvers.ts`: `notesBy: (_, { userId }, { db }) => …`.
4. `bun test`: add a query to `src/app.spec.ts`.

`src/generated/` is committed, so the project builds with no generation step,
in Docker too. `bun run verify` runs `bun run generate --check` first: it
fails when `src/generated/` is not what `schema.graphql` gives. GraphQL Code
Generator's CLI and its two plugins are pinned exactly, since another release
may write the file differently: after moving them, run `bun run generate`.

## Authentication

`viewerOf` in `src/context.ts` is a middleware given to `use`: it reads the
bearer token and passes `next({ viewer })`, so the base's type has `viewer`,
and `GraphQLContext<typeof base>` gives it to every resolver. It refuses
nothing, so a query may be anonymous: `me` is `null`. `addNote` throws a
`GraphQLError` with the code `UNAUTHENTICATED` when `viewer` is `null`. The
tokens in `src/store.ts` are for development (`ada-token`): verify a JWT with
[`@alxia/jwt`](https://www.npmjs.com/package/@alxia/jwt)'s `bearer`, or look
a session up, in the same place.

## Subscriptions

`noteAdded` is served over server-sent events, Yoga's default: a request
with `Accept: text/event-stream` gets a result each time `addNote` publishes.
WebSockets are not served.

```sh
curl -N localhost:3000/graphql -H 'content-type: application/json' \
  -H 'accept: text/event-stream' \
  -d '{"query":"subscription { noteAdded { text author { name } } }"}'
```

The pub/sub lives in one process: across several, back it with a broker, as
[Yoga's guide](https://the-guild.dev/graphql/yoga-server/docs/features/subscriptions)
describes.

## Environment

Bun loads `.env` on every command, and `src/env.ts` checks what it finds. Copy
`.env.example` to `.env` to set `PORT`. GraphiQL follows alxia's dev
switch: on under `bun dev`, which sets `NODE_ENV=development`, off
otherwise — `bun start` and the image run with `NODE_ENV=production`.

```sh
cp .env.example .env
```

## Test

```sh
bun test           # src/app.spec.ts: in process, no port
bun run typecheck
bun run generate   # src/generated/, from schema.graphql
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

`bun run build` bundles the server, its dependencies and `schema.graphql`
into one file, `dist/server.js`, minified, with its source map beside it, and
`bun start` runs it: what production and the image run.

```sh
bun run build    # dist/server.js and dist/server.js.map
bun start        # NODE_ENV=production bun dist/server.js
```

`bun start` before any build fails with `Module not found
"dist/server.js"`: build first. `dist/` needs Bun and nothing else, no
`node_modules`. A dependency that cannot be bundled, a native addon, is left
out with `--external <name>` in the `build` script, and must then be
installed beside `dist/`.

## Docker

The `Dockerfile` builds in a stage of its own, on `oven/bun:1`, and runs
on `oven/bun:1-alpine`. The build stage installs every dependency with
`--frozen-lockfile`, from the `bun.lock` that `bun install` wrote (commit
it), and runs `bun run build`. The image holds `dist/` alone, no
`node_modules` and no `src/`, and runs `bun --no-install dist/server.js` as
its non-root `bun` user. `listen` drains the app and exits on `SIGTERM`,
so `docker stop` is immediate.

```sh
docker build -t my-graphql-api .
docker run --rm -p 3000:3000 my-graphql-api
```

Next: [`@alxia/graphql`'s guide](https://github.com/softistx/alxia/tree/develop/packages/graphql/docs):
Yoga's plugins, the IDE, the typed context. And
[`@alxia/core`'s](https://github.com/softistx/alxia/tree/develop/packages/core/docs).
