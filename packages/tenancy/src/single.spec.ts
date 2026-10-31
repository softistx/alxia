import { describe, expect, test } from 'bun:test';
import { markers } from '../test/contract';
import { ACCOUNT_A, openCore, openTenantDb } from '../test/harness';
import { single, TenancyError } from '.';
import { dbOf } from './migrate';

const tenant = { id: 'only', slug: 'only', name: 'Only' };
const request = (headers: Record<string, string> = {}) =>
	new Request('http://localhost/', { headers });

describe('the single store', () => {
	test('reads no header and checks no membership: the scope always carries the fixed tenant', async () => {
		const store = single({ mongo: await openTenantDb(), tenant });
		for (const headers of [{}, { 'x-organization-id': 'other' }]) {
			const scope = await store.scope(request(headers), { id: ACCOUNT_A });
			expect(scope.tenant).toMatchObject({ ...tenant, status: 'active' });
			expect(scope.member).toBeUndefined();
			expect(scope.mongo.actor).toBe(ACCOUNT_A);
		}
		const anonymous = await store.scope(request(), null);
		expect(anonymous.mongo.actor).toBeUndefined();
	});

	test('core is the same handle as the database unless one is given', async () => {
		const mongo = await openTenantDb();
		expect(single({ mongo, tenant }).core).toBe(mongo);
		const core = await openCore();
		const apart = single({ mongo, core, tenant });
		expect(apart.core).toBe(core);
		expect((await apart.scope(request(), null)).core).toBe(core);
	});

	test('a database of another tenant does not exist', async () => {
		const store = single({ mongo: await openTenantDb(), tenant });
		await expect(store.databaseOf('other')).rejects.toBeInstanceOf(
			TenancyError,
		);
		expect(await store.resolve('nope')).toBeUndefined();
		expect(await store.resolve('ONLY')).toMatchObject(tenant);
	});

	test('eachTenant visits that one tenant, withDeleted or not', async () => {
		const store = single({ mongo: await openTenantDb(), tenant });
		expect(await store.eachTenant(async (t) => t.id)).toEqual(['only']);
		expect(
			await store.eachTenant(async (t) => t.id, { withDeleted: true }),
		).toEqual(['only']);
	});

	test('provision prepares the database, ignores the input and can run again', async () => {
		const mongo = await openTenantDb();
		const store = single({ mongo, tenant, migrations: markers('t1') });
		const first = await store.provision(
			{ slug: 'whatever', name: 'x' },
			ACCOUNT_A,
		);
		const second = await store.provision(
			{ slug: 'whatever', name: 'x' },
			ACCOUNT_A,
		);
		expect(first.slug).toBe('only');
		expect(second).toBe(first);
		expect(await dbOf(mongo).collection('markers').countDocuments()).toBe(1);
	});

	test('with no database apart the core migrations run on the one database, core first', async () => {
		const mongo = await openTenantDb();
		const store = single({
			mongo,
			tenant,
			coreMigrations: markers('c1'),
			migrations: markers('t1'),
		});
		const [outcome, ...rest] = await store.migrate({
			kind: 'apply',
			dryRun: false,
		});
		expect(rest).toHaveLength(0);
		expect(outcome?.ids).toEqual(['c1', 't1']);
		const done = await store.migrate({
			kind: 'rollback',
			to: 'c1',
			dryRun: false,
		});
		expect(done).toHaveLength(1);
		expect(done[0]?.ids).toEqual(['t1']);
	});

	test('the core is apart by database name, not by handle', async () => {
		const name = `same_${Date.now()}`;
		const mongo = await openTenantDb(name);
		const core = await openTenantDb(name);
		expect(core).not.toBe(mongo);
		const migrations = {
			coreMigrations: markers('c1'),
			migrations: markers('t1'),
		};
		const same = single({ mongo, core, tenant, ...migrations });
		expect(await same.migrate({ kind: 'apply', dryRun: false })).toHaveLength(
			1,
		);
		const other = single({
			mongo: await openTenantDb(),
			core: await openTenantDb(),
			tenant,
			...migrations,
		});
		expect(await other.migrate({ kind: 'apply', dryRun: false })).toHaveLength(
			2,
		);
	});

	test('with a core apart each list runs on its own database', async () => {
		const mongo = await openTenantDb();
		const core = await openCore();
		const store = single({
			mongo,
			core,
			tenant,
			coreMigrations: markers('c1'),
			migrations: markers('t1'),
		});
		const outcomes = await store.migrate({ kind: 'apply', dryRun: false });
		expect(outcomes.map((o) => [o.database, o.ids])).toEqual([
			[dbOf(core).databaseName, ['c1']],
			[dbOf(mongo).databaseName, ['t1']],
		]);
		expect(await store.sync()).toEqual([
			dbOf(core).databaseName,
			dbOf(mongo).databaseName,
		]);
	});
});
