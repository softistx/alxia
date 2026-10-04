import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { bearer } from './bearer';
import { createJwt } from './jwt';

const jwt = createJwt({ secret: 'a-secret-of-at-least-thirty-two-bytes!' });

describe('app.plugin(bearer()), deprecated', () => {
	test('a route declared after it is guarded, and reads user', async () => {
		const app = alxia()
			.plugin(bearer({ jwt }))
			.get('/late', ({ user, reply }) => reply(200, user.sub ?? ''));
		expect((await app.request('/late')).status).toBe(401);
		const token = await jwt.sign({ sub: 'ada' });
		const signed = await app.request('/late', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(await signed.text()).toBe('ada');
	});

	test('a route declared before it is guarded too, as 0.3 hooks did', async () => {
		const app = alxia()
			.get('/early', ({ reply }) => reply(200, 'early'))
			.plugin(bearer({ jwt }));
		expect((await app.request('/early')).status).toBe(401);
	});
});
