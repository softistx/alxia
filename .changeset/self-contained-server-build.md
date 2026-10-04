---
'@alxia/react-router': minor
---

`react-router build` now bundles every package into `build/server/index.js`, React, React Router and alxia included: the `ssr` environment gets `resolve.noExternal: true` in the build, never in dev. `build/` runs on Bun with no `node_modules`, so a Docker image's final stage copies it alone. What the app sets wins: `ssr.external: ['sharp']` keeps those packages external, and `ssr.external: true` keeps every package external, as before.
