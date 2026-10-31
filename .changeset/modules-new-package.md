---
"@alxia/modules": minor
---

New package: `defineModule`, a module manifest (collections, GraphQL, permissions and default grants, texts, migrations, jobs, events, api), `resolveModules` ordering and checking a registry, readers (`typeDefsOf`, `permissionsOf`, `migrationsOf`, `jobsOf`, `textsOf`, ...), `ModuleMongo` typing collection access to what a module owns or depends on through the `Register` hook, and `assertBoundaries`, a test helper holding the boundaries between modules.
