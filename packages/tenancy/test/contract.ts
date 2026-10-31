import { beforeAll, describe, expect, test } from 'bun:test';
import {
	dbOf,
	lazyScope,
	type Tenant,
	type TenantStore,
	UnknownMigrationError,
} from '../src';
import { ACCOUNT_A, marker } from './harness';

interface Notes {
	notes: { create(note: { text: string }): Promise<{ createdBy: unknown }> };
}

/** What the contract needs of a store under test. */
export interface Harness {
	store: TenantStore<any, any, Tenant, any>;
	/** A request the way this store resolves a tenant from (a header or nothing). */
	requestFor(tenant: Tenant): Request;
	/** The two marker migrations the store was built with, in order (tenant list). */
	migrationIds: [string, string];
}

/**
 * The contract every `TenantStore` answers, run against each strategy: a
 * plugin written against the interface cannot tell them apart.
 */
export function describeTenantStore(
	name: string,
	make: () => Promise<Harness>,
) {
	describe(`TenantStore contract: ${name}`, () => {
		let h: Harness;
		let tenant: Tenant;
		beforeAll(async () => {
			h = await make();
			tenant = await h.store.provision(
				{ slug: 'contract-school', name: 'Contract' },
				ACCOUNT_A,
			);
		});

		test('provision gives an active tenant whose database is synced', async () => {
			expect(tenant.status).toBe('active');
			const mongo = await h.store.databaseOf(tenant);
			const indexes = await dbOf(mongo).collection('notes').indexes();
			expect(indexes.map((i: { name?: string }) => i.name)).toContain(
				'notes_text',
			);
		});

		test('resolve takes an id or a slug, in any case, and refuses the unknown', async () => {
			for (const ref of [
				tenant.id,
				tenant.slug,
				tenant.slug.toUpperCase(),
				` ${tenant.slug} `,
			]) {
				expect((await h.store.resolve(ref))?.id).toBe(tenant.id);
			}
			expect(await h.store.resolve('no-such-slug')).toBeUndefined();
		});

		test('tenantOf finds the tenant of a request', async () => {
			const found = await h.store.tenantOf(h.requestFor(tenant));
			expect(found).toMatchObject({ kind: 'found', tenant: { id: tenant.id } });
		});

		test('scope: the tenant, its database with the viewer as actor, and the core handle', async () => {
			const scope = await h.store.scope(h.requestFor(tenant), {
				id: ACCOUNT_A,
			});
			expect(scope.tenant.id).toBe(tenant.id);
			expect(scope.mongo.actor as unknown).toBe(ACCOUNT_A);
			const notes = (scope.mongo.db as unknown as Notes).notes;
			expect((await notes.create({ text: 'hello' })).createdBy).toBe(ACCOUNT_A);
			expect(typeof dbOf(scope.core).databaseName).toBe('string');
			expect(scope.core.actor as unknown).toBeUndefined();
		});

		test('lazyScope reads once and keeps the answer', async () => {
			let calls = 0;
			const counted = {
				scope: (...args: Parameters<typeof h.store.scope>) => {
					calls += 1;
					return h.store.scope(...args);
				},
			};
			const get = lazyScope(counted, h.requestFor(tenant), { id: ACCOUNT_A });
			expect(calls).toBe(0);
			const [a, b] = [await get(), await get()];
			expect(a).toBe(b);
			expect(calls).toBe(1);
		});

		test('eachTenant visits the tenant with its database', async () => {
			const seen = await h.store.eachTenant(async (visited, mongo) => ({
				id: visited.id,
				database: dbOf(mongo).databaseName,
			}));
			const mine = seen.find((entry) => entry.id === tenant.id);
			expect(mine?.database).toBe(
				dbOf(await h.store.databaseOf(tenant)).databaseName,
			);
			expect(
				await h.store.eachTenant(async () => 1, { withDeleted: true }),
			).not.toHaveLength(0);
		});

		test('sync names the core and the tenant database', async () => {
			const names = await h.store.sync();
			expect(names).toContain(dbOf(h.store.core).databaseName);
			expect(names).toContain(
				dbOf(await h.store.databaseOf(tenant)).databaseName,
			);
		});

		test('migrate: rollback, dry run, apply, status, unknown id', async () => {
			const [first, second] = h.migrationIds;
			const own = dbOf(await h.store.databaseOf(tenant));
			const markers = () => own.collection('markers').countDocuments();
			// Provisioning applied both.
			expect(await markers()).toBe(2);

			const dryRollback = await h.store.migrate({
				kind: 'rollback',
				to: first,
				dryRun: true,
			});
			expect(dryRollback.some((o) => o.ids.includes(second))).toBe(true);
			expect(await markers()).toBe(2);

			await h.store.migrate({ kind: 'rollback', to: first, dryRun: false });
			expect(await markers()).toBe(1);

			const dry = await h.store.migrate({ kind: 'apply', dryRun: true });
			expect(dry.some((o) => o.ids.includes(second))).toBe(true);
			expect(await markers()).toBe(1);

			const done = await h.store.migrate({ kind: 'apply', dryRun: false });
			expect(done.some((o) => o.ids.includes(second))).toBe(true);
			expect(await markers()).toBe(2);

			const status = await h.store.migrate({ kind: 'status' });
			expect(
				status.every((o) => o.status.every((s) => s.state === 'applied')),
			).toBe(true);

			for (const dryRun of [true, false]) {
				await expect(
					h.store.migrate({ kind: 'rollback', to: 'nope', dryRun }),
				).rejects.toBeInstanceOf(UnknownMigrationError);
			}
			expect(await markers()).toBe(2);
		});

		test('prepare is idempotent', async () => {
			await h.store.prepare(tenant.id);
			await h.store.prepare(tenant.id);
		});
	});
}

export const markers = (...ids: string[]) => ids.map((id) => marker(id));
