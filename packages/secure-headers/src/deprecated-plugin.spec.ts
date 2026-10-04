import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { secureHeaders } from './secure-headers';

describe('app.plugin(secureHeaders()), deprecated', () => {
	test('a route declared after it gets the headers, and reads nonce', async () => {
		const app = alxia()
			.plugin(
				secureHeaders({
					nonce: true,
					contentSecurityPolicy: "script-src 'self'",
				}),
			)
			.get('/late', ({ nonce, reply }) => reply(200, nonce));
		const response = await app.request('/late');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect((await response.text()).length).toBeGreaterThan(0);
	});

	test('a route declared before it gets the headers too, as 0.3 hooks did', async () => {
		const app = alxia()
			.get('/early', ({ reply }) => reply(200, 'early'))
			.plugin(secureHeaders());
		const response = await app.request('/early');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	});
});
