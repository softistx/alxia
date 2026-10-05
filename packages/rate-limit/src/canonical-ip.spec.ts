import { describe, expect, test } from 'bun:test';
import { alxia, trustProxy } from '@alxia/core';
import { rateLimit } from './rate-limit';

/** A server whose every connection comes from `peer`. */
const from = (peer: string) =>
	({ requestIP: () => ({ address: peer }) }) as unknown as Bun.Server<unknown>;

/** A limit of 3 per window, counted by `ctx.ip`, behind the proxies in 10.0.0.0/8. */
const limited = () =>
	alxia({ proxy: trustProxy({ trusted: ['10.0.0.0/8'] }) })
		.use(rateLimit({ limit: 3, windowMs: 60_000 }))
		.get('/limited', ({ reply }) => reply(200, 'ok'));

describe('one client is one bucket, however its address is written', () => {
	test('IPv6 notations share a bucket', async () => {
		const app = limited();
		const statuses: number[] = [];
		for (const written of [
			'2001:db8::1',
			'2001:DB8:0000:0000:0000:0000:0000:0001',
			'[2001:db8:0:0::1]:4711',
			'2001:0db8::0001',
		]) {
			const request = new Request('http://localhost/limited', {
				headers: { 'x-forwarded-for': written },
			});
			statuses.push((await app.fetch(request, from('10.0.0.1'))).status);
		}
		expect(statuses).toEqual([200, 200, 200, 429]);
	});

	test('the socket and the header, mapped or not, share a bucket', async () => {
		const app = limited();
		const statuses: number[] = [];
		const sent: [string, Record<string, string>][] = [
			['::ffff:203.0.113.9', {}], // straight to the app, dual-stack
			['203.0.113.9', {}],
			['10.0.0.1', { 'x-forwarded-for': '::FFFF:203.0.113.9' }],
			['::ffff:10.0.0.1', { 'x-forwarded-for': '203.0.113.9' }],
		];
		for (const [peer, headers] of sent) {
			const request = new Request('http://localhost/limited', { headers });
			statuses.push((await app.fetch(request, from(peer))).status);
		}
		expect(statuses).toEqual([200, 200, 200, 429]);
	});
});
