---
"@alxia/graphql": minor
---

Accept `graphql-yoga` 6 as a peer: the range is now `^5.16.0 || ^6.0.0`. The package's specs run against Yoga 6.0.1 and need no change in `src`. Yoga 6 changes its `logging` option: a custom logger is now a `@graphql-hive/logger` `Logger` (Yoga calls `child` on it), no longer a bare `{ debug, info, warn, error }` object. `logging: false` and Yoga's plugins at their 4.x releases (`@graphql-yoga/plugin-*`, which require Yoga 6) are the other things to align when moving to Yoga 6.
