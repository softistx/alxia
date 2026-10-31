import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { isTenantId, slotNaming } from '.';
import { createTenantDatabases } from './databases';

const hex = () => new ObjectId().toHexString();

describe('isTenantId', () => {
	test('only 24 lowercase hex digits are an id', () => {
		expect(isTenantId(hex())).toBe(true);
		for (const forged of [
			'',
			'admin',
			'../core',
			`${hex()}.x`,
			`${hex()}/..`,
			'$where',
			hex().toUpperCase(),
			` ${hex()}`,
			hex().slice(1),
			42,
			null,
		]) {
			expect(isTenantId(forged)).toBe(false);
		}
	});
});

describe('slotNaming', () => {
	test('gives each tenant the lowest free slot and keeps it', () => {
		const naming = slotNaming('test', 3);
		const [a, b] = [hex(), hex()];
		expect(naming(a)).toBe('test_slot1');
		expect(naming(b)).toBe('test_slot2');
		expect(naming(a)).toBe('test_slot1');
		expect(naming.held()).toEqual([a, b]);
	});

	test('release frees a slot for the next tenant; reset frees all', () => {
		const naming = slotNaming('test', 2);
		const [a, b, c] = [hex(), hex(), hex()];
		naming(a);
		naming(b);
		expect(() => naming(c)).toThrow(RangeError);
		naming.release(a);
		expect(naming(c)).toBe('test_slot1');
		naming.reset();
		expect(naming(b)).toBe('test_slot1');
	});

	test('a database factory takes it as the naming, and still refuses a forged id', () => {
		const databases = createTenantDatabases({
			database: slotNaming('t', 2),
			configure: () => {
				throw new Error('never opened');
			},
		});
		const id = hex();
		expect(databases.nameOf(id)).toBe('t_slot1');
		expect(databases.nameOf(new ObjectId(id))).toBe('t_slot1');
		expect(() => databases.nameOf('admin')).toThrow(TypeError);
	});
});
