import { describe, expect, test } from 'bun:test';
import { TOTP_CODE } from './second-factor';

describe('TOTP_CODE', () => {
	test('takes six digits', () => {
		expect(TOTP_CODE.test('123456')).toBe(true);
		expect(TOTP_CODE.test('000000')).toBe(true);
	});

	test('refuses anything else', () => {
		for (const value of [
			'12345',
			'1234567',
			'12345a',
			' 123456',
			'123456\n',
			'12 456',
			'',
			'١٢٣٤٥٦',
		]) {
			expect(TOTP_CODE.test(value)).toBe(false);
		}
	});
});
