import { describe, expect, test } from 'bun:test';
import { parseCidr, parseIp } from './ip-address';

describe('parseIp', () => {
	test('IPv4, IPv6, brackets and ports', () => {
		expect(parseIp('203.0.113.9:8080')?.text).toBe('203.0.113.9');
		expect(parseIp('[2001:DB8::1]:443')?.text).toBe('2001:db8::1');
		expect(parseIp('::1')).toMatchObject({ version: 6, value: 1n });
		expect(parseIp('::ffff:10.0.0.1')).toMatchObject({ version: 4 });
		expect(parseIp('64:ff9b::1.2.3.4')?.version).toBe(6);
	});

	test('what is no address is undefined, and never throws', () => {
		for (const entry of [
			'',
			'unknown',
			'_hidden',
			'fe80::1%eth0',
			'1.2.3.4%x',
			'010.0.0.1',
			'1.2.3',
			'1::2::3',
			'[::1',
			'1.2.3.4:99999x',
		])
			expect(parseIp(entry)).toBeUndefined();
	});
});

describe('parseCidr', () => {
	test('a range holds its addresses of its own family', () => {
		const inRange = parseCidr('10.0.0.0/8');
		expect(inRange(parseIp('10.255.0.1') as never)).toBe(true);
		expect(inRange(parseIp('11.0.0.1') as never)).toBe(false);
		expect(inRange(parseIp('::a00:1') as never)).toBe(false);
	});

	test('one address is its own range', () => {
		expect(parseCidr('192.168.1.1')(parseIp('192.168.1.1') as never)).toBe(
			true,
		);
		expect(parseCidr('192.168.1.1')(parseIp('192.168.1.2') as never)).toBe(
			false,
		);
	});

	test('a mapped range counts its prefix in IPv6 bits', () => {
		const inRange = parseCidr('::ffff:10.0.0.0/104');
		expect(inRange(parseIp('10.1.1.1') as never)).toBe(true);
		expect(inRange(parseIp('11.1.1.1') as never)).toBe(false);
		expect(() => parseCidr('::ffff:10.0.0.0/64')).toThrow('CIDR');
	});

	test('a prefix is plain decimal digits', () => {
		for (const range of [
			'10.0.0.0/08x',
			'10.0.0.0/1e1',
			'10.0.0.0/ 8',
			'10.0.0.0/0x8',
			'10.0.0.0/-1',
			'fe80::1%eth0/64',
		])
			expect(() => parseCidr(range)).toThrow('CIDR');
	});
});
