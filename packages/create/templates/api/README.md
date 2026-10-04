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

`bun run build` bundles the server and its dependencies into one file,
`dist/server.js`, minified, with its source map beside it, and `bun start`
runs it: what production and the image run.

```sh
bun run build    # dist/server.js and dist/server.js.map
bun start        # bun dist/server.js
```

`bun start` before any build fails with `Module not found
"dist/server.js"`: build first. `dist/` needs Bun and nothing else, no
`node_modules`. Bun reads the
source map, so a stack trace names the lines of `src/`. `bun dev` and
`bun test` run the TypeScript as it is, with no build.

A dependency that cannot be bundled, a native addon, is left out with
`--external <name>` in the `build` script, and must then be installed
beside `dist/`.

## Docker

The `Dockerfile` builds in a stage of its own, on `oven/bun:1`: it
installs every dependency with `--frozen-lockfile`, from the `bun.lock`
that `bun install` wrote (commit it), and runs `bun run build`. The image
holds `dist/` alone, no `node_modules` and no `src/`, and runs
`bun dist/server.js` as its non-root `bun` user.

```sh
docker build -t my-api .
docker run --rm -p 3000:3000 -e API_KEY=change-me my-api
```

Next: [Getting started](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/getting-started.md)
and the rest of [`@alxia/core`'s guide](https://github.com/softistx/alxia/tree/develop/packages/core/docs).
