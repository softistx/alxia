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

More in [docs/](docs/README.md): the [guide](docs/guide.md), the
[troubleshooting](docs/troubleshooting.md) page and the [roadmap](docs/roadmap.md).
