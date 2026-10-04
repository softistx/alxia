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
# command. The server listens on PORT (3000) and HOST (0.0.0.0).
FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
USER bun
EXPOSE 3000
CMD ["bun", "build/server/index.js"]
