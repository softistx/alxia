# Deploying

Run `bun run build`, then `bun build/server/index.js`. The build is
[self-contained](how-it-works.md#self-contained): `build/` is all the server needs, with
no `node_modules`, unless the app keeps a package external with
`ssr.external`.

## Docker

The `react-router` template of
[`@alxia/create`](https://github.com/softistx/alxia/tree/develop/packages/create)
and the [example](https://github.com/softistx/alxia/tree/develop/examples/react-router)
ship this `Dockerfile`, on Bun's official images: built on `oven/bun:1`,
Debian's, and run on `oven/bun:1-alpine`, about 130 MB. For an app started from
`create-react-router`, it replaces the template's, which builds and runs
on Node:

```dockerfile
# Bun builds the app, and the image holds build/ alone: alxia's plugin
# bundles every dependency into build/server/index.js, alxia's server, which
# runs on Bun with no node_modules. Pinned to Bun 1, the major alxia
# supports.

# Every dependency, then react-router build: build/client and
# build/server/index.js.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* bunfig.toml* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# The build, run as Bun's own non-root user with the start script's
# command, and --no-install: with no node_modules, Bun would otherwise
# fetch a package the build left out from the registry at startup,
# where this fails.
# The server listens on PORT (3000) and HOST (0.0.0.0). On Alpine, about
# 200 MB lighter: build/ is JavaScript, which runs the same on musl. A
# native addon built for glibc alone needs oven/bun:1 here.
FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
USER bun
EXPOSE 3000
CMD ["bun", "--no-install", "build/server/index.js"]
```

```sh
docker build -t my-app .
docker run -p 3000:3000 my-app
```

Keep the template's `.dockerignore` beside it: `node_modules`, `build` and
`.react-router` stay out of the context, so the image installs and builds
its own. The `bunfig.toml` goes in, and `bun run build` runs React
Router's CLI on Bun, as it does outside Docker. The image's command is
`start`'s, run directly, so the platform's `SIGTERM` reaches the server,
with `--no-install`: a package missing from `build/` then fails at
startup, where Bun would otherwise fetch it from npm.

- **Commit `bun.lock`.** The installs are `--frozen-lockfile`: the image
  gets the versions you tested, and a `package.json` changed without a
  `bun install` fails the build
  ([troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#error-lockfile-had-changes-but-lockfile-is-frozen)).
- **The final stage is Alpine's**, musl where the build stage has glibc.
  `build/` is JavaScript, which runs the same on both. A native addon
  kept external and built for glibc alone does not load there: put the
  final stage back on `oven/bun:1`
  ([`@alxia/create`'s troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/create/docs/troubleshooting.md#error--is-linked-against-glibc-dt_needed-libmso6-but-this-bun-build-uses-musl)).
- **The server runs as `bun`**, a user with no write access to `/app`.
  Write files to a volume the user owns
  ([troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#eacces-permission-denied-open-app)).
- **The image holds `build/` alone**, no `node_modules`: the build is
  [self-contained](how-it-works.md#self-contained). An app that keeps a package external
  with `ssr.external` copies the production dependencies too, from a
  stage of their own:

  ```dockerfile
  # Before the build stage: the production dependencies alone.
  FROM oven/bun:1 AS production-dependencies
  WORKDIR /app
  COPY package.json bun.lock* bunfig.toml* ./
  RUN bun install --frozen-lockfile --production

  # In the final stage, beside build/.
  COPY --from=production-dependencies /app/node_modules ./node_modules
  ```

  Without it, the container stops at startup with
  `Cannot find package '…'`
  ([troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#error-cannot-find-package--from-appbuildserverindexjs)).

`PORT` and `HOST` set where the server listens. The platform's `SIGTERM`
stops it once the requests in flight are answered, within
`shutdownTimeout`, and runs the app's `onStop` hooks. Give the platform a
readiness probe with `@alxia/core`'s `health()`, mounted in `beforeAll`.
