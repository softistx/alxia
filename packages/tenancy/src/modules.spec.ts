import { describe, expect, test } from 'bun:test';
import { defineModule } from '@alxia/modules';
import { marker, openCore, openTenantDb } from '../test/harness';
import { ModuleWiringError, single } from '.';
import { bindModules } from './modules';

const collection = { kind: 'collection' };

describe('bindModules', () => {
	test('migrations come from the registry in dependency order, then the explicit ones', () => {
		const a = defineModule({ name: 'a', migrations: [marker('a1')] });
		const b = defineModule({
			name: 'b',
			dependsOn: ['a'],
			migrations: [marker('b1')],
			coreMigrations: [marker('c1')],
		});
		const bound = bindModules([b, a], {
			migrations: [marker('x1')],
			coreMigrations: [marker('x2')],
		});
		expect(bound.modules.map((m) => m.name)).toEqual(['a', 'b']);
		expect(bound.migrations.map((m) => m.id)).toEqual(['a1', 'b1', 'x1']);
		expect(bound.coreMigrations.map((m) => m.id)).toEqual(['c1', 'x2']);
	});

	test('a collection that is both a tenant and a core one is refused', () => {
		expect(() =>
			bindModules([
				defineModule({ name: 'a', collections: { users: collection } }),
				defineModule({ name: 'b', coreCollections: { users: collection } }),
			]),
		).toThrow(ModuleWiringError);
	});
});

describe('forModule', () => {
	test('refuses a collection the database is not wired with, naming it', async () => {
		const modules = [
			defineModule({ name: 'a', collections: { missing: collection } }),
			defineModule({ name: 'b', coreCollections: { alsoMissing: collection } }),
		] as const;
		const mongo = await openTenantDb();
		const store = single({ mongo, core: await openCore(), modules, tenant });
		const source = { mongo, core: store.core };
		expect(() => store.forModule(source, 'a')).toThrow(
			/"missing" of module "a"/,
		);
		expect(() => store.forModule(source, 'b')).toThrow(
			/core collection "alsoMissing"/,
		);
	});

	test('a store given no registry hands out no module', async () => {
		const mongo = await openTenantDb();
		const store = single({ mongo, tenant });
		expect(() => store.forModule({ mongo, core: mongo }, 'a')).toThrow(
			/not registered/,
		);
	});
});

const tenant = { id: 'only', slug: 'only', name: 'Only' };
