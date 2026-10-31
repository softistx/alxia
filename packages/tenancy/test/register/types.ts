import { expectTypeOf } from 'bun:test';
import { defineModule } from '@alxia/modules';
import type { Mongo } from '@nxgt/mongo';
import type { TenantStore } from '../../src';

const base = defineModule({
	name: 'base',
	collections: { tags: { kind: 'tags' } as const },
	coreCollections: { accounts: { kind: 'accounts' } as const },
});
const notes = defineModule({
	name: 'notes',
	dependsOn: ['base'],
	collections: { notes: { kind: 'notes' } as const },
});
const audit = defineModule({
	name: 'audit',
	collections: { audit: { kind: 'audit' } as const },
});
const registered = [base, notes, audit] as const;

declare module '@alxia/modules' {
	interface Register {
		modules: typeof registered;
	}
}

// A host's database wiring, keyed by collection name.
interface Tenant {
	tags: 1;
	notes: 2;
	audit: 3;
}
interface Core {
	accounts: 4;
	other: 5;
}
declare const store: TenantStore<Tenant, Core, never, never>;
declare const source: { mongo: Mongo<Tenant>; core: Mongo<Core> };

// The scope hands a module its own collections and its dependsOn ones.
const scope = store.forModule(source, 'notes');
scope.mongo.db.notes;
scope.mongo.db.tags;
// @ts-expect-error audit is not notes' nor its dependency's
scope.mongo.db.audit;
scope.core.db.accounts;
// @ts-expect-error other is no module's core collection
scope.core.db.other;
// @ts-expect-error not a registered module
store.forModule(source, 'billing');
expectTypeOf(store.forModule(source, 'audit').mongo.db).toHaveProperty('audit');
