import { afterEach, describe, expect, test } from 'bun:test';
import { clearAppCaches } from './clear-app-caches';
import { defineWorkerContract } from './worker-contract';

const contract = defineWorkerContract({ cachePrefix: 'app' });
const original = Object.getOwnPropertyDescriptor(globalThis, 'caches');

afterEach(() => {
	if (original) Object.defineProperty(globalThis, 'caches', original);
	else Reflect.deleteProperty(globalThis, 'caches');
});

describe('clearAppCaches', () => {
	test("deletes the worker's caches but the offline page's", async () => {
		const names = new Set([
			...Object.values(contract.cacheNames),
			'someone-else',
		]);
		Object.defineProperty(globalThis, 'caches', {
			configurable: true,
			value: {
				keys: async () => [...names],
				delete: async (name: string) => names.delete(name),
			},
		});
		await clearAppCaches(contract);
		expect([...names]).toEqual([contract.cacheNames.precache, 'someone-else']);
	});

	test('does nothing where Cache Storage does not exist', async () => {
		Reflect.deleteProperty(globalThis, 'caches');
		await expect(clearAppCaches(contract)).resolves.toBeUndefined();
	});
});
