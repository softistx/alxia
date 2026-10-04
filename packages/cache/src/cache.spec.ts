import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { cache } from './cache';
import { MemoryCacheStore } from './store';

function setup(options: Partial<Parameters<typeof cache>[0]> = {}) {
	let runs = 0;
	const products = cache({ ttl: 60, tags: () => ['products'], ...options });
	const app = alxia()
		.get('/live', ({ reply }) => reply(200, ++runs))
		.plugin(products)
		.get('/products', async ({ reply, cache: controls }) => {
			expectTypeOf(controls.tag).toBeFunction();
			await Bun.sleep(20);
			return reply(200, { runs: ++runs });
		})
		.get('/private', ({ reply }) =>
			reply(200, ++runs, { headers: { 'cache-control': 'private' } }),
		)
		.get('/skipped', ({ reply, cache: controls }) => {
			controls.skip();
			return reply(200, ++runs);
		})
		.get('/missing', ({ reply }) => reply(404, ++runs))
		.get('/hello', ({ request, reply }) =>
			reply(200, `${request.headers.get('accept-language') ?? '-'} ${++runs}`),
		);
	return { app, products, runs: () => runs };
}

describe('cache', () => {
	test('a fresh response is served again, with its ETag and a 304', async () => {
		const { app, runs } = setup();
		const first = await app.request('/products');
		expect(first.headers.get('x-cache')).toBe('MISS');
		const again = await app.request('/products');
		expect(await again.json()).toEqual({ runs: 1 });
		expect(again.headers.get('x-cache')).toBe('HIT');
		expect(runs()).toBe(1);
		const etag = again.headers.get('etag') ?? '';
		expect(etag).toStartWith('W/"');
		const notModified = await app.request('/products', {
			headers: { 'if-none-match': etag },
		});
		expect(notModified.status).toBe(304);
	});

	test('concurrent misses run the route once', async () => {
		const { app, runs } = setup();
		const answers = await Promise.all(
			Array.from({ length: 10 }, async () =>
				(await app.request('/products')).json(),
			),
		);
		expect(answers.every((answer) => answer.runs === 1)).toBe(true);
		expect(runs()).toBe(1);
	});

	test('concurrent misses of a response not kept: each request runs the route', async () => {
		let runs = 0;
		const app = alxia()
			.plugin(cache({ ttl: 60 }))
			.get('/me', async ({ request, reply }) => {
				runs++;
				await Bun.sleep(20);
				return reply(200, request.headers.get('x-user') ?? '-', {
					headers: { 'cache-control': 'private' },
				});
			});
		const users = ['alice', 'bob', 'carol'];
		const answers = await Promise.all(
			users.map((user) => app.request('/me', { headers: { 'x-user': user } })),
		);
		expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200]);
		expect(await Promise.all(answers.map((answer) => answer.text()))).toEqual(
			users,
		);
		expect(runs).toBe(3);
	});

	test('a leading run that throws: each waiting request runs the route', async () => {
		let runs = 0;
		const app = alxia()
			.plugin(cache({ ttl: 60 }))
			.get('/flaky', async ({ reply }) => {
				const run = ++runs;
				await Bun.sleep(20);
				if (run === 1) throw new Error('first run fails');
				return reply(200, 'ok');
			});
		const original = console.error;
		console.error = () => {};
		try {
			const answers = await Promise.all(
				[1, 2, 3].map(() => app.request('/flaky')),
			);
			expect(answers.map((answer) => answer.status)).toEqual([500, 200, 200]);
			expect(runs).toBe(3);
		} finally {
			console.error = original;
		}
	});

	test('stale: served at once, refreshed behind', async () => {
		const { app, runs } = setup({ ttl: 0.05, staleWhileRevalidate: 60 });
		await app.request('/products');
		await Bun.sleep(80);
		const stale = await app.request('/products');
		expect(stale.headers.get('x-cache')).toBe('STALE');
		expect(await stale.json()).toEqual({ runs: 1 });
		await Bun.sleep(50);
		expect(runs()).toBe(2);
		expect(await (await app.request('/products')).json()).toEqual({ runs: 2 });
	});

	test('stale: a refresh that is not kept leaves the stale copy', async () => {
		let runs = 0;
		const app = alxia()
			.plugin(cache({ ttl: 0.02, staleWhileRevalidate: 60 }))
			.get('/page', ({ reply }) =>
				++runs === 1
					? reply(200, 'first')
					: reply(200, 'personal', { headers: { 'cache-control': 'private' } }),
			);
		await app.request('/page');
		await Bun.sleep(30);
		const stale = await app.request('/page');
		expect(stale.headers.get('x-cache')).toBe('STALE');
		await Bun.sleep(10);
		const again = await app.request('/page');
		expect(again.headers.get('x-cache')).toBe('STALE');
		expect(await again.text()).toBe('first');
		expect(runs).toBeGreaterThanOrEqual(2);
	});

	test('never kept: private, skipped, another status; routes before it', async () => {
		const { app, runs } = setup();
		for (const path of ['/private', '/skipped', '/missing', '/live']) {
			await app.request(path);
			await app.request(path);
		}
		expect(runs()).toBe(8);
	});

	test('varying by a header', async () => {
		const { app } = setup({ vary: ['accept-language'] });
		const fr = await app.request('/hello', {
			headers: { 'accept-language': 'fr' },
		});
		const en = await app.request('/hello', {
			headers: { 'accept-language': 'en' },
		});
		expect(await fr.text()).toStartWith('fr');
		expect(await en.text()).toStartWith('en');
		expect(fr.headers.get('vary')).toContain('accept-language');
		expect(
			await (
				await app.request('/hello', { headers: { 'accept-language': 'fr' } })
			).text(),
		).toBe(
			await (
				await app.request('/hello', { headers: { 'accept-language': 'fr' } })
			).text(),
		);
	});

	test('invalidated by path, and by tag', async () => {
		const { app, products, runs } = setup();
		await app.request('/products');
		await products.invalidate('/products');
		await app.request('/products');
		expect(runs()).toBe(2);
		await products.invalidateTag('products');
		await app.request('/products');
		expect(runs()).toBe(3);
	});

	test('invalidate(path) forgets every variant: each vary value, a key of your own', async () => {
		const varying = setup({ vary: ['accept-language'] });
		const ask = (language: string) =>
			varying.app.request('/hello', {
				headers: { 'accept-language': language },
			});
		await ask('fr');
		await ask('en');
		await varying.products.invalidate('/hello');
		expect((await ask('fr')).headers.get('x-cache')).toBe('MISS');
		expect((await ask('en')).headers.get('x-cache')).toBe('MISS');

		const keyed = setup({ key: (ctx) => `custom:${ctx.url.pathname}` });
		await keyed.app.request('/products?page=2');
		await keyed.products.invalidate('/products');
		expect(
			(await keyed.app.request('/products?page=2')).headers.get('x-cache'),
		).toBe('HIT'); // another path: `/products?page=2` is not `/products`
		await keyed.products.invalidate('/products?page=2');
		expect(
			(await keyed.app.request('/products?page=2')).headers.get('x-cache'),
		).toBe('MISS');
	});

	test('a store that cannot answer: the route answers, and it is logged', async () => {
		const broken = new MemoryCacheStore();
		broken.get = () => {
			throw new Error('store down');
		};
		broken.set = () => Promise.reject(new Error('store down'));
		const logged: unknown[] = [];
		const original = console.error;
		console.error = (error: unknown) => logged.push(error);
		try {
			const { app, runs } = setup({ store: broken });
			const first = await app.request('/products');
			expect(first.status).toBe(200);
			expect(await first.json()).toEqual({ runs: 1 });
			expect((await app.request('/products')).status).toBe(200);
			expect(runs()).toBe(2);
			expect(logged).toHaveLength(1); // once per outage, not per request
		} finally {
			console.error = original;
		}
	});

	test('a key and tags that read what an earlier plugin added are typed with it', async () => {
		let runs = 0;
		const session = alxia().derive(({ request }) => ({
			user: { tenant: request.headers.get('x-tenant') ?? 'public' },
		}));
		const perTenant = cache<{ user: { tenant: string } }>({
			ttl: 60,
			key: ({ user, url }) => `${user.tenant}:${url.pathname}`,
			tags: ({ user }) => [`tenant:${user.tenant}`],
		});
		const app = alxia()
			.plugin(session)
			.plugin(perTenant)
			.get('/home', ({ user, reply }) =>
				reply(200, `${user.tenant} ${++runs}`),
			);
		const as = (tenant: string) =>
			app.request('/home', { headers: { 'x-tenant': tenant } });
		expect(await (await as('a')).text()).toBe('a 1');
		expect(await (await as('b')).text()).toBe('b 2');
		expect((await as('a')).headers.get('x-cache')).toBe('HIT');
		await perTenant.invalidateTag('tenant:a');
		expect(await (await as('a')).text()).toBe('a 3');
		expect((await as('b')).headers.get('x-cache')).toBe('HIT');

		const _refused = () => {
			// @ts-expect-error the plugin reads "user", which this app's context does not give
			alxia().plugin(perTenant);
			alxia()
				.derive(() => ({ user: { tenant: 1 } }))
				// @ts-expect-error the plugin reads "user", which this app's context gives with another type
				.plugin(perTenant);
		};
		expect(_refused).toBeFunction();
	});
});

describe('MemoryCacheStore', () => {
	const entry = (bytes: number, tags: string[] = []) => ({
		status: 200,
		headers: [],
		body: new Uint8Array(bytes),
		storedAt: Date.now(),
		ttl: 1000,
		stale: 0,
		tags,
	});

	test('evicts the least recently read, by count and by bytes', () => {
		const store = new MemoryCacheStore({ maxEntries: 2, maxBytes: 100 });
		store.set('a', entry(10), 1000);
		store.set('b', entry(10), 1000);
		store.get('a');
		store.set('c', entry(10), 1000);
		expect(store.get('b')).toBeUndefined();
		expect(store.get('a')).toBeDefined();
		store.set('d', entry(95), 1000);
		expect(store.size).toBe(1);
	});

	test('expires, and forgets by tag', async () => {
		const store = new MemoryCacheStore();
		store.set('a', entry(1, ['t']), 10);
		store.set('b', entry(1, ['t']), 1000);
		await Bun.sleep(20);
		expect(store.get('a')).toBeUndefined();
		store.deleteTag('t');
		expect(store.get('b')).toBeUndefined();
	});
});
