---
"@alxia/core": minor
"@alxia/client": minor
"@alxia/openapi": minor
---

Named server-sent events: `eventStream({ state: State, ping: Ping })` sends each event with its `event:` line, and `id:` and `retry:` when given; `@alxia/client` reads them as a union discriminated by `event`, and `@alxia/openapi` documents one object per name.
