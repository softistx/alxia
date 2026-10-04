import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { compress } from './compress';

const big = { text: 'x'.repeat(4096) };
const gzip = { 'accept-encoding': 'gzip' };

describe('app.plugin(compress()), deprecated', () => {
	test('a route declared after it is compressed', async () => {
		const app = alxia()
			.plugin(compress())
			.get('/late', ({ reply }) => reply(200, big));
		const response = await app.request('/late', { headers: gzip });
		expect(response.headers.get('content-encoding')).toBe('gzip');
	});

	test('a route declared before it is compressed too, as 0.3 hooks did', async () => {
		const app = alxia()
			.get('/early', ({ reply }) => reply(200, big))
			.plugin(compress());
		const response = await app.request('/early', { headers: gzip });
		expect(response.headers.get('content-encoding')).toBe('gzip');
	});
});
