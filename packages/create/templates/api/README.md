# An alxia API

An [alxia](https://github.com/softistx/alxia) app with
[Zod](https://zod.dev), made with `bun create @alxia`.

- `src/app.ts`: the app. `POST /todos` validates its body with Zod, and
  its own hook, `requireKey`, answers 401 without the `x-api-key` header.
- `src/server.ts`: listens on `PORT`, 3000 by default.
- `src/app.spec.ts`: `app.request()` and `@alxia/client`, no port.

## Environment

Bun loads `.env` on every command. Copy `.env.example` to `.env` to set
`PORT` and `API_KEY`. Outside development, set `API_KEY`: its default,
`dev-key`, is for development only.

```sh
cp .env.example .env
```

## Develop

```sh
bun dev          # http://localhost:3000, restarted on every change
```

```sh
curl -X POST localhost:3000/todos \
  -H 'content-type: application/json' -H 'x-api-key: dev-key' \
  -d '{"title":"Write a route"}'
```

## Test

```sh
bun test         # src/app.spec.ts: in process, and through the typed client
bun run typecheck
```

## Build

Bun runs the TypeScript as it is: `bun start` serves `src/server.ts`, with
no build step. `bun run build` bundles the server and its dependencies into
one file, for a host with Bun and no `node_modules`:

```sh
bun run build    # dist/server.js
bun dist/server.js
```

## Docker

The `Dockerfile` installs the production dependencies on `oven/bun:1` and
runs `src/server.ts` as the image's non-root `bun` user. It installs with
`--frozen-lockfile`, from the `bun.lock` that `bun install` wrote: commit
it.

```sh
docker build -t my-api .
docker run --rm -p 3000:3000 -e API_KEY=change-me my-api
```

Next: [Getting started](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/getting-started.md)
and the rest of [`@alxia/core`'s guide](https://github.com/softistx/alxia/tree/develop/packages/core/docs).
