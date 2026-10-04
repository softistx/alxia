---
"@alxia/create": patch
---

Every template's `Dockerfile` now runs the app on `oven/bun:1-alpine`, the build stages staying on `oven/bun:1`: each image is about 130 MB, where it was about 345 MB, and still runs as the non-root `bun` user. The `api` project's `src/server.ts` stops the app on `SIGINT` and `SIGTERM`, so `docker stop` no longer waits for its timeout. A native addon built for glibc alone does not load on Alpine: the troubleshooting page says to put the final stage back on `oven/bun:1`.
