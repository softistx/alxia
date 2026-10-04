---
"@alxia/context-storage": minor
---

`contextStorage()` with no type argument is typed by the app `@alxia/core`'s `Register` names (`BaseContext` when none), and the plugin, typed either way, requires that context of the app that uses it: `alxia().use(contextStorage<typeof base>())`, whose `context()` would claim keys no hook of that app adds, is now a compile error. New type: `StoredContext<App>`.
