import { describe, expect, test } from 'bun:test';
import { parseRange } from './conditional';

describe('parseRange', () => {
	test('one range, a suffix, an open end; several ranges are ignored', () => {
		expect(parseRange('bytes=0-0', 10)).toEqual({ start: 0, end: 0 });
		expect(parseRange('bytes=5-', 10)).toEqual({ start: 5, end: 9 });
		expect(parseRange('bytes=-20', 10)).toEqual({ start: 0, end: 9 });
		expect(parseRange('bytes=3-100', 10)).toEqual({ start: 3, end: 9 });
		expect(parseRange('bytes=10-', 10)).toBe('unsatisfiable');
		expect(parseRange('bytes=0-1,3-4', 10)).toBeUndefined();
		expect(parseRange('items=0-1', 10)).toBeUndefined();
	});

	test('no range of an empty file is satisfiable', () => {
		expect(parseRange('bytes=-5', 0)).toBe('unsatisfiable');
		expect(parseRange('bytes=0-', 0)).toBe('unsatisfiable');
		expect(parseRange('bytes=0-0', 0)).toBe('unsatisfiable');
	});
});
