import { describe, expect, test } from 'bun:test';
import { ipv6Network } from './ipv6-network';

describe('ipv6Network', () => {
	test('keeps the first 64 bits', () => {
		expect(ipv6Network('2001:db8:1:2:aaaa:bbbb:cccc:dddd', 64)).toBe(
			'2001:db8:1:2::/64',
		);
		expect(ipv6Network('2001:db8:1:2::1', 64)).toBe('2001:db8:1:2::/64');
	});

	test('other widths, 0 and 128 included', () => {
		expect(ipv6Network('2001:db8:1:2::1', 48)).toBe('2001:db8:1::/48');
		expect(ipv6Network('2001:db8:1:2::1', 56)).toBe('2001:db8:1::/56');
		expect(ipv6Network('2001:db8:1:2::1', 63)).toBe('2001:db8:1:2::/63');
		expect(ipv6Network('2001:db8:1:3::1', 63)).toBe('2001:db8:1:2::/63');
		expect(ipv6Network('2001:db8:1:2::1', 0)).toBe('::/0');
		expect(ipv6Network('2001:db8:1:2::1', 128)).toBe('2001:db8:1:2::1/128');
		expect(ipv6Network('2001:db8::', 128)).toBe('2001:db8::/128');
	});

	test('loopback and compressed or expanded forms agree', () => {
		expect(ipv6Network('::1', 64)).toBe('::/64');
		expect(ipv6Network('::1', 128)).toBe('::1/128');
		expect(ipv6Network('::', 64)).toBe('::/64');
		const forms = [
			'2001:db8::1',
			'2001:DB8:0:0:0:0:0:1',
			'2001:0db8:0000:0000:0000:0000:0000:0001',
			'2001:db8::0:1',
		];
		for (const form of forms)
			expect(ipv6Network(form, 64)).toBe('2001:db8::/64');
		expect(ipv6Network('1::', 128)).toBe('1::/128');
		expect(ipv6Network('1:0:0:2:0:0:0:3', 128)).toBe('1:0:0:2::3/128');
	});

	test('a zone id is dropped', () => {
		expect(ipv6Network('fe80::1%eth0', 64)).toBe('fe80::/64');
	});

	test('an embedded IPv4 tail is read', () => {
		expect(ipv6Network('64:ff9b::203.0.113.9', 128)).toBe(
			'64:ff9b::cb00:7109/128',
		);
	});

	test('IPv4 and IPv4-mapped addresses are their IPv4 address', () => {
		expect(ipv6Network('203.0.113.9', 64)).toBe('203.0.113.9');
		expect(ipv6Network('::ffff:203.0.113.9', 64)).toBe('203.0.113.9');
		expect(ipv6Network('::ffff:cb00:7109', 64)).toBe('203.0.113.9');
	});

	test('what is not an address is returned as it is', () => {
		for (const text of [
			'',
			'unknown',
			'1:2:3',
			'1::2::3',
			'12345::1',
			'g::1',
			'1:2:3:4:5:6:7:8:9',
			'::1.2.3.256',
			'1.2.3.4::',
			'1.2.3.4:1::',
			'1:2:3:4:5:6:7::8',
		])
			expect(ipv6Network(text, 64)).toBe(text);
	});
});
