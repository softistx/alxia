# Bun bundles the app and its dependencies into dist/server.js, and the
# image holds dist/ alone: no node_modules, no src/. Pinned to Bun 1, the
# major alxia supports.

# Every dependency, then bun run build: dist/server.js and its source map.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* bunfig.toml* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# The bundle, run as Bun's own non-root user with the start script's
# command, written out so that Bun is the container's process, and
# --no-install: with no node_modules, Bun would otherwise fetch a package
# the build left out from the registry at startup, where this fails. The
# server listens on PORT (3000); set API_KEY. On Alpine, about 200 MB
# lighter: the bundle is JavaScript, which runs the same on musl. A native
# addon built for glibc alone needs oven/bun:1 here.
FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
USER bun
EXPOSE 3000
CMD ["bun", "--no-install", "dist/server.js"]
