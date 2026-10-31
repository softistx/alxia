---
"@alxia/redis": minor
---

The `@nxgt/redis` peer range is now `^0.9.0` (was `^0.7.0 || ^0.8.0 || ^0.9.0`). The workspace's floor-peers check needs every package to agree on the lowest `@nxgt/redis` it builds against, and `@alxia/events` needs 0.9.0, the first release with the queue. An app on `@nxgt/redis` 0.7 or 0.8 bumps it to 0.9.
