import { describe, expect, test } from 'bun:test';
import { behindProxy, from, get } from '../../test/fixtures/proxy';
import { forwardedIp } from '../request/forwarded-ip';
import { trustProxy } from '../request/trust-proxy';
import { alxia } from './alxia';

const PROXY = from('10.0.0.1');

describe('a trusted function that throws', () => {
	const boom = () => {
		throw new Error('lookup failed for 10.0.0.1');
	};
	const reach = (served: { fetch: Parameters<typeof get>[0]['fetch'] }) =>
		get(served, '/where', behindProxy, PROXY);

	test('lands at the error boundary: a logged 500, nothing of the request in it', async () => {
		const logged: unknown[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => logged.push(args);
		try {
			const served = alxia({ proxy: trustProxy({ trusted: boom }) }).get(
				'/where',
				(ctx) => ctx.reply(200, { ip: ctx.ip ?? null }),
			);
			const response = await reach(served);
			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({ error: 'internal' });
			expect(logged).toHaveLength(1);
		} finally {
			console.error = original;
		}
	});

	test("is a problem under errors: 'problem'", async () => {
		const original = console.error;
		console.error = () => {};
		try {
			const served = alxia({
				proxy: trustProxy({ trusted: boom }),
				errors: 'problem',
			}).get('/where', (ctx) => ctx.reply(200, 'ok'));
			const response = await reach(served);
			expect(response.status).toBe(500);
			expect(response.headers.get('content-type')).toBe(
				'application/problem+json',
			);
			expect(await response.text()).not.toContain('10.0.0.1');
		} finally {
			console.error = original;
		}
	});

	test('forwardedIp is the same', async () => {
		const original = console.error;
		console.error = () => {};
		try {
			const served = alxia({ ip: forwardedIp({ trusted: boom }) }).get(
				'/where',
				(ctx) => ctx.reply(200, 'ok'),
			);
			expect((await reach(served)).status).toBe(500);
		} finally {
			console.error = original;
		}
	});

	test('no route ran, no middleware either', async () => {
		const original = console.error;
		console.error = () => {};
		let ran = false;
		try {
			const served = alxia({ proxy: trustProxy({ trusted: boom }) })
				.use(async (_ctx, next) => {
					ran = true;
					return next();
				})
				.get('/where', (ctx) => ctx.reply(200, 'ok'));
			expect((await reach(served)).status).toBe(500);
			expect(ran).toBe(false);
		} finally {
			console.error = original;
		}
	});
});
