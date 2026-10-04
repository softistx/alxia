import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { cors } from './cors';

const route = alxia().get('/data', ({ reply }) => reply(200, { ok: true }));

const preflight = (origin: string, headers: Record<string, string> = {}) =>
	new Request('http://localhost/data', {
		method: 'OPTIONS',
		headers: {
			origin,
			'access-control-request-method': 'POST',
			...headers,
		},
	});

describe('cors', () => {
	test('every origin by default: a star, a preflight answered', async () => {
		const app = alxia().use(cors()).plugin(route);
		const response = await app.request('/data', {
			headers: { origin: 'https://a.example' },
		});
		expect(response.headers.get('access-control-allow-origin')).toBe('*');
		const answered = await app.fetch(
			preflight('https://a.example', {
				'access-control-request-headers': 'x-token',
			}),
		);
		expect(answered.status).toBe(204);
		expect(answered.headers.get('access-control-allow-headers')).toBe(
			'x-token',
		);
		expect(answered.headers.get('access-control-allow-methods')).toContain(
			'POST',
		);
		expect(answered.headers.get('access-control-allow-methods')).toContain(
			'QUERY',
		);
	});

	test('a list of origins: the allowed one echoed, another refused', async () => {
		const app = alxia()
			.use(
				cors({
					origin: ['https://a.example', /\.b\.example$/],
					credentials: true,
					exposedHeaders: ['x-total'],
					maxAge: 600,
				}),
			)
			.plugin(route);
		const allowed = await app.request('/data', {
			headers: { origin: 'https://x.b.example' },
		});
		expect(allowed.headers.get('access-control-allow-origin')).toBe(
			'https://x.b.example',
		);
		expect(allowed.headers.get('access-control-allow-credentials')).toBe(
			'true',
		);
		expect(allowed.headers.get('access-control-expose-headers')).toBe(
			'x-total',
		);
		expect(allowed.headers.get('vary')).toBe('Origin');

		const refused = await app.request('/data', {
			headers: { origin: 'https://evil.example' },
		});
		expect(refused.headers.get('access-control-allow-origin')).toBeNull();
		const refusedPreflight = await app.fetch(preflight('https://evil.example'));
		expect(
			refusedPreflight.headers.get('access-control-allow-origin'),
		).toBeNull();
		const okPreflight = await app.fetch(preflight('https://a.example'));
		expect(okPreflight.headers.get('access-control-max-age')).toBe('600');
	});

	test('credentials with every origin echo the origin, never a star', async () => {
		const app = alxia()
			.use(cors({ credentials: true }))
			.plugin(route);
		const response = await app.request('/data', {
			headers: { origin: 'https://c.example' },
		});
		expect(response.headers.get('access-control-allow-origin')).toBe(
			'https://c.example',
		);
	});

	test('an origin function that throws: the response sent whole, without the headers', async () => {
		const app = alxia()
			.use(
				cors({
					origin: (origin) => new URL(origin).hostname === 'a.example',
				}),
			)
			.plugin(route);
		const original = console.error;
		console.error = () => {};
		try {
			const response = await app.request('/data', {
				headers: { origin: 'not a url' },
			});
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ ok: true });
			expect(response.headers.get('access-control-allow-origin')).toBeNull();
		} finally {
			console.error = original;
		}
	});

	test('a preflight to any path is answered, and a 404 carries the headers', async () => {
		const app = alxia()
			.use(cors({ origin: 'https://a.example' }))
			.plugin(route);
		const answered = await app.fetch(
			new Request('http://localhost/elsewhere', {
				method: 'OPTIONS',
				headers: {
					origin: 'https://a.example',
					'access-control-request-method': 'PUT',
				},
			}),
		);
		expect(answered.status).toBe(204);
		expect(answered.headers.get('access-control-allow-origin')).toBe(
			'https://a.example',
		);
		const missing = await app.request('/missing', {
			headers: { origin: 'https://a.example' },
		});
		expect(missing.status).toBe(404);
		expect(missing.headers.get('access-control-allow-origin')).toBe(
			'https://a.example',
		);
	});
});
