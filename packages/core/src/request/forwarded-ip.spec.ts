import { describe, expect, test } from 'bun:test';
import { alxia } from '../app/alxia';
import { type ForwardedIpOptions, forwardedIp } from './forwarded-ip';

/** What the option reads for a request from `peer` carrying `headers`. */
function read(
	options: ForwardedIpOptions,
	headers: Record<string, string>,
	peer: string | null = '10.0.0.1',
) {
	const server =
		peer === null
			? undefined
			: ({
					requestIP: () => ({ address: peer }),
				} as unknown as Bun.Server<unknown>);
	return forwardedIp(options)(
		new Request('http://localhost/', { headers }),
		server,
	);
}

describe('hops', () => {
	test('a spoofed first entry is ignored', () => {
		expect(
			read({ trusted: 1 }, { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }),
		).toBe('203.0.113.9');
	});

	test('one hop is the last entry, two the one before it', () => {
		const chain = { 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 10.0.0.7' };
		expect(read({ trusted: 1 }, chain)).toBe('10.0.0.7');
		expect(read({ trusted: 2 }, chain)).toBe('203.0.113.9');
		expect(read({ trusted: 3 }, chain)).toBe('6.6.6.6');
	});

	test('fewer entries than hops fall back to the connection', () => {
		expect(read({ trusted: 2 }, { 'x-forwarded-for': '203.0.113.9' })).toBe(
			'10.0.0.1',
		);
	});

	test('a count that is no positive integer is refused', () => {
		for (const trusted of [0, -1, 1.5, Number.NaN])
			expect(() => forwardedIp({ trusted })).toThrow('hops');
	});
});

describe('the connection', () => {
	test('a missing header is the socket address', () => {
		expect(read({ trusted: 1 }, {})).toBe('10.0.0.1');
		expect(read({ trusted: ['10.0.0.0/8'] }, {})).toBe('10.0.0.1');
	});

	test('no server and no header is undefined', () => {
		expect(read({ trusted: 1 }, {}, null)).toBeUndefined();
	});
});

describe('CIDR trust', () => {
	const trusted = ['10.0.0.0/8', '192.168.1.1'];

	test('the first entry from the right that is no proxy', () => {
		const headers = {
			'x-forwarded-for': '6.6.6.6, 203.0.113.9, 10.1.2.3, 192.168.1.1',
		};
		expect(read({ trusted }, headers)).toBe('203.0.113.9');
	});

	test('a connection outside the ranges is the client: its header is a lie', () => {
		expect(
			read({ trusted }, { 'x-forwarded-for': '6.6.6.6' }, '198.51.100.4'),
		).toBe('198.51.100.4');
	});

	test('a connection of unknown address is not trusted', () => {
		expect(
			read({ trusted }, { 'x-forwarded-for': '6.6.6.6' }, null),
		).toBeUndefined();
	});

	test('a chain of proxies alone is its leftmost entry', () => {
		expect(read({ trusted }, { 'x-forwarded-for': '10.9.9.9, 10.8.8.8' })).toBe(
			'10.9.9.9',
		);
	});

	test('a function names the proxies too', () => {
		const trusted = (address: string) => address.startsWith('10.');
		expect(
			read(
				{ trusted },
				{ 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 10.1.1.1' },
			),
		).toBe('203.0.113.9');
	});

	test('a range that is none is refused when the option is made', () => {
		for (const range of [
			'10.0.0.0/33',
			'nope',
			'10.0.0.0/',
			'::/129',
			'10.0.0.0/8/8',
		])
			expect(() => forwardedIp({ trusted: [range] })).toThrow('CIDR');
	});
});

describe('IPv6', () => {
	test('entries, brackets and ports', () => {
		const headers = { 'x-forwarded-for': '6.6.6.6, [2001:DB8::1]:4711' };
		expect(read({ trusted: 1 }, headers)).toBe('2001:db8::1');
		expect(
			read({ trusted: 1 }, { 'x-forwarded-for': '203.0.113.9:8080' }),
		).toBe('203.0.113.9');
	});

	test('ranges of IPv6 and of the IPv4 an IPv6 connection maps', () => {
		const trusted = ['fd00::/8', '10.0.0.0/8'];
		const headers = { 'x-forwarded-for': '2001:db8::7, fd12:3456::1' };
		expect(read({ trusted }, headers, 'fd00::2')).toBe('2001:db8::7');
		expect(read({ trusted }, headers, '::ffff:10.0.0.1')).toBe('2001:db8::7');
		expect(read({ trusted }, headers, '2001:db8:ffff::1')).toBe(
			'2001:db8:ffff::1',
		);
	});

	test('an IPv4 range does not hold an IPv6 address', () => {
		expect(
			read(
				{ trusted: ['0.0.0.0/0'] },
				{ 'x-forwarded-for': '2001:db8::7' },
				'::1',
			),
		).toBe('::1');
	});
});

describe('malformed entries', () => {
	test('one chosen that is no address falls back to the connection', () => {
		for (const entry of [
			'unknown',
			'',
			'not-an-ip',
			'999.1.1.1',
			'1.2.3',
			'1::2::3',
			'[::1',
		])
			expect(
				read({ trusted: 1 }, { 'x-forwarded-for': `6.6.6.6, ${entry}` }),
			).toBe('10.0.0.1');
	});

	test('one left of the chosen is never read', () => {
		expect(
			read({ trusted: 1 }, { 'x-forwarded-for': 'junk, 203.0.113.9' }),
		).toBe('203.0.113.9');
	});

	test('one met walking from the right stops the walk', () => {
		expect(
			read(
				{ trusted: ['10.0.0.0/8'] },
				{ 'x-forwarded-for': '6.6.6.6, junk, 10.1.1.1' },
			),
		).toBe('10.0.0.1');
	});
});

describe('Forwarded (RFC 7239)', () => {
	const trusted = 1;

	test('the for= of the last element', () => {
		const headers = {
			forwarded: 'for=6.6.6.6, for=203.0.113.9;proto=https;by=10.0.0.1',
		};
		expect(read({ header: 'forwarded', trusted }, headers)).toBe('203.0.113.9');
	});

	test('quoted IPv6 and ports, parameters in any order and case', () => {
		const headers = {
			forwarded: 'for=6.6.6.6, proto=https;For="[2001:db8:cafe::17]:4711"',
		};
		expect(read({ header: 'Forwarded', trusted }, headers)).toBe(
			'2001:db8:cafe::17',
		);
	});

	test('an obfuscated identifier or an element with no for is malformed', () => {
		for (const last of ['for=_hidden', 'for=unknown', 'proto=https'])
			expect(
				read(
					{ header: 'forwarded', trusted },
					{ forwarded: `for=6.6.6.6, ${last}` },
				),
			).toBe('10.0.0.1');
	});

	test('CIDR trust reads it too', () => {
		const headers = { forwarded: 'for=6.6.6.6, for=203.0.113.9, for=10.2.2.2' };
		expect(
			read({ header: 'forwarded', trusted: ['10.0.0.0/8'] }, headers),
		).toBe('203.0.113.9');
	});
});

describe('as the ip option', () => {
	test('ctx.ip is the client behind the proxy', async () => {
		const app = alxia({ ip: forwardedIp({ trusted: 1 }) }).get(
			'/ip',
			({ ip, reply }) => reply(200, ip ?? 'none'),
		);
		const server = {
			requestIP: () => ({ address: '10.0.0.1' }),
		} as unknown as Bun.Server<unknown>;
		const response = await app.fetch(
			new Request('http://localhost/ip', {
				headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' },
			}),
			server,
		);
		expect(await response.text()).toBe('203.0.113.9');
	});
});
