---
"@alxia/create": patch
---

The templates' server prints `@alxia/core`'s route table in dev, through `listen({ onListen })`, and `listening on <url>` in production.

`bun start` runs the build with `NODE_ENV=production`, in every template, so a project started outside its image is not in dev.
