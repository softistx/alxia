---
"@alxia/create": patch
---

The `api` template is now plain files that the command copies, as the `react-router` one is, and it gains the base files a project needs to ship: a `Dockerfile` on `oven/bun:1` that installs the production dependencies with `--frozen-lockfile` and runs `src/server.ts` as the image's non-root `bun` user, a `.dockerignore`, and a `.env.example` naming `PORT` and `API_KEY`. Its `start` script now runs `bun src/server.ts`, since Bun runs the TypeScript as it is; `bun run build` still bundles `dist/server.js` for a host with no `node_modules`. Its README has a section each for developing, testing, building and Docker.
