import { describe, expect, spyOn, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { NONCE } from './nonce';
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
		const error = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const response = await app.request('/boom');
			expect(response.status).toBe(500);
			expect(response.headers.get('cache-control')).toBe(VALUE);
			expect(error).toHaveBeenCalled();
		} finally {
			error.mockRestore();
		}
	});

	test('goes with a nonce, on a 200 and on a 404, fresh each time', async () => {
		const app = alxia()
			.use(
				secureHeaders({
					nonce: true,
					contentSecurityPolicy: `script-src 'self' ${NONCE}`,
					cacheControl: VALUE,
				}),
			)
			.get('/', ({ reply }) => reply(200, 'ok'));
		const nonceOf = (response: Response) =>
			response.headers
				.get('content-security-policy')
				?.match(/'nonce-([^']+)'/)?.[1];
		const ok = await app.request('/');
		const missing = await app.request('/missing');
		expect(ok.status).toBe(200);
		expect(missing.status).toBe(404);
		for (const response of [ok, missing]) {
			expect(response.headers.get('cache-control')).toBe(VALUE);
			expect(nonceOf(response)).toBeDefined();
		}
		expect(nonceOf(ok)).not.toBe(nonceOf(missing));
	});

	test('true is not a value', () => {
		const never = () =>
			// @ts-expect-error a string, or false: true is neither
			secureHeaders({ cacheControl: true });
		expect(never).toBeInstanceOf(Function);
	});

	test('an empty value is refused, at once', () => {
		expect(() => secureHeaders({ cacheControl: '' })).toThrow(
			'secureHeaders: cacheControl is empty; give false to leave the cache-control header out',
		);
	});
});
