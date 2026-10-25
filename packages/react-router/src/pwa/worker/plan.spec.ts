import { describe, expect, test } from 'bun:test';
import type { RequestFacts } from '../model/caching';
import { defineWorkerContract } from '../model/worker-contract';
import {
	deleteObsoleteCaches,
	isSkipWaiting,
	matcher,
	storableOnly,
	workerPlan,
} from './plan';

const contract = defineWorkerContract({ cachePrefix: 'app' });
const ORIGIN = 'https://app.test';
const precache = [
	{ url: '/assets/a-abcdefgh.js', revision: null },
	{ url: '/offline.html', revision: 'abc123' },
];

const request = (
	url: string,
	extra: Partial<RequestFacts> = {},
): RequestFacts => ({
	method: 'GET',
	url: `${ORIGIN}${url}`,
	mode: 'cors',
	destination: 'script',
	headers: new Headers(),
	...extra,
});

describe('workerPlan', () => {
	test('the defaults', () => {
		const plan = workerPlan({ contract }, precache);
		expect(plan.cacheNameDetails).toEqual({
			prefix: 'app',
			precache: 'precache',
			suffix: 'v1',
		});
		expect(plan.navigationPreload).toBe(true);
		expect(plan.precache).toBe(precache);
		expect(plan.routes).toEqual([
			{
				caching: 'navigation',
				strategy: 'network-only',
				fallback: '/offline.html',
			},
			{
				caching: 'immutable',
				strategy: 'cache-first',
				cacheName: contract.cacheNames.assets,
				expiration: { maxEntries: 200 },
			},
			{
				caching: 'static',
				strategy: 'stale-while-revalidate',
				cacheName: contract.cacheNames.static,
				expiration: { maxEntries: 100, maxAgeSeconds: 2_592_000 },
			},
		]);
	});

	test('assets, static and navigationPreload are overridable', () => {
		const plan = workerPlan(
			{
				contract,
				assets: { maxEntries: 5 },
				static: { maxAgeSeconds: 60 },
				navigationPreload: false,
			},
			precache,
		);
		expect(plan.navigationPreload).toBe(false);
		expect(plan.routes[1]).toMatchObject({ expiration: { maxEntries: 5 } });
		expect(plan.routes[2]).toMatchObject({
			expiration: { maxEntries: 100, maxAgeSeconds: 60 },
		});
	});

	test('the fallback is the offline page only when it is precached', () => {
		const without = workerPlan({ contract }, [precache[0] as never]);
		expect(without.routes[0]).toMatchObject({ fallback: undefined });
		const bare = workerPlan({ contract }, [
			{ url: '/offline.html', revision: null },
		]);
		expect(bare.routes[0]).toMatchObject({ fallback: '/offline.html' });
	});

	test('a contract is required', () => {
		expect(() => workerPlan({} as never, precache)).toThrow(
			new TypeError(
				'startWorker(): contract is required: pass defineWorkerContract({ cachePrefix }) from @alxia/react-router/pwa.',
			),
		);
	});

	test('no precache list is an error naming the build', () => {
		expect(() => workerPlan({ contract }, undefined)).toThrow(
			/^startWorker\(\): no precache list\. Build this worker with alxia\(\)/,
		);
	});

	test('options.precache wins over the injected list', () => {
		const own = [{ url: '/own.js', revision: null }];
		expect(workerPlan({ contract, precache: own }, precache).precache).toBe(
			own,
		);
		expect(workerPlan({ contract, precache: own }, undefined).precache).toBe(
			own,
		);
	});
});

describe('matcher', () => {
	const match = (
		caching: 'navigation' | 'immutable' | 'static' | 'none',
		r: RequestFacts,
		options = {},
	) =>
		matcher(caching as never, () => ORIGIN, { contract, ...options })({
			request: r,
		});

	test('one request per caching kind', () => {
		expect(match('navigation', request('/', { mode: 'navigate' }))).toBe(true);
		expect(match('immutable', request('/assets/a-abcdefgh.js'))).toBe(true);
		expect(match('static', request('/logo.svg'))).toBe(true);
		expect(match('static', request('/assets/a-abcdefgh.js'))).toBe(false);
		expect(match('immutable', request('/logo.svg'))).toBe(false);
	});

	test('the never option leaves a path to the browser', () => {
		const caching = { never: (p: string) => p.startsWith('/x/') };
		expect(match('static', request('/x/logo.svg'), { caching })).toBe(false);
		expect(match('static', request('/logo.svg'), { caching })).toBe(true);
	});

	test("the contract's serviceWorkerUrl is never cached", () => {
		const custom = defineWorkerContract({
			cachePrefix: 'app',
			serviceWorkerUrl: '/w.js',
		});
		const m = matcher('static', () => ORIGIN, { contract: custom });
		expect(m({ request: request('/w.js') })).toBe(false);
	});
});

describe('storableOnly', () => {
	test('returns a storable response and null for the rest', async () => {
		const ok = new Response('x', {
			headers: { 'content-type': 'text/css', 'cache-control': 'public' },
		});
		expect(await storableOnly.cacheWillUpdate({ response: ok })).toBe(ok);
		const page = new Response('x', {
			headers: { 'content-type': 'text/html' },
		});
		expect(await storableOnly.cacheWillUpdate({ response: page })).toBeNull();
	});
});

describe('isSkipWaiting', () => {
	test('matches the SKIP_WAITING message only', () => {
		expect(isSkipWaiting({ type: 'SKIP_WAITING' })).toBe(true);
		expect(isSkipWaiting(null)).toBe(false);
		expect(isSkipWaiting('x')).toBe(false);
	});
});

describe('deleteObsoleteCaches', () => {
	test('deletes only what the contract no longer owns', async () => {
		const deleted: string[] = [];
		await deleteObsoleteCaches(contract, {
			keys: async () => [
				contract.cacheNames.assets,
				'app-assets-v0',
				'other-x-v1',
			],
			delete: async (name: string) => {
				deleted.push(name);
				return true;
			},
		});
		expect(deleted).toEqual(['app-assets-v0']);
	});
});
