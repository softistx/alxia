import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { setup } from '../test/app';
import { cache } from './cache';

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
			.use(cache({ ttl: 60 }))
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
			.use(cache({ ttl: 60 }))
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
			.use(cache({ ttl: 0.02, staleWhileRevalidate: 60 }))
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
});
