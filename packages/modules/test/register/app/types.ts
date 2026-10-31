import { expectTypeOf } from 'bun:test';
import type {
	CollectionsOf,
	ModuleHandle,
	ModuleMongo,
	ModuleName,
	ViewOf,
} from '@alxia/modules';
import type { registered } from './registry';

// The names are the registered ones.
expectTypeOf<ModuleName>().toEqualTypeOf<'base' | 'notes' | 'audit'>();
// @ts-expect-error not a registered module
type _Unknown = ModuleMongo<'billing'>;

// A module sees its own collections and those of its dependsOn.
expectTypeOf<keyof ModuleMongo<'notes'>>().toEqualTypeOf<'notes' | 'tags'>();
expectTypeOf<keyof ModuleMongo<'base'>>().toEqualTypeOf<'tags'>();
expectTypeOf<keyof ModuleMongo<'audit'>>().toEqualTypeOf<'audit'>();
expectTypeOf<keyof CollectionsOf>().toEqualTypeOf<'notes' | 'tags' | 'audit'>();
expectTypeOf<ViewOf<typeof registered, 'notes'>['name']>().toEqualTypeOf<
	'notes' | 'base'
>();

// The probe: a collection it neither owns nor depends on is an error.
declare const mongo: ModuleMongo<'notes'>;
mongo.notes;
mongo.tags;
// @ts-expect-error audit belongs to a module notes does not depend on
mongo.audit;

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
