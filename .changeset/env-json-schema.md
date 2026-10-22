---
'@alxia/env': minor
---

`envExample` describes any schema that carries a Standard JSON Schema (`~standard.jsonSchema.input`): its type and `description` are read from it when the Zod, Valibot and ArkType readers do not fit the schema, or find no description. A form that throws is treated as absent; the output for Zod, Valibot and ArkType is unchanged.
