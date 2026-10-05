# Deploy with Docker

**The problem.** You want an image that is small, starts fast, runs as an
unprivileged user, holds nothing it does not need, stops on `docker stop`
without a reset, and behaves in production as it was tested: the dev
conveniences off, the configuration from the environment, the secrets not in
the image.

Every template of `bun create @alxia` writes a `Dockerfile` that does this.
This recipe reads it, rule by rule, so you can write your own.

## The rules

1. **Build in a build stage.** `bun run build` runs on `oven/bun:1`, with
   every dependency installed, from a frozen lockfile.
2. **The final image holds the build output only**: no `node_modules`, no
   sources. `bun build --target=bun` bundles the app and its dependencies
   into one file, `dist/server.js`; that file is all the image needs.
3. **The final stage is `oven/bun:1-alpine`**, the build stages stay on
   `oven/bun:1`. A bundle is JavaScript, which runs the same on musl. A
   dependency with a native addon built for glibc needs `oven/bun:1` there.
4. **`NODE_ENV=production`** in the final image.
5. **A non-root user** (`USER bun`, the image's own) and **`--no-install`**:
   with no `node_modules`, Bun would otherwise fetch a package the build
   left out from the registry at startup, where it fails.
6. **The server is process 1**, in the exec form of `CMD`, so the signal
   reaches it ([graceful shutdown](health-and-shutdown.md)).

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
CMD ["bun", "--no-install", "dist/server.js"]
```

The `package.json` script it builds with:

```json
{
  "scripts": {
    "build": "bun build src/server.ts --target=bun --outdir=dist --minify --sourcemap=linked",
    "start": "NODE_ENV=production bun dist/server.js"
  }
}
```

Copying `package.json` and the lockfile before the sources keeps the
`bun install` layer cached until a dependency changes. A `.dockerignore`
keeps what must not reach the build context:

```text
node_modules
dist
.env
.env.local
README.md
**/*.spec.ts
```

`bun.lock` is committed: `--frozen-lockfile` fails the build when it does
not match `package.json`, which is the point.

## What the bundle needs beside it

The bundle holds the JavaScript and what it imports, and an import of a file
is bundled with it. A file the code **reads at run time** is not:
`Bun.file('openapi.yaml')`, `apiDocs({ spec: 'openapi.yaml' })` with a path,
a template read from disk. In the image there is nothing beside `dist/`, so
import it instead, and Bun bundles it:

```ts no-check
import spec from '../openapi.yaml'; // an object: apiDocs({ spec })
import typeDefs from '../schema.graphql' with { type: 'text' }; // a string, for Yoga
```

A dependency that cannot be bundled, a native addon, is named
`--external <name>` in the build, and installed beside `dist/` in the final
stage.

## Production, as it was tested

`NODE_ENV=production` is what turns the development helpers off: `listen`
prints the URL alone, no route table; a 404 carries no hint; a 500 carries
no stack and no error page. Whatever else you keyed on it is yours:
GraphiQL (`ide: Bun.env['NODE_ENV'] === 'production' ? false : 'graphiql'`)
and `apiDocs({ enabled: … })` in the recipes.

The configuration comes from the environment, read once at startup by
[`defineEnv`](../../packages/env/docs/define-env.md): a missing or malformed
variable stops the process **before it listens**, naming every issue, and a
secret prints as `***`. So a wrong deployment fails its first probe loudly
instead of failing on a request. Give the secrets at run time, never in the
image or an `ENV` line:

```sh
docker build -t my-app .
docker run --rm -p 3000:3000 -e API_KEY=… -e DATABASE_URL=… my-app
```

## Check it as CI does

Build the image, run it, answer it, and stop it. The stop must be
immediate, not after the ten seconds Docker waits before it kills:

```sh
docker build -t my-app .
docker run -d --name my-app -p 3000:3000 my-app
curl --fail --retry 10 --retry-connrefused localhost:3000/health
time docker stop my-app   # well under 10 s: the app handled SIGTERM
docker rm my-app
```

`bun run verify:templates`, in the alxia repository, does this for each
template: written, installed, type-checked, tested, built, its production
server answered, then its Dockerfile built and the image answered.

## The other templates

The same shape, a different output:

| Template | Build output | `CMD` |
| --- | --- | --- |
| `minimal` | `dist/index.js` | `bun --no-install dist/index.js` |
| `api`, `graphql` | `dist/server.js` | `bun --no-install dist/server.js` |
| `react-router` | `build/` (`build/client`, `build/server/index.js`) | `bun --no-install build/server/index.js` |

The React Router build is done by Vite; alxia's plugin bundles every
dependency into `build/server/index.js`, so the final stage copies `build/`
alone and the server listens on `PORT` and `HOST`
([`@alxia/react-router`](../../packages/react-router)).

## On a platform

The container needs the probes of [health and shutdown](health-and-shutdown.md):
`/health` for liveness, `/ready` for readiness, and a termination grace
period longer than `shutdownTimeout`. Behind a proxy or a load balancer,
give the app an `ip` option that reads the header it sets
(`alxia({ ip: (request) => request.headers.get('x-real-ip') ?? undefined })`),
so a rate limit counts clients, not the proxy, and
[a shared store](caching-and-rate-limiting.md) when there are several replicas.

## Reference

- [Serving](../../packages/core/docs/guide/serving.md): port, TLS, behind a proxy
- [Development](../../packages/core/docs/guide/development.md): what `NODE_ENV` switches
- [`@alxia/create`'s guide](../../packages/create/docs/guide.md) and its
  [troubleshooting](../../packages/create/docs/troubleshooting.md)
- [`@alxia/env`](../../packages/env): the environment, checked
