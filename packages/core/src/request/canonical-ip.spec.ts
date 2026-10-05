import { describe, expect, test } from 'bun:test';
import { isIP } from 'node:net';
import { canonicalIp, canonicalOf, type ParsedIp, parseIp } from './ip-address';
import { ipv6Text } from './ip-text';

describe('canonicalIp', () => {
	test('IPv6 as RFC 5952 writes it', () => {
		const cases: [string, string][] = [
			['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
			['2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1'], // the first of equal runs
			['2001:db8:0:1:0:0:0:1', '2001:db8:0:1::1'], // the longest run
			['2001:db8:0:1:1:1:1:1', '2001:db8:0:1:1:1:1:1'], // one zero group stays
			['0:0:0:0:0:0:0:0', '::'],
			['0:0:0:0:0:0:0:1', '::1'],
			['1:0:0:0:0:0:0:0', '1::'],
			['FE80::0001', 'fe80::1'],
			['2001:db8::0.0.0.1', '2001:db8::1'],
		];
		for (const [given, canonical] of cases)
			expect(canonicalIp(given)).toBe(canonical);
	});

	test('an IPv4-mapped address is IPv4', () => {
		for (const given of [
			'::ffff:192.0.2.1',
			'::FFFF:192.0.2.1',
			'0:0:0:0:0:ffff:c000:201',
			'[::ffff:192.0.2.1]:443',
			'192.0.2.1:8080',
		])
			expect(canonicalIp(given)).toBe('192.0.2.1');
	});

	test('brackets and a port are dropped', () => {
		expect(canonicalIp('[2001:DB8::1]:443')).toBe('2001:db8::1');
		expect(canonicalIp(' [::1] ')).toBe('::1');
	});

	test('a zone id is kept, as written, after the canonical address', () => {
		expect(canonicalIp('FE80:0:0:0:0:0:0:1%en0')).toBe('fe80::1%en0');
		expect(canonicalIp('[fe80::0001%Eth0]:80')).toBe('fe80::1%Eth0');
		expect(canonicalIp('::FFFF:1.2.3.4%en0')).toBe('::ffff:1.2.3.4%en0');
		// In a header, an entry with a zone names no client, as before.
		expect(parseIp('fe80::1%en0')).toBeUndefined();
	});

	test('what is no address comes back as given', () => {
		for (const given of [
			'unknown',
			'_hidden',
			'',
			'1.2.3',
			'010.0.0.1',
			'1.2.3.4%x',
			'fe80::1%',
		])
			expect(canonicalIp(given)).toBe(given);
	});

	test('it is idempotent, and parseIp gives the same text', () => {
		for (const given of ['::FFFF:10.0.0.1', '2001:DB8:0:0::1', '10.0.0.1']) {
			const canonical = canonicalIp(given);
			expect(canonicalIp(canonical)).toBe(canonical);
			expect(canonicalOf(parseIp(given) as ParsedIp)).toBe(canonical);
		}
	});
});

/** A seeded generator, so a failure is the same on every run. */
function random(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 1103515245 + 12345) % 2 ** 31;
		return state / 2 ** 31;
	};
}

/** Eight groups, mostly zero so that runs of every length come up. */
function groupsOf(next: () => number): number[] {
	return Array.from({ length: 8 }, () =>
		next() < 0.5 ? 0 : Math.floor(next() * 0x10000),
	);
}

/** One of the many ways to write the same address. */
function written(groups: readonly number[], next: () => number): string {
	const hex = groups.map((group) => {
		const text = group.toString(16);
		const padded = next() < 0.5 ? text.padStart(4, '0') : text;
		return next() < 0.5 ? padded.toUpperCase() : padded;
	});
	const text = hex.join(':');
	if (next() < 0.3) return `[${text}]:${1 + Math.floor(next() * 65535)}`;
	return text;
}

describe('fuzzed notations', () => {
	test('every notation of an address has one text, the URL parser’s for IPv6', () => {
		const next = random(5952);
		for (let run = 0; run < 3000; run++) {
			const groups = groupsOf(next);
			const value = groups.reduce((v, g) => (v << 16n) | BigInt(g), 0n);
			const canonical = canonicalIp(written(groups, next));
			expect(isIP(canonical)).not.toBe(0);
			expect(canonicalIp(canonical)).toBe(canonical);
			expect(parseIp(canonical)?.value).toBe(
				value >> 32n === 0xffffn ? value & 0xffffffffn : value,
			);
			if (value >> 32n !== 0xffffn) {
				expect(canonical).toBe(ipv6Text(value));
				// WHATWG's IPv6 serializer compresses as RFC 5952 does.
				expect(`[${canonical}]`).toBe(
					new URL(`http://[${canonical}]/`).hostname,
				);
			}
		}
	});
});
