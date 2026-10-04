import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { rateLimit } from './rate-limit';

const once = () => rateLimit({ limit: 1, windowMs: 60_000 });

describe('app.plugin(rateLimit()), deprecated', () => {
	test('a route declared after it is limited', async () => {
		const app = alxia({ ip: () => '1.2.3.4' })
			.plugin(once())
			.get('/late', ({ reply }) => reply(200, 'late'));
		expect((await app.request('/late')).status).toBe(200);
		expect((await app.request('/late')).status).toBe(429);
	});

	test('a route declared before it is limited too, as 0.3 hooks did', async () => {
		const app = alxia({ ip: () => '1.2.3.4' })
			.get('/early', ({ reply }) => reply(200, 'early'))
			.plugin(once());
		expect((await app.request('/early')).status).toBe(200);
		expect((await app.request('/early')).status).toBe(429);
	});
});
