---
'@alxia/create': patch
---

Every template's `Dockerfile` builds, and the image holds the build output alone, no `node_modules`. The `api` template's builds `dist/server.js` (now `--minify --sourcemap=linked`) and runs it; its `start` runs `bun dist/server.js` after `bun run build`, where it ran `src/server.ts`. The `react-router` template's copies `build/` alone, which `@alxia/react-router`'s plugin now bundles whole. New projects get that `@alxia/react-router`.
