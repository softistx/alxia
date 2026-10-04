# Bun builds the app and runs it: build/server/index.js is alxia's server,
# which runs on Bun. Pinned to Bun 1, the major alxia supports.

# The production dependencies alone, for the final image.
FROM oven/bun:1 AS production-dependencies
WORKDIR /app
COPY package.json bun.lock* bunfig.toml* ./
RUN bun install --frozen-lockfile --production

# Every dependency, then react-router build: build/client and
# build/server/index.js.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* bunfig.toml* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# The build and the production dependencies, run as Bun's own non-root
# user. The server listens on PORT (3000) and HOST (0.0.0.0).
FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/build ./build
USER bun
EXPOSE 3000
CMD ["bun", "build/server/index.js"]
