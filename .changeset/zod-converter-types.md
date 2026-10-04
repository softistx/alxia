---
"@alxia/zod": patch
---

`zodConverter(schema, side)` takes a Zod schema directly: its parameter type now accepts what Zod's `~standard.jsonSchema` takes, where TypeScript refused a Zod schema passed outside `@alxia/openapi`'s converter option. Its docs no longer name the retired `@alxia/openapi` document writer: it is a Zod schema as JSON Schema 2020-12, as it crosses the wire.
