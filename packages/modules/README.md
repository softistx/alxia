# @alxia/modules

Modules for an application: one manifest per module (its collections, GraphQL,
permissions, texts, migrations, jobs and events), a registry resolved in
dependency order, collection access typed to what a module owns or depends
on, and a test that holds the boundaries between modules. No dependency, and
no tie to a database, a GraphQL server or the rest of alxia.

```sh
bun add @alxia/modules
bun add -d typescript
```

## In 30 seconds

```ts
// src/modules/notes/module.ts
import { defineModule } from '@alxia/modules';

export const notes = defineModule({
	name: 'notes',
	dependsOn: ['accounts'],
	collections: { notes: notesCollection },
	typeDefs: [noteSdl],
	permissions: ['notes:read', 'notes:write'],
	defaultGrants: { editor: ['notes:read', 'notes:write'] },
	texts: { en: { 'notes.errors.locked': 'This note is locked.' } },
});

// src/modules/registry.ts
import { resolveModules } from '@alxia/modules';

export const registered = [accounts, notes] as const;
export const modules = resolveModules(registered); // dependency order, checked

declare module '@alxia/modules' {
	interface Register {
		modules: typeof registered;
	}
}
```

The application reads everything from the resolved list, never from a module
by name:

```ts
import { migrationsOf, permissionsOf, textsOf, typeDefsOf } from '@alxia/modules';

typeDefsOf(modules); // GraphQL SDL, dependency order
permissionsOf(modules); // every permission once
migrationsOf(modules); // a module after what it depends on
```

Type a module's database access to what it may touch:

```ts
import type { ModuleMongo } from '@alxia/modules';

type NotesDb = ModuleMongo<'notes'>; // its collections and accounts'
```

Hold the boundaries in a spec:

```ts
import { assertBoundaries } from '@alxia/modules';

test('modules only meet through public.ts', async () => {
	await assertBoundaries(modules, 'src/modules/**/*.ts');
});
```

`assertBoundaries` needs Bun (it reads files with `Bun.Glob` and `Bun.file`); the
rest of the package is plain TypeScript.

## API

| Export | What it does |
| --- | --- |
| `defineModule(definition)` | the manifest, frozen, with its literal type kept |
| `resolveModules(list)` | checks the list and returns it in dependency order; throws `ModuleGraphError` |
| `typeDefsOf`, `codesOf`, `permissionsOf`, `defaultGrantsOf`, `collectionsOf`, `coreCollectionsOf`, `migrationsOf`, `coreMigrationsOf`, `jobsOf`, `textsOf` | what the host reads from a resolved list |
| `assertBoundaries(registry, glob, options)` | a test helper: throws listing every import that breaks the boundaries (Bun only) |
| `boundaryViolations(files, registry, options)`, `importsOf(text)` | the pure checker, and the import scanner it uses |
| `ModuleGraphError` | the error `resolveModules` and the readers throw |
| `Register` | merged by the app to name its registry |
| `ModuleMongo`, `ModuleHandle`, `ModuleName`, `CollectionsOf`, `CoreCollectionsOf`, `ViewOf`, `Registered` | the types derived from the registry |
| `Module`, `ModuleDefinition`, `ModuleJob`, `NamedJob`, `BoundaryOptions`, `BoundaryViolation` | the other types |

`typescript` is the only peer, for the declarations.

## Documentation

- [Guide](https://github.com/softistx/alxia/blob/develop/packages/modules/docs/guide.md): declaring a module, the registry and its readers, jobs, typed collection access, testing boundaries.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/modules/docs/troubleshooting.md): an error message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/modules/docs/roadmap.md): what is coming, and what is not planned.
- [Recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md): [Start in 5 minutes](https://github.com/softistx/alxia/blob/develop/docs/start.md).
