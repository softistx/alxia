import { describe, expect, test } from 'bun:test';
import { alxia, forwardedIp } from '@alxia/core';
import { rateLimit } from './rate-limit';

/** The proxy in front of the app, whose address the connection has. */
const proxy = {
	requestIP: () => ({ address: '10.0.0.1' }),
} as unknown as Bun.Server<unknown>;

/** The limit of 2 per window, counted by `ctx.ip`, behind the `ip` option it is given. */
const behind = (ip: ReturnType<typeof forwardedIp>) =>
	alxia({ ip })
		.use(rateLimit({ limit: 2, windowMs: 60_000 }))
		.get('/limited', ({ reply }) => reply(200, 'ok'));

/**
 * One client, 203.0.113.9, whom the proxy appends to the header. It writes a
 * new first entry on each request to be counted as someone else.
 */
async function statuses(app: ReturnType<typeof behind>) {
	const statuses: number[] = [];
	for (const spoof of ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4']) {
		const request = new Request('http://localhost/limited', {
			headers: { 'x-forwarded-for': `${spoof}, 203.0.113.9` },
		});
		statuses.push((await app.fetch(request, proxy)).status);
	}
	return statuses;
}

describe('a rate limit keyed by ip behind a proxy', () => {
	test('the documented first-entry snippet is bypassed by a spoofed header', async () => {
		const app = behind(
			(request, server) =>
				request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
				server?.requestIP(request)?.address,
		);
		expect(await statuses(app)).toEqual([200, 200, 200, 200]);
	});

	test('forwardedIp counts the client the proxy saw: a spoofed header buys nothing', async () => {
		const app = behind(forwardedIp({ trusted: 1 }));
		expect(await statuses(app)).toEqual([200, 200, 429, 429]);
	});

	test('with the proxy named by its range too', async () => {
		const app = behind(forwardedIp({ trusted: ['10.0.0.0/8'] }));
		expect(await statuses(app)).toEqual([200, 200, 429, 429]);
	});

	test('a client that reaches the app directly cannot name itself', async () => {
		const app = behind(forwardedIp({ trusted: ['10.0.0.0/8'] }));
		const direct = {
			requestIP: () => ({ address: '198.51.100.4' }),
		} as unknown as Bun.Server<unknown>;
		const results: number[] = [];
		for (const spoof of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) {
			const request = new Request('http://localhost/limited', {
				headers: { 'x-forwarded-for': spoof },
			});
			results.push((await app.fetch(request, direct)).status);
		}
		expect(results).toEqual([200, 200, 429]);
	});
});
