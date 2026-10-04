import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { cache } from './cache';

describe('app.plugin(cache()), deprecated', () => {
	test('a route declared after it is served from the cache', async () => {
		let runs = 0;
		const app = alxia()
			.plugin(cache({ ttl: 60 }))
			.get('/late', ({ reply }) => reply(200, { run: ++runs }));
		await app.request('/late');
		expect(await (await app.request('/late')).json()).toEqual({ run: 1 });
		expect(runs).toBe(1);
	});

	test('a route declared before it is served from the cache too, as 0.3 hooks did', async () => {
		let runs = 0;
		const app = alxia()
			.get('/early', ({ reply }) => reply(200, { run: ++runs }))
			.plugin(cache({ ttl: 60 }));
		await app.request('/early');
		expect(await (await app.request('/early')).json()).toEqual({ run: 1 });
		expect(runs).toBe(1);
	});
});
