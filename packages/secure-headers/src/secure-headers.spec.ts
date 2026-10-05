import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { type Setting, secureHeaders } from './secure-headers';

describe('secureHeaders', () => {
	test('sets the defaults, keeps what a route set, takes options', async () => {
		const app = alxia()
			.use(
				secureHeaders({ referrerPolicy: 'same-origin', xFrameOptions: false }),
			)
			.get('/page', ({ reply }) =>
				reply(200, '<p>hi</p>', {
					headers: {
						'content-security-policy': "default-src 'self'",
						'x-powered-by': 'php',
					},
				}),
			);
		const response = await app.request('/page');
		expect(response.headers.get('content-security-policy')).toBe(
			"default-src 'self'",
		);
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('referrer-policy')).toBe('same-origin');
		expect(response.headers.get('x-frame-options')).toBeNull();
		expect(response.headers.get('x-powered-by')).toBeNull();
		expect(response.headers.get('strict-transport-security')).toContain(
			'max-age',
		);
	});

	test('sends every default, exactly, with no nonce anywhere', async () => {
		const app = alxia()
			.use(secureHeaders())
			.get('/', (ctx) => ctx.reply(200, String('nonce' in ctx)));
		const response = await app.request('/');
		expect(await response.text()).toBe('false');
		expect(
			[...response.headers].filter(
				([name]) => name !== 'content-type' && name !== 'content-length',
			),
		).toEqual([
			[
				'content-security-policy',
				"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
			],
			['cross-origin-opener-policy', 'same-origin'],
			['cross-origin-resource-policy', 'same-origin'],
			['origin-agent-cluster', '?1'],
			['referrer-policy', 'no-referrer'],
			['strict-transport-security', 'max-age=31536000; includeSubDomains'],
			['x-content-type-options', 'nosniff'],
			['x-dns-prefetch-control', 'off'],
			['x-frame-options', 'DENY'],
			['x-permitted-cross-domain-policies', 'none'],
		]);
	});

	test('a 404 is covered too', async () => {
		const app = alxia().use(secureHeaders());
		const response = await app.request('/nope');
		expect(response.status).toBe(404);
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	});

	test('an error a try/catch middleware answers, and a 500, are covered too', async () => {
		const original = console.error;
		console.error = () => {};
		try {
			const app = alxia()
				.use(secureHeaders())
				.use(async ({ reply }, next) => {
					try {
						return await next();
					} catch (error) {
						if (error instanceof RangeError) return reply(409, 'taken');
						throw error;
					}
				})
				.get('/taken', () => {
					throw new RangeError('taken');
				})
				.get('/boom', () => {
					throw new Error('boom');
				});
			for (const [path, status] of [
				['/taken', 409],
				['/boom', 500],
			] as const) {
				const response = await app.request(path);
				expect(response.status).toBe(status);
				expect(response.headers.get('x-content-type-options')).toBe('nosniff');
			}
		} finally {
			console.error = original;
		}
	});

	test('an empty value is refused, at once: false leaves a header out', () => {
		expect(() => secureHeaders({ contentSecurityPolicy: '' })).toThrow(
			'secureHeaders: contentSecurityPolicy is empty; give false to leave the content-security-policy header out',
		);
		expect(() => secureHeaders({ referrerPolicy: '  ' })).toThrow(TypeError);
		const setting: Setting = false;
		expect(() => secureHeaders({ xFrameOptions: setting })).not.toThrow();
	});
});
