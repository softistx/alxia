import { expectTypeOf } from 'bun:test';
import type {
	CollectionsOf,
	ModuleCoreHandle,
	ModuleCoreMongo,
	ModuleHandle,
	ModuleMongo,
	ModuleName,
	ViewOf,
} from '@alxia/modules';
import type { registered } from './registry';

// The names are the registered ones.
expectTypeOf<ModuleName>().toEqualTypeOf<
	'base' | 'notes' | 'audit' | 'comments'
>();
// @ts-expect-error not a registered module
type _Unknown = ModuleMongo<'billing'>;

// A module sees its own collections and those of its dependsOn.
expectTypeOf<keyof ModuleMongo<'notes'>>().toEqualTypeOf<'notes' | 'tags'>();
expectTypeOf<keyof ModuleMongo<'base'>>().toEqualTypeOf<'tags'>();
expectTypeOf<keyof ModuleMongo<'audit'>>().toEqualTypeOf<'audit'>();
expectTypeOf<keyof CollectionsOf>().toEqualTypeOf<
	'notes' | 'tags' | 'audit' | 'comments'
>();
expectTypeOf<ViewOf<typeof registered, 'notes'>['name']>().toEqualTypeOf<
	'notes' | 'base'
>();

// The probe: a collection it neither owns nor depends on is an error.
declare const mongo: ModuleMongo<'notes'>;
mongo.notes;
mongo.tags;
// @ts-expect-error audit belongs to a module notes does not depend on
mongo.audit;

// Direct dependencies only: comments depends on notes, notes on base.
declare const chained: ModuleMongo<'comments'>;
chained.comments;
chained.notes;
// @ts-expect-error tags is base's, two steps away
chained.tags;

// A host's handle narrowed the same way.
interface Handle {
	readonly db: { notes: 1; tags: 2; audit: 3 };
	transaction<T>(
		fn: (tx: Handle) => Promise<T>,
		options?: { retry: 1 },
	): Promise<T>;
}
declare const handle: ModuleHandle<'notes', Handle>;
handle.db.notes;
// @ts-expect-error audit is not reachable from notes
handle.db.audit;
handle.transaction(async (tx) => {
	tx.db.tags;
	// @ts-expect-error still narrowed inside a transaction
	tx.db.audit;
});

// The core database follows the same rule through `coreCollections`.
expectTypeOf<keyof ModuleCoreMongo<'notes'>>().toEqualTypeOf<'accounts'>();
expectTypeOf<keyof ModuleCoreMongo<'audit'>>().toEqualTypeOf<never>();
interface CoreHandle {
	readonly db: { accounts: 1; other: 2 };
	transaction<T>(fn: (tx: CoreHandle) => Promise<T>): Promise<T>;
}
declare const core: ModuleCoreHandle<'notes', CoreHandle>;
core.db.accounts;
// @ts-expect-error other is not a core collection of notes or base
core.db.other;
