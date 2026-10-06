import { describe, expect, test } from 'bun:test';
import { ORIGIN, originalUrl } from '../app/original-url';
import { portOf } from './origin';
import { type TrustProxyOptions, trustProxy } from './trust-proxy';

/** `originalUrl` of a request to the app's own address, as the option read it from `headers`. */
function href(
	options: TrustProxyOptions,
	headers: Record<string, string>,
	peer = '10.0.0.1',
): string {
	const server = {
		requestIP: () => ({ address: peer }),
	} as unknown as Bun.Server<unknown>;
	const request = new Request('http://app.internal:3000/p?q=1', { headers });
	const { origin } = trustProxy(options)(request, server);
	return originalUrl({ url: new URL(request.url), [ORIGIN]: origin } as never)
		.href;
}

const ranges = { trusted: ['10.0.0.0/8'] };
const host = { 'x-forwarded-host': 'api.example.com' };

describe('X-Forwarded-Port', () => {
	test('names the port of the forwarded host', () => {
		expect(href(ranges, { ...host, 'x-forwarded-port': '8443' })).toBe(
			'http://api.example.com:8443/p?q=1',
		);
	});

	test('a port the host carries wins: it was written with the host', () => {
		expect(
			href(ranges, {
				'x-forwarded-host': 'api.example.com:9000',
				'x-forwarded-port': '8443',
			}),
		).toBe('http://api.example.com:9000/p?q=1');
	});

	test('the scheme default is dropped, from either one', () => {
		const https = { 'x-forwarded-proto': 'https', ...host };
		expect(href(ranges, { ...https, 'x-forwarded-port': '443' })).toBe(
			'https://api.example.com/p?q=1',
		);
		expect(
			href(ranges, {
				'x-forwarded-proto': 'http',
				...host,
				'x-forwarded-port': '80',
			}),
		).toBe('http://api.example.com/p?q=1');
		expect(href(ranges, { ...https, 'x-forwarded-port': '80' })).toBe(
			'https://api.example.com:80/p?q=1',
		);
	});

	test('a malformed value is ignored, like any malformed entry', () => {
		for (const bad of [
			'0',
			'65536',
			'8o43',
			'-1',
			'+80',
			'08443',
			'',
			'1 2',
			'8443/x',
			'0x50',
		])
			expect(href(ranges, { ...host, 'x-forwarded-port': bad })).toBe(
				'http://api.example.com/p?q=1',
			);
	});

	test("without a forwarded host the app's own host stays, whole", () => {
		expect(
			href(ranges, {
				'x-forwarded-proto': 'https',
				'x-forwarded-port': '8443',
			}),
		).toBe('https://app.internal:3000/p?q=1');
	});

	test("an untrusted peer's header is not read", () => {
		const headers = { ...host, 'x-forwarded-port': '8443' };
		expect(href(ranges, headers, '8.8.8.8')).toBe(
			'http://app.internal:3000/p?q=1',
		);
	});

	test('an appending chain: the one the outermost trusted hop wrote', () => {
		const headers = {
			'x-forwarded-for': '6.6.6.6, 203.0.113.9, 10.1.1.1',
			'x-forwarded-host': 'evil.example, api.example.com, inner.internal',
			'x-forwarded-port': '1111, 8443, 3000',
		};
		expect(href(ranges, headers)).toBe('http://api.example.com:8443/p?q=1');
		expect(href({ trusted: 2 }, headers)).toBe(
			'http://api.example.com:8443/p?q=1',
		);
	});

	test('RFC 7239 has no port parameter: Forwarded keeps the one in host=, and ignores the header', () => {
		const forwarded = { header: 'forwarded', trusted: 1 };
		expect(
			href(forwarded, {
				forwarded: 'for=203.0.113.9;host=api.example.com:8443',
				'x-forwarded-port': '9000',
			}),
		).toBe('http://api.example.com:8443/p?q=1');
		expect(
			href(forwarded, {
				forwarded: 'for=203.0.113.9;host=api.example.com',
				'x-forwarded-port': '9000',
			}),
		).toBe('http://api.example.com/p?q=1');
	});
});

describe('untrusted: refuse', () => {
	test('X-Forwarded-Port from a connection that is no proxy is refused, as the others', () => {
		const server = {
			requestIP: () => ({ address: '8.8.8.8' }),
		} as unknown as Bun.Server<unknown>;
		const read = trustProxy({ ...ranges, untrusted: 'refuse' });
		const request = new Request('http://app.internal/', {
			headers: { 'x-forwarded-port': '8443' },
		});
		expect(read(request, server)).toMatchObject({
			refused: true,
			refusal: 'headers',
		});
	});
});

describe('portOf', () => {
	test('digits from 1 to 65535', () => {
		expect(portOf(' 8443 ')).toBe('8443');
		expect(portOf('65535')).toBe('65535');
		expect(portOf('65536')).toBeUndefined();
		expect(portOf(undefined)).toBeUndefined();
	});
});
