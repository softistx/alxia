---
"@alxia/tenancy": minor
---

`ModuleWiringError` and `UnknownMigrationError` gain a namespaced `code` (`tenancy.module-wiring`, `tenancy.unknown-migration`). `single` compares the database names to tell whether the core database is apart. The refusal codes `tenancy.errors.*` are unchanged, and the README gives the reason.
