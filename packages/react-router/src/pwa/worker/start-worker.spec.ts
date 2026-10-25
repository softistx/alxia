import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { defineWorkerContract } from '../model/worker-contract';

// mock.module affects the whole process, so this spec has its own file.
const calls: Array<[string, ...unknown[]]> = [];
const record = (name: string) =>
	mock((...args: unknown[]) => {
		calls.push([name, ...args]);
	});
const klass = (name: string) =>
	class {
		constructor(...args: unknown[]) {
			calls.push([`new ${name}`, ...args]);
		}
	};

const matchPrecache = mock(async (url: string) => `precached:${url}`);
mock.module('workbox-core', () => ({
	setCacheNameDetails: record('setCacheNameDetails'),
	clientsClaim: record('clientsClaim'),
}));
mock.module('workbox-expiration', () => ({
	ExpirationPlugin: klass('ExpirationPlugin'),
}));
mock.module('workbox-navigation-preload', () => ({ enable: record('enable') }));
mock.module('workbox-precaching', () => ({
	precacheAndRoute: record('precacheAndRoute'),
	matchPrecache,
}));
mock.module('workbox-routing', () => ({
	registerRoute: record('registerRoute'),
}));
mock.module('workbox-strategies', () => ({
	CacheFirst: klass('CacheFirst'),
	NetworkOnly: klass('NetworkOnly'),
	StaleWhileRevalidate: klass('StaleWhileRevalidate'),
}));

const { startWorker } = await import('./start-worker');

const contract = defineWorkerContract({ cachePrefix: 'app' });
const precache = [{ url: '/offline.html', revision: 'r1' }];
type Listener = (event: {
	data?: unknown;
	waitUntil(p: Promise<unknown>): void;
}) => void;
const listeners = new Map<string, Listener>();
const skipWaiting = mock(async () => {});
const original = {
	location: Object.getOwnPropertyDescriptor(globalThis, 'location'),
};

beforeEach(() => {
	calls.length = 0;
	listeners.clear();
	Object.assign(globalThis, {
		location: { origin: 'https://app.test' },
		skipWaiting,
		addEventListener: (type: string, listener: Listener) =>
			listeners.set(type, listener),
	});
});

afterEach(() => {
	Reflect.deleteProperty(globalThis, 'skipWaiting');
	Reflect.deleteProperty(globalThis, 'addEventListener');
	if (original.location)
		Object.defineProperty(globalThis, 'location', original.location);
	else Reflect.deleteProperty(globalThis, 'location');
});

const names = () => calls.map(([name]) => name);

describe('startWorker', () => {
	test('wires Workbox in order', () => {
		startWorker({ contract, precache });
		expect(names()).toEqual([
			'setCacheNameDetails',
			'precacheAndRoute',
			'enable',
			'new NetworkOnly',
			'registerRoute',
			'new ExpirationPlugin',
			'new CacheFirst',
			'registerRoute',
			'new ExpirationPlugin',
			'new StaleWhileRevalidate',
			'registerRoute',
			'clientsClaim',
		]);
		expect(calls[0]).toEqual([
			'setCacheNameDetails',
			{ prefix: 'app', precache: 'precache', suffix: 'v1' },
		]);
		expect(calls[1]).toEqual([
			'precacheAndRoute',
			precache,
			{ cleanURLs: false, directoryIndex: '' },
		]);
		expect(calls[5]).toEqual([
			'new ExpirationPlugin',
			{ maxEntries: 200, purgeOnQuotaError: true },
		]);
		expect(calls[8]).toEqual([
			'new ExpirationPlugin',
			{ maxEntries: 100, maxAgeSeconds: 2_592_000, purgeOnQuotaError: true },
		]);
		const cacheFirst = calls[6]?.[1] as {
			cacheName: string;
			plugins: unknown[];
		};
		expect(cacheFirst.cacheName).toBe(contract.cacheNames.assets);
		expect(cacheFirst.plugins).toHaveLength(2);
		const staleWhile = calls[9]?.[1] as { cacheName: string };
		expect(staleWhile.cacheName).toBe(contract.cacheNames.static);
	});

	test('the network-only route falls back to the precached offline page', async () => {
		startWorker({ contract, precache });
		const options = calls[3]?.[1] as {
			plugins: Array<{ handlerDidError(): Promise<unknown> }>;
		};
		expect(await options.plugins[0]?.handlerDidError()).toBe(
			'precached:/offline.html',
		);
	});

	test('navigationPreload: false leaves enable out', () => {
		startWorker({ contract, precache, navigationPreload: false });
		expect(names()).not.toContain('enable');
	});

	test('activate deletes the obsolete caches', async () => {
		const deleted: string[] = [];
		Object.assign(globalThis, {
			caches: {
				keys: async () => ['app-assets-v0', contract.cacheNames.assets],
				delete: async (name: string) => deleted.push(name),
			},
		});
		startWorker({ contract, precache });
		let pending: Promise<unknown> | undefined;
		listeners.get('activate')?.({ waitUntil: (p) => (pending = p) });
		await pending;
		Reflect.deleteProperty(globalThis, 'caches');
		expect(deleted).toEqual(['app-assets-v0']);
	});

	test('SKIP_WAITING calls skipWaiting, other messages do not', () => {
		startWorker({ contract, precache });
		const message = listeners.get('message');
		message?.({ data: { type: 'other' }, waitUntil() {} });
		expect(skipWaiting).not.toHaveBeenCalled();
		message?.({ data: { type: 'SKIP_WAITING' }, waitUntil() {} });
		expect(skipWaiting).toHaveBeenCalledTimes(1);
	});
});
