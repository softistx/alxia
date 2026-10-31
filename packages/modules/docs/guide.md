# Guide

## Layout

One folder per module under a folder of modules, and one file other modules
may import:

```
src/modules/
  registry.ts
  accounts/module.ts   accounts/public.ts   accounts/...internals
  notes/module.ts      notes/public.ts      notes/...internals
```

`public.ts` is the module's `api`: the only file another module imports, and
only when its manifest lists the module in `dependsOn`.

## Declaring a module

```ts
import { defineModule } from '@alxia/modules';
import { api } from './public';

export const notes = defineModule({
	name: 'notes',
	dependsOn: ['accounts'],
	collections: { notes: notesCollection },
	coreCollections: {},
	typeDefs: [noteSdl],
	resolvers: { Query: { notes: listNotes } },
	services: (scope) => createNoteService(scope),
	permissions: ['notes:read', 'notes:write'],
	defaultGrants: { editor: ['notes:read', 'notes:write'] },
	codes: ['notes.errors.locked'],
	texts: { en: { 'notes.errors.locked': 'This note is locked.' } },
	migrations: [addNoteIndex],
	jobs: { purgeOld },
	emits: ['note.created'],
	subscribers: { 'account.closed': archiveNotes },
	api,
});
```

Every field but `name` is optional. `defineModule` returns the manifest
frozen and keeps its literal type, which the registry types read. The field
values are the host's: a collection is whatever your database layer defines
one with, `resolvers` whatever your GraphQL layer types, a migration whatever
your runner takes. The package reads their keys, never their shape.

## The registry

```ts
export const registered = [accounts, notes] as const;
export const modules = resolveModules(registered);
```

`resolveModules` checks the list and returns it in dependency order (ties keep
the list order). It throws a `ModuleGraphError` for a module named twice, a
`dependsOn` name that is not in the list, a cycle, and a collection name two
modules declare. Collection names prefixed by their module are a convention
for the host; nothing here enforces it.

Register the list once so the types know it:

```ts
declare module '@alxia/modules' {
	interface Register {
		modules: typeof registered;
	}
}
```

Without it, `ModuleMongo<Name>` accepts any name and any collection.

## Readers

| Reader | Returns |
| --- | --- |
| `typeDefsOf`, `codesOf` | the lists concatenated in order |
| `permissionsOf` | every permission once |
| `defaultGrantsOf` | permissions by role, merged across modules |
| `collectionsOf`, `coreCollectionsOf` | collections by name |
| `migrationsOf`, `coreMigrationsOf` | migrations in order, a module after its `dependsOn` |
| `jobsOf` | `{ name: '<module>.<job>', module, job }` for each job |
| `textsOf` | `{ [locale]: { [key]: text } }`, a key repeated in one locale is refused |

Pass them the resolved list so the order is the dependency order.

## Jobs

```ts
const purgeOld: ModuleJob = {
	schedule: { cron: '0 3 * * *', timezone: 'UTC' },
	attempts: 3,
	backoff: { base: '1m' },
	run: async (scope, now) => { /* work for one scope */ },
};
```

The host decides what a scope is and runs `jobsOf(modules)` on its queue under
each `name`. The package schedules nothing.

## Typing collection access

`ModuleMongo<'notes'>` is the record of collections `notes` owns plus those of
the modules in its `dependsOn` (one level, not transitive). A name outside it
is a compile error:

```ts
declare const mongo: ModuleMongo<'notes'>;
mongo.notes; // ok
mongo.accounts; // ok, accounts is in dependsOn
mongo.billing; // error: Property 'billing' does not exist
```

To narrow a host handle that has a `db` keyed by collection name and a
`transaction`, use `ModuleHandle<'notes', MyHandle>`; `tx` inside a
transaction is narrowed too.

## Testing boundaries

```ts
await assertBoundaries(modules, 'src/modules/**/*.ts', {
	surface: 'public', // default
});
```

It reads the matched files and throws one error listing every violation:
a module importing a file of another module other than its `public` surface,
or importing its surface without naming it in `dependsOn`. Only relative
imports are followed; spec files and folders that are not a registered module
are skipped. `boundaryViolations(files, registry, options)` is the pure
version for your own fixtures.
