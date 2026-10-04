import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { cors } from './cors';

const origin = { origin: 'https://a.example' };

describe('app.plugin(cors()), deprecated', () => {
	test('a route declared after it gets the headers', async () => {
		const app = alxia()
			.plugin(cors(origin))
			.get('/late', ({ reply }) => reply(200, 'late'));
		const response = await app.request('/late', { headers: origin });
		expect(response.headers.get('access-control-allow-origin')).toBe(
			'https://a.example',
		);
	});

	test('a route declared before it gets the headers too, as 0.3 hooks did', async () => {
		const app = alxia()
			.get('/early', ({ reply }) => reply(200, 'early'))
			.plugin(cors(origin));
		const response = await app.request('/early', { headers: origin });
		expect(response.headers.get('access-control-allow-origin')).toBe(
			'https://a.example',
		);
	});
});
