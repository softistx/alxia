---
"@alxia/graphql": minor
"@alxia/create": patch
---

Accept `graphql-yoga` 6 as a peer: the range is now `^5.16.0 || ^6.0.0`, and `@alxia/create` writes the same range. No change in the package's source. Both majors are verified in CI: the required job runs the specs on Yoga 6, the "Floor peers" job on Yoga 5.16 with the 3.x `@graphql-yoga/plugin-*`.

Yoga 6 changes its `logging` option: a custom logger must be a `@graphql-hive/logger` `Logger`, no longer a bare `{ debug, info, warn, error }` object (`log.child is not a function`). See the troubleshooting page.
