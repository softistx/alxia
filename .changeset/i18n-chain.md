---
"@alxia/i18n": minor
---

A key-level fallback chain and catalogues loaded at runtime. The `fallbacks` option, `i18n.fallBackTo(language)` (a step for the request running) and `i18n.chain()`: `t()` tries the request's language, its steps, `fallbacks(language)` then `fallback`, and answers the key only when all miss; nothing changes while they are unused. `createI18n<Key>({ languages?, fallback, resources? })` types the keys by name, `i18n.setResources(resources)` swaps the catalogues atomically with `supported` following, and a request keeps the catalogues it started with.
