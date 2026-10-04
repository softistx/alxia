import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { cors } from './cors';

// `new URL('null')` throws: the `Origin: null` of a sandboxed iframe.
const app = alxia()
	.use(cors({ origin: (origin) => new URL(origin).hostname === 'a.example' }))
	.get('/data', ({ reply }) => reply(200, { ok: true }));

describe('an origin function that throws', () => {
	let logged: unknown[] = [];
	const original = console.error;
	beforeEach(() => {
		logged = [];
		console.error = (error: unknown) => {
			logged.push(error);
		};
	});
	afterEach(() => {
		console.error = original;
	});

	test('a preflight is still a 204, without CORS headers, the throw logged', async () => {
		const answered = await app.request('/data', {
			method: 'OPTIONS',
			headers: { origin: 'null', 'access-control-request-method': 'POST' },
		});
		expect(answered.status).toBe(204);
		expect(answered.headers.get('access-control-allow-origin')).toBeNull();
		expect(answered.headers.get('access-control-allow-methods')).toBeNull();
		expect(answered.headers.get('vary')).toBe('Origin');
		expect(logged).toHaveLength(1);
		expect(logged[0]).toBeInstanceOf(TypeError);
	});

	test('a request gets the route answer, without CORS headers, the throw logged', async () => {
		const response = await app.request('/data', {
			headers: { origin: 'null' },
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(response.headers.get('access-control-allow-origin')).toBeNull();
		expect(logged).toHaveLength(1);
	});

	test('an origin it reads still gets its headers, on both', async () => {
		const answered = await app.request('/data', {
			method: 'OPTIONS',
			headers: {
				origin: 'https://a.example',
				'access-control-request-method': 'POST',
			},
		});
		expect(answered.headers.get('access-control-allow-origin')).toBe(
			'https://a.example',
		);
		const response = await app.request('/data', {
			headers: { origin: 'https://a.example' },
		});
		expect(response.headers.get('access-control-allow-origin')).toBe(
			'https://a.example',
		);
		expect(logged).toEqual([]);
	});
});
