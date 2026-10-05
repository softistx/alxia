---
"@alxia/telemetry": minor
---

Trace a WebSocket upgrade with a span that ends with its answer, and, behind `@alxia/graphql`'s `ws: true`, each operation on the socket with a span of its own, a child of the upgrade's: named `subscription OnNote`, with `graphql.operation.*`, from its start to its end, an error when answered with errors.
