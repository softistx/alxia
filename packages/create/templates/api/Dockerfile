# Bun runs the app's TypeScript as it is: no build stage, the image holds
# src/ and the production dependencies. Pinned to Bun 1, the major alxia
# supports.

# The production dependencies alone, for the final image.
FROM oven/bun:1 AS production-dependencies
WORKDIR /app
COPY package.json bun.lock* bunfig.toml* ./
RUN bun install --frozen-lockfile --production

# The app and its production dependencies, run as Bun's own non-root user
# with the start script's command, written out so that Bun is the
# container's process. The server listens on PORT (3000); set API_KEY.
FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY src ./src
USER bun
EXPOSE 3000
CMD ["bun", "src/server.ts"]
