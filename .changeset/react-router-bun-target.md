---
"@alxia/react-router": minor
---

`alxia()` now builds the server for Bun, with nothing to configure. In Vite's `ssr` environment, under `react-router dev` and `react-router build`, it adds the `bun` export condition to `resolve.conditions` and `resolve.externalConditions`, so a package that exports a `bun` variant is bundled, and loaded in dev, as that variant; adds `bun` and `bun:*` to `resolve.builtins`, so Bun's own modules stay imports of `build/server/index.js` whichever runtime runs Vite; and sets `build.target` to `esnext`. What the app sets is kept: its own conditions and builtins are merged with these, and a `build.target` it set, at the top level or on the environment, wins. The guide has a Built for Bun section, and Deploying a multi-stage `Dockerfile` on `oven/bun:1`.
