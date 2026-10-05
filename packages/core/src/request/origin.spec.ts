import { describe, expect, test } from 'bun:test';
import { elementsOf, unquote } from './forwarded-header';
import { hostOf, protocolOf } from './origin';
import { trustProxy } from './trust-proxy';

describe('protocolOf', () => {
	test('http and https, in any case', () => {
		expect(protocolOf('https')).toBe('https:');
		expect(protocolOf(' HTTP ')).toBe('http:');
	});

	test('any other scheme says nothing', () => {
		for (const value of [
			undefined,
			'',
			'ftp',
			'javascript',
			'https:',
			'https://',
			'ws',
			'wss',
			'http s',
			'https\u0000',
		])
			expect(protocolOf(value)).toBeUndefined();
	});
});

describe('hostOf', () => {
	test('a name, an IPv4 or a bracketed IPv6 address, and a port', () => {
		expect(hostOf('Example.COM')).toEqual({
			hostname: 'example.com',
			port: '',
		});
		expect(hostOf('api.example.com:8443')).toEqual({
			hostname: 'api.example.com',
			port: '8443',
		});
		expect(hostOf('203.0.113.9:80')).toEqual({
			hostname: '203.0.113.9',
			port: '80',
		});
		expect(hostOf('[2001:DB8::1]:443')).toEqual({
			hostname: '[2001:db8::1]',
			port: '443',
		});
		expect(hostOf('xn--bcher-kva.example')?.hostname).toBe(
			'xn--bcher-kva.example',
		);
	});

	test('a path, userinfo, a query, a space or a bad port says nothing', () => {
		for (const value of [
			undefined,
			'',
			' ',
			'example.com/path',
			'example.com\\path',
			'user@example.com',
			'user:pw@example.com',
			'example.com?x=1',
			'example.com#x',
			'exa mple.com',
			'example.com:',
			'example.com:0',
			'example.com:65536',
			'example.com:08',
			'example.com:80:80',
			'example..com',
			'.example.com',
			'-example.com',
			'example-.com',
			'bücher.example',
			'0x7f.1',
			'1.2.3',
			'999.1.1.1',
			'[::1',
			'[1.2.3.4]',
			'[fe80::1%25eth0]',
			'::1',
			'example.com\r\nset-cookie: x=1',
			`${'a'.repeat(64)}.example`,
			`${'a.'.repeat(130)}example`,
		])
			expect(hostOf(value)).toBeUndefined();
	});
});

/** A seeded generator, so a failure replays. */
function random(seed: number) {
	let state = seed;
	return () => {
		state = (state * 1103515245 + 12345) & 0x7fffffff;
		return state / 0x7fffffff;
	};
}

const PIECES = [
	'http',
	'https',
	'HTTPS',
	'ftp',
	'for=',
	'proto=',
	'host=',
	'by=',
	'"',
	'\\',
	',',
	';',
	'=',
	':',
	'[',
	']',
	'/',
	'@',
	'?',
	'#',
	'%',
	' ',
	'\t',
	'.',
	'-',
	'_',
	'::1',
	'10.1.1.1',
	'203.0.113.9',
	'2001:db8::1',
	'example.com',
	'443',
	'99999',
	'unknown',
	'_hidden',
	'é',
];

describe('fuzzed headers', () => {
	test('never throw, and say only a valid scheme and host', () => {
		const next = random(7239);
		const piece = () => PIECES[Math.floor(next() * PIECES.length)] ?? '';
		const value = () =>
			Array.from({ length: Math.floor(next() * 12) }, piece).join('');
		const readers = [
			trustProxy({ trusted: 1 }),
			trustProxy({ trusted: 2, header: 'forwarded' }),
			trustProxy({ trusted: ['10.0.0.0/8'] }),
			trustProxy({ trusted: ['10.0.0.0/8'], header: 'forwarded' }),
		];
		const server = {
			requestIP: () => ({ address: '10.0.0.1' }),
		} as unknown as Bun.Server<unknown>;
		for (let run = 0; run < 3000; run++) {
			const headers = new Headers();
			for (const name of [
				'forwarded',
				'x-forwarded-for',
				'x-forwarded-proto',
				'x-forwarded-host',
			]) {
				if (next() < 0.8) headers.set(name, value());
			}
			const request = new Request('http://app.internal:3000/', { headers });
			for (const read of readers) {
				const { origin } = read(request, server);
				if (origin.protocol !== undefined)
					expect(['http:', 'https:']).toContain(origin.protocol);
				if (origin.host !== undefined) {
					const { hostname, port } = origin.host;
					const url = new URL(`http://${hostname}${port ? `:${port}` : ''}/`);
					expect(url.hostname).toBe(hostname);
					expect(hostname).not.toMatch(/[/@?#\s\\]/);
				}
			}
		}
	});

	test('the value parsers never throw on any string', () => {
		const next = random(160);
		for (let run = 0; run < 3000; run++) {
			const text = Array.from({ length: Math.floor(next() * 16) }, () =>
				String.fromCharCode(Math.floor(next() * 0x80)),
			).join('');
			expect(() => [
				protocolOf(text),
				hostOf(text),
				elementsOf(text),
				unquote(text),
			]).not.toThrow();
		}
	});
});
