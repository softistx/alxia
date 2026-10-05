import { describe, expect, test } from 'bun:test';
import { forwardedIp } from '../request/forwarded-ip';
import { trustProxy } from '../request/trust-proxy';
import { alxia } from './alxia';
import type { AlxiaOptions } from './signatures';

/** A server whose every connection comes from `peer`. */
const from = (peer: string) =>
	({ requestIP: () => ({ address: peer }) }) as unknown as Bun.Server<unknown>;

/** `ctx.ip` for a request from `peer` carrying `headers`. */
async function ipOf(
	options: AlxiaOptions<''>,
	peer: string,
	headers: Record<string, string> = {},
) {
	const app = alxia(options).get('/ip', (ctx) => ctx.reply(200, ctx.ip ?? ''));
	const request = new Request('http://localhost/ip', { headers });
	return (await app.fetch(request, from(peer))).text();
}

const behind = { proxy: trustProxy({ trusted: ['10.0.0.0/8'] }) };

describe('ctx.ip is one text per address', () => {
	test('from the socket, by default', async () => {
		expect(await ipOf({}, '::ffff:203.0.113.9')).toBe('203.0.113.9');
		expect(await ipOf({}, '2001:DB8:0:0:0:0:0:1')).toBe('2001:db8::1');
		expect(await ipOf({}, 'fe80:0:0:0:0:0:0:1%en0')).toBe('fe80::1%en0');
	});

	test('from the header, whatever the notation', async () => {
		for (const written of [
			'2001:db8::1',
			'2001:DB8:0000:0000:0000:0000:0000:0001',
			'2001:db8:0:0::1',
		])
			expect(
				await ipOf(behind, '10.0.0.1', { 'x-forwarded-for': written }),
			).toBe('2001:db8::1');
		const forwarded = { forwarded: 'for="[::FFFF:203.0.113.9]:4711"' };
		const rfc = { proxy: trustProxy({ trusted: 1, header: 'forwarded' }) };
		expect(await ipOf(rfc, '10.0.0.1', forwarded)).toBe('203.0.113.9');
	});

	test('the socket and the header give the same client the same text', async () => {
		const direct = await ipOf(behind, '::ffff:203.0.113.9');
		const proxied = await ipOf(behind, '::ffff:10.0.0.1', {
			'x-forwarded-for': '203.0.113.9',
		});
		const viaIp = await ipOf(
			{ ip: forwardedIp({ trusted: ['10.0.0.0/8'] }) },
			'10.0.0.1',
			{ 'x-forwarded-for': '[::ffff:203.0.113.9]:1234' },
		);
		expect([direct, proxied, viaIp]).toEqual(Array(3).fill('203.0.113.9'));
	});

	test('a trusted function is given the canonical text', async () => {
		const seen: string[] = [];
		const named = {
			proxy: trustProxy({
				trusted: (address) => {
					seen.push(address);
					return address === '10.0.0.1';
				},
			}),
		};
		const ip = await ipOf(named, '::FFFF:10.0.0.1', {
			'x-forwarded-for': '2001:DB8::0:1',
		});
		expect(ip).toBe('2001:db8::1');
		expect(seen).toEqual(['10.0.0.1', '2001:db8::1']);
	});

	test('canonical: false keeps the address as written, lowercase', async () => {
		const raw = {
			proxy: trustProxy({ trusted: ['10.0.0.0/8'], canonical: false }),
		};
		expect(await ipOf(raw, '::FFFF:198.51.100.4')).toBe('::FFFF:198.51.100.4');
		expect(
			await ipOf(raw, '10.0.0.1', { 'x-forwarded-for': '2001:DB8:0:0::1' }),
		).toBe('2001:db8:0:0::1');
	});

	test('a custom ip function is read as it returns', async () => {
		const own = { ip: () => '::FFFF:198.51.100.4' };
		expect(await ipOf(own, '10.0.0.1')).toBe('::FFFF:198.51.100.4');
	});
});
