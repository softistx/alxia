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
# command, written out so that Bun is the container's process. The server
# listens on PORT (3000); set API_KEY.
FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
USER bun
EXPOSE 3000
CMD ["bun", "dist/server.js"]
