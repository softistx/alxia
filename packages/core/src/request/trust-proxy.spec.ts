import { describe, expect, test } from 'bun:test';
import { type TrustProxyOptions, trustProxy } from './trust-proxy';

/** What the option reads for a request from `peer` carrying `headers`. */
function read(
	options: TrustProxyOptions,
	headers: Record<string, string>,
	peer: string | null = '10.0.0.1',
) {
	const server =
		peer === null
			? undefined
			: ({
					requestIP: () => ({ address: peer }),
				} as unknown as Bun.Server<unknown>);
	return trustProxy(options)(
		new Request('http://app.internal:3000/', { headers }),
		server,
	);
}

const ranges = { trusted: ['10.0.0.0/8'] };

describe('hops', () => {
	test('the scheme and host the one proxy wrote', () => {
		const forwarded = read(
			{ trusted: 1 },
			{
				'x-forwarded-for': '203.0.113.9',
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'example.com',
			},
		);
		expect(forwarded).toEqual({
			ip: '203.0.113.9',
			origin: {
				protocol: 'https:',
				host: { hostname: 'example.com', port: '' },
			},
			refused: false,
		});
	});

	test('what the client wrote left of the proxies is never read', () => {
		const headers = {
			'x-forwarded-proto': 'https, http',
			'x-forwarded-host': 'evil.example, example.com',
		};
		expect(read({ trusted: 1 }, headers).origin).toEqual({
			protocol: 'http:',
			host: { hostname: 'example.com', port: '' },
		});
		expect(read({ trusted: 2 }, headers).origin.protocol).toBe('https:');
	});

	test('fewer entries than hops: the leftmost, which the outermost proxy set', () => {
		const headers = { 'x-forwarded-proto': 'https' };
		expect(read({ trusted: 2 }, headers).origin.protocol).toBe('https:');
	});
});

describe('CIDR trust', () => {
	test('the entry written by the proxy that met the client', () => {
		const headers = {
			'x-forwarded-for': '6.6.6.6, 203.0.113.9, 10.1.1.1',
			'x-forwarded-proto': 'http, https, http',
			'x-forwarded-host': 'evil.example, example.com:8443, inner.internal',
		};
		expect(read(ranges, headers)).toEqual({
			ip: '203.0.113.9',
			origin: {
				protocol: 'https:',
				host: { hostname: 'example.com', port: '8443' },
			},
			refused: false,
		});
	});

	test('a proxy that sets the scheme and host once', () => {
		const headers = {
			'x-forwarded-for': '203.0.113.9, 10.1.1.1',
			'x-forwarded-proto': 'https',
			'x-forwarded-host': 'example.com',
		};
		expect(read(ranges, headers).origin.protocol).toBe('https:');
		expect(read(ranges, headers).origin.host?.hostname).toBe('example.com');
	});

	test('no address header: the peer is the one proxy', () => {
		expect(
			read(ranges, { 'x-forwarded-proto': 'http, https' }).origin.protocol,
		).toBe('https:');
	});

	test('a function names the proxies too', () => {
		const trusted = (address: string) => address === '10.0.0.1';
		expect(
			read({ trusted }, { 'x-forwarded-proto': 'https' }).origin.protocol,
		).toBe('https:');
	});
});

describe('a direct client', () => {
	const spoofed = {
		'x-forwarded-for': '1.2.3.4',
		'x-forwarded-proto': 'https',
		'x-forwarded-host': 'bank.example',
		forwarded: 'for=1.2.3.4;proto=https;host=bank.example',
	};

	test('its spoofed scheme, host and address are ignored', () => {
		for (const header of ['x-forwarded-for', 'forwarded'])
			expect(read({ ...ranges, header }, spoofed, '198.51.100.4')).toEqual({
				ip: '198.51.100.4',
				origin: {},
				refused: false,
			});
	});

	test('a connection of unknown address is no proxy', () => {
		expect(read(ranges, spoofed, null)).toEqual({
			ip: undefined,
			origin: {},
			refused: false,
		});
	});

	test("untrusted: 'refuse' refuses it, for any forwarding header", () => {
		const refuse = { ...ranges, untrusted: 'refuse' } as const;
		for (const [name, value] of Object.entries(spoofed))
			expect(
				read(refuse, { [name]: value }, '198.51.100.4').refused,
			).toBeTrue();
		expect(
			read(
				{ ...refuse, header: 'x-real-ip' },
				{ 'x-real-ip': '1.2.3.4' },
				'198.51.100.4',
			).refused,
		).toBeTrue();
		expect(read(refuse, spoofed, null).refused).toBeTrue();
	});

	test('a probe that sends no forwarding header is never refused', () => {
		const refuse = { ...ranges, untrusted: 'refuse' } as const;
		expect(read(refuse, {}, '198.51.100.4')).toEqual({
			ip: '198.51.100.4',
			origin: {},
			refused: false,
		});
		expect(read(refuse, spoofed).refused).toBeFalse();
	});
});

describe('Forwarded (RFC 7239)', () => {
	const header = 'forwarded';

	test('proto and host of the element that names the client, quoted or not', () => {
		const headers = {
			forwarded:
				'for=6.6.6.6;proto=http;host=evil.example, for="[2001:db8::17]:4711";proto="https";host="Example.COM:8443", for=10.1.1.1;proto=http;host=inner',
		};
		expect(read({ ...ranges, header }, headers)).toEqual({
			ip: '2001:db8::17',
			origin: {
				protocol: 'https:',
				host: { hostname: 'example.com', port: '8443' },
			},
			refused: false,
		});
		expect(read({ trusted: 1, header }, headers).origin.host?.hostname).toBe(
			'inner',
		);
	});

	test('an element that does not say one leaves the request its own', () => {
		const headers = { forwarded: 'for=203.0.113.9;host=example.com' };
		expect(read({ trusted: 1, header }, headers).origin).toEqual({
			host: { hostname: 'example.com', port: '' },
		});
	});

	test('a parameter named twice in an element says nothing', () => {
		const headers = {
			forwarded: 'for=203.0.113.9;proto=http;proto=https;host=a;HOST=b',
		};
		expect(read({ trusted: 1, header }, headers)).toMatchObject({
			ip: '203.0.113.9',
			origin: {},
		});
	});

	test('X-Forwarded-Proto is not read beside it', () => {
		const headers = {
			forwarded: 'for=203.0.113.9',
			'x-forwarded-proto': 'https',
		};
		expect(read({ trusted: 1, header }, headers).origin).toEqual({});
	});
});

describe('the options', () => {
	test("'refuse' needs proxies named by address", () => {
		expect(() => trustProxy({ trusted: 1, untrusted: 'refuse' })).toThrow(
			'not a hop count',
		);
	});

	test('what is none of the choices is refused, naming trustProxy', () => {
		expect(() =>
			trustProxy({ ...ranges, untrusted: 'drop' as 'ignore' }),
		).toThrow("trustProxy: untrusted must be 'ignore' or 'refuse'");
		expect(() => trustProxy({ trusted: 0 })).toThrow(
			'trustProxy: trusted hops',
		);
		expect(() => trustProxy({ trusted: ['10.0.0.0/33'] })).toThrow(
			'trustProxy: "10.0.0.0/33"',
		);
	});
});
