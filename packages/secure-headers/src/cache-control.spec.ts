import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { secureHeaders } from './secure-headers';

const VALUE = 'private, no-store';

describe('cacheControl', () => {
	test('is off by default', async () => {
		const app = alxia()
			.use(secureHeaders())
			.get('/', ({ reply }) => reply(200, 'ok'));
		expect((await app.request('/')).headers.get('cache-control')).toBeNull();
	});

	test('is set when given', async () => {
		const app = alxia()
			.use(secureHeaders({ cacheControl: VALUE }))
			.get('/', ({ reply }) => reply(200, 'ok'));
		expect((await app.request('/')).headers.get('cache-control')).toBe(VALUE);
	});

	test('a route own Cache-Control wins', async () => {
		const app = alxia()
			.use(secureHeaders({ cacheControl: VALUE }))
			.get('/', ({ reply }) =>
				reply(200, 'ok', {
					headers: { 'cache-control': 'public, max-age=60' },
				}),
			);
		expect((await app.request('/')).headers.get('cache-control')).toBe(
			'public, max-age=60',
		);
	});

	test('is present on a 404', async () => {
		const app = alxia().use(secureHeaders({ cacheControl: VALUE }));
		const response = await app.request('/missing');
		expect(response.status).toBe(404);
		expect(response.headers.get('cache-control')).toBe(VALUE);
	});

	test('is present on a 500 from a thrown error', async () => {
		const app = alxia()
			.use(secureHeaders({ cacheControl: VALUE }))
			.get('/boom', () => {
				throw new Error('boom');
			});
		const response = await app.request('/boom');
		expect(response.status).toBe(500);
		expect(response.headers.get('cache-control')).toBe(VALUE);
	});

	test('an empty value is refused, at once', () => {
		expect(() => secureHeaders({ cacheControl: '' })).toThrow(
			'secureHeaders: cacheControl is empty; give false to leave the cache-control header out',
		);
	});
});
