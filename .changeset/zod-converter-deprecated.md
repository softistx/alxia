---
"@alxia/zod": patch
---

`zodConverter` is marked `@deprecated`: it served the `convert` option of the retired `@alxia/openapi` document writer, and nothing in alxia reads it any more. It stays exported and unchanged; Zod's own `z.toJSONSchema` does the same.
