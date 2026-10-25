import { describe, expect, test } from 'bun:test';
import {
	defineWorkerContract,
	OFFLINE_URL,
	SERVICE_WORKER_URL,
} from './worker-contract';

const contract = defineWorkerContract({ cachePrefix: 'app' });
const others = ['workbox-precache-v2-https://x/', 'someone-else'];

describe('defineWorkerContract', () => {
	test('defaults to v1, the standard URLs and the three cache names', () => {
		expect(contract.cachePrefix).toBe('app');
		expect(contract.cacheVersion).toBe('v1');
		expect(contract.serviceWorkerUrl).toBe(SERVICE_WORKER_URL);
		expect(contract.offlineUrl).toBe(OFFLINE_URL);
		expect(contract.cacheNames).toEqual({
			precache: 'app-precache-v1',
			assets: 'app-assets-v1',
			static: 'app-static-v1',
		});
	});

	test('takes a version and URLs of its own', () => {
		const custom = defineWorkerContract({
			cachePrefix: 'app',
			cacheVersion: 'v7',
			serviceWorkerUrl: '/sw.js',
			offlineUrl: '/off.html',
		});
		expect(custom.cacheNames.assets).toBe('app-assets-v7');
		expect(custom.serviceWorkerUrl).toBe('/sw.js');
		expect(custom.offlineUrl).toBe('/off.html');
	});

	test('names the precache as Workbox does', () => {
		const p = 'my-app';
		const v = 'v3';
		const named = defineWorkerContract({ cachePrefix: p, cacheVersion: v });
		expect(named.cacheNames.precache).toBe(`${p}-precache-${v}`);
	});

	test('is frozen', () => {
		expect(Object.isFrozen(contract)).toBe(true);
		expect(Object.isFrozen(contract.cacheNames)).toBe(true);
	});

	test('refuses an empty prefix, and one ending with a dash', () => {
		expect(() => defineWorkerContract({ cachePrefix: '' })).toThrow(
			new TypeError(
				"defineWorkerContract(): cachePrefix must be a non-empty name, such as 'my-app'; got ''.",
			),
		);
		expect(() => defineWorkerContract({ cachePrefix: 'app-' })).toThrow(
			/must not end with '-'.*Use 'app'/,
		);
	});
});

describe('obsoleteCaches', () => {
	test("deletes our caches of another version, keeps the current ones and others'", () => {
		expect(
			contract.obsoleteCaches([
				...Object.values(contract.cacheNames),
				'app-assets-v0',
				'app-pages-v0',
				...others,
			]),
		).toEqual(['app-assets-v0', 'app-pages-v0']);
	});
});

describe('clearableCaches', () => {
	test('clears every cache of ours but the precached offline page', () => {
		expect(
			contract.clearableCaches([
				...Object.values(contract.cacheNames),
				'app-assets-v0',
				...others,
			]),
		).toEqual([
			contract.cacheNames.assets,
			contract.cacheNames.static,
			'app-assets-v0',
		]);
	});
});

describe('two prefixes', () => {
	test("never claim each other's caches", () => {
		const other = defineWorkerContract({ cachePrefix: 'other' });
		const all = [
			...Object.values(contract.cacheNames),
			...Object.values(other.cacheNames),
			'app-assets-v0',
			'other-assets-v0',
		];
		expect(contract.obsoleteCaches(all)).toEqual(['app-assets-v0']);
		expect(other.obsoleteCaches(all)).toEqual(['other-assets-v0']);
		expect(contract.clearableCaches(all)).not.toContain(
			other.cacheNames.assets,
		);
		expect(other.clearableCaches(all)).not.toContain(
			contract.cacheNames.assets,
		);
	});
});
