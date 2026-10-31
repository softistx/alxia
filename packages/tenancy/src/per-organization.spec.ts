import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { markers } from '../test/contract';
import {
	ACCOUNT_A,
	ACCOUNT_B,
	mongoRegistry,
	openCore,
	register,
	tenantWiring,
	unique,
} from '../test/harness';
import {
	type Membership,
	noMembers,
	perOrganization,
	slotNaming,
	TenancyError,
	UnknownMigrationError,
	viewerMemberships,
} from '.';
import { dbOf } from './migrate';

async function setup(
	options: {
		membership?: Membership<string>;
		header?: string;
		database?: Parameters<typeof perOrganization>[0]['database'];
	} = {},
) {
	const core = await openCore();
	const prefix = unique('org_');
	const store = perOrganization({
		core,
		registry: mongoRegistry(core),
		database: options.database ?? prefix,
		configure: await tenantWiring(),
		membership: options.membership ?? (async () => 'admin'),
		migrations: markers('m1'),
		...(options.header ? { header: options.header } : {}),
	});
	return { core, store, prefix };
}

const request = (headers: Record<string, string> = {}) =>
	new Request('http://localhost/graphql', { headers });

const refused = async (promise: Promise<unknown>) =>
	(await promise.catch((e) => e)) as TenancyError;

describe('scope', () => {
	test('resolves the organisation by id and by slug, the slug case-insensitive', async () => {
		const { core, store } = await setup();
		const org = await register(core, { slug: 'clinique-a' });
		for (const ref of [
			org.id,
			'clinique-a',
			'Clinique-A',
			` ${org.id} `,
			org.id.toUpperCase(),
		]) {
			const scope = await store.scope(request({ 'x-organization-id': ref }), {
				id: ACCOUNT_A,
			});
			expect(scope.tenant.id).toBe(org.id);
		}
	});

	test('the header name is an option', async () => {
		const { core, store } = await setup({ header: 'x-school-id' });
		const org = await register(core);
		expect(store.header).toBe('x-school-id');
		const scope = await store.scope(request({ 'x-school-id': org.slug }), {
			id: ACCOUNT_A,
		});
		expect(scope.tenant.id).toBe(org.id);
		const error = await refused(
			store.scope(request({ 'x-organization-id': org.slug }), {
				id: ACCOUNT_A,
			}),
		);
		expect(error).toMatchObject({
			code: 'tenancy.errors.organization-required',
			status: 400,
			params: { header: 'x-school-id' },
		});
	});

	test('the mongo is on the tenant database with the viewer as actor; the member comes with it', async () => {
		const { core, store } = await setup();
		const org = await register(core);
		const scope = await store.scope(request({ 'x-organization-id': org.id }), {
			id: ACCOUNT_A,
		});
		expect(dbOf(scope.mongo).databaseName).toBe(store.databases.nameOf(org.id));
		expect(scope.mongo.actor).toBe(ACCOUNT_A);
		expect(scope.member).toBe('admin');
		expect(scope.core).toBe(core);
	});

	test('header missing is a 400', async () => {
		const { store } = await setup();
		const error = await refused(store.scope(request(), { id: ACCOUNT_A }));
		expect(error).toBeInstanceOf(TenancyError);
		expect(error).toMatchObject({
			code: 'tenancy.errors.organization-required',
			status: 400,
		});
	});

	test('provisioning, archived, soft-deleted and unknown organisations are the same 404', async () => {
		const { core, store } = await setup();
		const ids = [
			(await register(core, { status: 'provisioning' })).id,
			(await register(core, { status: 'archived' })).id,
			(await register(core, { deleted: true })).id,
			new ObjectId().toHexString(),
			'no-such-slug',
		];
		for (const ref of ids) {
			const error = await refused(
				store.scope(request({ 'x-organization-id': ref }), { id: ACCOUNT_A }),
			);
			expect(error).toMatchObject({
				code: 'tenancy.errors.unknown-organization',
				status: 404,
			});
		}
	});

	test('a non-member and an anonymous request get the unknown-organisation answer', async () => {
		const { core, store } = await setup({
			membership: async (_org, account) =>
				account === ACCOUNT_A ? 'admin' : null,
		});
		const org = await register(core);
		const headers = { 'x-organization-id': org.id };
		for (const viewer of [{ id: ACCOUNT_B }, null]) {
			const error = await refused(store.scope(request(headers), viewer));
			expect(error.code).toBe('tenancy.errors.unknown-organization');
		}
		const none = perOrganization({
			core,
			registry: mongoRegistry(core),
			database: unique('x_'),
			configure: await tenantWiring(),
			membership: noMembers,
		});
		expect(
			(await refused(none.scope(request(headers), { id: ACCOUNT_A }))).status,
		).toBe(404);
	});

	test('the database is not opened for a refused request', async () => {
		const { core, store } = await setup({ membership: async () => null });
		const org = await register(core);
		const open = mock(store.databases.open);
		store.databases.open = open;
		await refused(
			store.scope(request({ 'x-organization-id': org.id }), { id: ACCOUNT_B }),
		);
		expect(open).not.toHaveBeenCalled();
	});
});

describe('isolation: one database per organisation', () => {
	async function two() {
		const { core, store } = await setup();
		const [a, b] = [await register(core), await register(core)];
		const mongoA = (await store.databaseOf(a)).as(ACCOUNT_A as never);
		const mongoB = (await store.databaseOf(b)).as(ACCOUNT_B as never);
		await mongoA.sync();
		await mongoB.sync();
		return { core, store, a, b, mongoA, mongoB };
	}

	test('each organisation lives in a database of its own, and reads see only their own data', async () => {
		const { store, a, mongoA, mongoB } = await two();
		expect(dbOf(mongoA).databaseName).toBe(store.databases.nameOf(a.id));
		expect(dbOf(mongoA).databaseName).not.toBe(dbOf(mongoB).databaseName);
		const inA = await mongoA.db.notes.create({ text: 'secret of A' });
		await mongoB.db.notes.create({ text: 'note of B' });
		expect((await mongoA.db.notes.findMany()).map((n) => n.text)).toEqual([
			'secret of A',
		]);
		expect(await mongoB.db.notes.count({ text: 'secret of A' })).toBe(0);
		expect(await mongoB.db.notes.findById(inA._id)).toBeUndefined();
		expect(await mongoB.db.notes.findMany({ filter: {} })).toHaveLength(1);
		expect(await mongoB.db.notes.raw.countDocuments({ text: /^secret/ })).toBe(
			0,
		);
	});

	test('a write by id does not reach the other organisation; a transaction commits in its own', async () => {
		const { mongoA, mongoB } = await two();
		const inA = await mongoA.db.notes.create({ text: 'A' });
		await expect(
			mongoB.db.notes.update(inA._id, { text: 'hijacked' }),
		).rejects.toThrow();
		expect((await mongoA.db.notes.getById(inA._id)).text).toBe('A');
		await mongoA.transaction(async (tx) => {
			await tx.db.notes.create({ text: 'in a transaction' });
		});
		expect(await mongoA.db.notes.count()).toBe(2);
		expect(await mongoB.db.notes.count()).toBe(0);
	});

	test('the core database does not hold the tenants data, nor they the core', async () => {
		const { core, mongoA } = await two();
		await mongoA.db.notes.create({ text: 'A' });
		const inCore = (
			await dbOf(core).listCollections({}, { nameOnly: true }).toArray()
		).map((c) => c.name);
		expect(inCore).toContain('organizations');
		expect(inCore).not.toContain('notes');
		const inOrg = (
			await dbOf(mongoA).listCollections({}, { nameOnly: true }).toArray()
		).map((c) => c.name);
		expect(inOrg).not.toContain('organizations');
	});
});

describe('provision', () => {
	test('registers, creates the database, then activates; syncs the tenant collections only', async () => {
		const { store } = await setup();
		const org = await store.provision(
			{ slug: 'societe-1', name: 'Société 1' },
			ACCOUNT_A,
		);
		expect(org.status).toBe('active');
		const names = (
			await dbOf(await store.databaseOf(org))
				.listCollections({}, { nameOnly: true })
				.toArray()
		).map((c) => c.name);
		expect(names).toContain('notes');
		expect(names).toContain('markers');
		expect(names).not.toContain('organizations');
	});

	test('a taken slug is a coded 409', async () => {
		const { store } = await setup();
		await store.provision({ slug: 'pris', name: 'Un' }, ACCOUNT_A);
		const error = await refused(
			store.provision({ slug: 'pris', name: 'Deux' }, ACCOUNT_A),
		);
		expect(error).toMatchObject({
			code: 'tenancy.errors.slug-taken',
			status: 409,
			params: { slug: 'pris' },
		});
	});

	test('a database that cannot be prepared leaves the organisation provisioning', async () => {
		const { core, store } = await setup();
		store.databases.open = async () => {
			throw new Error('boom');
		};
		await expect(
			store.provision({ slug: 'casse', name: 'Cassé' }, ACCOUNT_A),
		).rejects.toThrow('boom');
		expect((await mongoRegistry(core).findBySlug('casse'))?.status).toBe(
			'provisioning',
		);
	});
});

describe('eachTenant', () => {
	let ctx: Awaited<ReturnType<typeof setup>>;
	beforeEach(async () => {
		ctx = await setup();
	});

	test('visits the active organisations by default, every registered one with withDeleted', async () => {
		const { core, store } = ctx;
		const active = await register(core);
		const provisioning = await register(core, { status: 'provisioning' });
		const archived = await register(core, { status: 'archived' });
		const deleted = await register(core, { deleted: true });
		const ids = (list: { id: string }[]) => list.map((t) => t.id).sort();
		const some = await store.eachTenant(async (t) => t);
		expect(ids(some)).toEqual([active.id]);
		const all = await store.eachTenant(async (t) => t, { withDeleted: true });
		expect(ids(all)).toEqual(ids([active, provisioning, archived, deleted]));
	});

	test('hands each organisation its own database, one after the other', async () => {
		const { core, store } = ctx;
		const [a, b] = [await register(core), await register(core)];
		const order: string[] = [];
		const names = await store.eachTenant(async (t, mongo) => {
			order.push(t.id);
			return dbOf(mongo).databaseName;
		});
		expect(names.sort()).toEqual(
			[store.databases.nameOf(a.id), store.databases.nameOf(b.id)].sort(),
		);
		expect(order).toHaveLength(2);
	});
});

describe('sync and migrate over every database', () => {
	test('sync loops over the core and every registered organisation, whatever its status', async () => {
		const { core, store } = await setup();
		const a = await register(core, { status: 'provisioning' });
		const b = await register(core, { status: 'archived' });
		const synced = await store.sync();
		expect(synced).toEqual([
			dbOf(core).databaseName,
			store.databases.nameOf(a.id),
			store.databases.nameOf(b.id),
		]);
	});

	test('syncCore runs after the core sync', async () => {
		const core = await openCore();
		const seen: string[] = [];
		const store = perOrganization({
			core,
			registry: mongoRegistry(core),
			database: unique('c_'),
			configure: await tenantWiring(),
			membership: noMembers,
			syncCore: async (handle) => {
				seen.push(dbOf(handle).databaseName);
			},
		});
		await store.sync();
		expect(seen).toEqual([dbOf(core).databaseName]);
	});

	test('a pending migration stays pending after a sync, and a failing database is named', async () => {
		const { core, store } = await setup();
		const org = await register(core);
		await store.sync();
		const [outcome] = (await store.migrate({ kind: 'status' })).filter(
			(o) => o.database === store.databases.nameOf(org.id),
		);
		expect(outcome?.status[0]).toMatchObject({ id: 'm1', state: 'pending' });

		store.databases.open = async () => {
			throw new Error('down');
		};
		await expect(
			store.migrate({ kind: 'apply', dryRun: false }),
		).rejects.toThrow();
	});

	test('a rollback id only the core list holds reverts the core only; an unknown id is refused', async () => {
		const core = await openCore();
		const store = perOrganization({
			core,
			registry: mongoRegistry(core),
			database: unique('r_'),
			configure: await tenantWiring(),
			membership: noMembers,
			migrations: markers('t1'),
			coreMigrations: markers('c1', 'c2'),
		});
		const org = await register(core);
		await store.migrate({ kind: 'apply', dryRun: false });
		const done = await store.migrate({
			kind: 'rollback',
			to: 'c1',
			dryRun: false,
		});
		expect(done).toHaveLength(1);
		expect(done[0]).toMatchObject({
			database: dbOf(core).databaseName,
			ids: ['c2'],
		});
		const own = dbOf(await store.databaseOf(org));
		expect(await own.collection('markers').countDocuments()).toBe(1);
		await expect(
			store.migrate({ kind: 'rollback', to: 'nope', dryRun: true }),
		).rejects.toBeInstanceOf(UnknownMigrationError);
	});
});

describe('slot naming for tests', () => {
	test('databases take slot names and the store works on them', async () => {
		const prefix = unique('slots');
		const naming = slotNaming(prefix, 2);
		const { store } = await setup({ database: naming });
		const a = await store.provision({ slug: 'slot-a', name: 'A' }, ACCOUNT_A);
		const b = await store.provision({ slug: 'slot-b', name: 'B' }, ACCOUNT_A);
		expect(dbOf(await store.databaseOf(a)).databaseName).toBe(
			`${prefix}_slot1`,
		);
		expect(dbOf(await store.databaseOf(b)).databaseName).toBe(
			`${prefix}_slot2`,
		);
		await expect(
			store.provision({ slug: 'slot-c', name: 'C' }, ACCOUNT_A),
		).rejects.toThrow(RangeError);
	});
});

describe('viewerMemberships', () => {
	test('reads each membership once per request, forgets a failed read, and primes', async () => {
		let reads = 0;
		let fail = true;
		const memberships = viewerMemberships<string>(
			async (_tenant, account) => {
				reads += 1;
				if (fail) throw new Error('read failed');
				return account;
			},
			{ id: ACCOUNT_A },
		);
		await expect(memberships.in('t1')).rejects.toThrow('read failed');
		fail = false;
		expect(await memberships.in('t1')).toBe(ACCOUNT_A);
		expect(await memberships.in('t1')).toBe(ACCOUNT_A);
		expect(reads).toBe(2);
		memberships.prime('t2', 'primed');
		expect(await memberships.in('t2')).toBe('primed');
		expect(
			await viewerMemberships(async () => true as const, null).in('t1'),
		).toBeNull();
	});
});
