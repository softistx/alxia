import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { tenantWiring, unique } from '../test/harness';
import { createTenantDatabases } from './databases';
import { dbOf } from './migrate';

const hex = () => new ObjectId().toHexString();

async function databases(size = 10) {
	return createTenantDatabases({
		database: unique('db_'),
		size,
		configure: await tenantWiring(),
	});
}

describe('the database name', () => {
	test('is the prefix and the tenant id', async () => {
		const prefix = unique('p_');
		const dbs = createTenantDatabases({
			database: prefix,
			configure: await tenantWiring(),
		});
		const id = hex();
		expect(dbs.nameOf(id)).toBe(`${prefix}${id}`);
		expect(dbs.nameOf(new ObjectId(id))).toBe(dbs.nameOf(id));
	});

	test('can not be forged', async () => {
		const dbs = await databases();
		for (const forged of ['', 'admin', '../core', `${hex()}.x`, '$where']) {
			expect(() => dbs.nameOf(forged)).toThrow(TypeError);
			expect(dbs.open(forged)).rejects.toThrow(TypeError);
		}
	});
});

describe('the cache', () => {
	test('gives the same Mongo for the same tenant, a database each', async () => {
		const dbs = await databases();
		const [a, b] = [hex(), hex()];
		const first = await dbs.open(a);
		expect(await dbs.open(a)).toBe(first);
		expect(await dbs.open(b)).not.toBe(first);
		expect(dbOf(first).databaseName).toBe(dbs.nameOf(a));
	});

	test('is bounded: the least recently used leaves first', async () => {
		const dbs = await databases(2);
		const [a, b, c] = [hex(), hex(), hex()];
		const first = await dbs.open(a);
		await dbs.open(b);
		await dbs.open(a);
		await dbs.open(c);
		expect(dbs.cached).toBe(2);
		expect(await dbs.open(a)).toBe(first);
	});

	test('evicting never closes the shared client, and close forgets every entry', async () => {
		const dbs = await databases(1);
		const first = await dbs.open(hex());
		const closed = new Promise<void>((resolve) => {
			const close = first.close.bind(first);
			first.close = async () => {
				await close();
				resolve();
			};
		});
		await dbs.open(hex());
		await closed;
		expect(Object.values(await first.ping()).every((r) => r.ok)).toBe(true);
		await dbs.close();
		expect(dbs.cached).toBe(0);
		expect(Object.values(await first.ping()).every((r) => r.ok)).toBe(true);
	});

	test('a size under one is refused', async () => {
		expect(() =>
			createTenantDatabases({
				database: 'x',
				size: 0,
				configure: (() => {
					throw new Error('unused');
				}) as never,
			}),
		).toThrow(RangeError);
	});
});
