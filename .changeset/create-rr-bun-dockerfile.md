---
"@alxia/create": patch
---

The `react-router` template's `Dockerfile` now builds and runs the app on Bun, in place of React Router's Node one: multi-stage on `oven/bun:1`, the production dependencies in a stage of their own, `bun run build`, then `bun build/server/index.js` as the image's non-root `bun` user. `docker build` works in a new project as it is written. The project's `README.md` gives Bun's commands where React Router's wrote npm's: `bun install`, `bun dev`, `bun run build`, and `bun.lock` among the files to deploy.
