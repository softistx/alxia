import { describe, expect, test } from 'bun:test';
import { refusal } from '../../test/errors/refusal';
import { retryAfterOf } from './api-error';

const wait = (extensions: Record<string, unknown>) =>
	retryAfterOf(refusal('MAIL_THROTTLED', 'Slow down', extensions, 429));

describe('retryAfterOf', () => {
	test('a finite number from 0, rounded up', () => {
		expect(wait({ retryAfter: 90 })).toBe(90);
		expect(wait({ retryAfter: 1.2 })).toBe(2);
		expect(wait({ retryAfter: 0 })).toBe(0);
	});

	test('-0 is 0', () => {
		expect(Object.is(wait({ retryAfter: -0 }), 0)).toBe(true);
	});

	test('a decimal string, trimmed', () => {
		expect(wait({ retryAfter: '45' })).toBe(45);
		expect(wait({ retryAfter: ' 7.5 ' })).toBe(8);
	});

	test.each([
		['soon'],
		[''],
		['  '],
		['-5'],
		['1e3'],
		['0x10'],
		['Infinity'],
		['5 s'],
		[-5],
		[Number.NaN],
		[Number.POSITIVE_INFINITY],
		[null],
		[true],
		[[]],
	])('%p is not usable', (value) => {
		expect(wait({ retryAfter: value })).toBeUndefined();
	});

	test('clamped to a day', () => {
		expect(wait({ retryAfter: 86_400 })).toBe(86_400);
		expect(wait({ retryAfter: 1_000_000 })).toBe(86_400);
		expect(wait({ retryAfter: '9999999' })).toBe(86_400);
	});

	test('params first; an unusable params value falls back to the extensions', () => {
		expect(wait({ params: { retryAfter: 30 }, retryAfter: 90 })).toBe(30);
		expect(wait({ params: { retryAfter: 'soon' }, retryAfter: 90 })).toBe(90);
		expect(wait({ params: { retryAfter: -1 }, retryAfter: '12' })).toBe(12);
		expect(wait({ params: { retryAfter: 'soon' } })).toBeUndefined();
	});

	test('none sent', () => {
		expect(wait({})).toBeUndefined();
	});
});
