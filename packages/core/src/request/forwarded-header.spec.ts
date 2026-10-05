import { describe, expect, test } from 'bun:test';
import { elementsOf, listOf, unquote } from './forwarded-header';

describe('the header lists', () => {
	test('quoted-strings are unquoted, their escapes undone', () => {
		expect(unquote(' "a\\"b" ')).toBe('a"b');
		expect(unquote('"')).toBe('"');
		expect(unquote('plain')).toBe('plain');
	});

	test('a quote never swallows the entries a proxy appended after it', () => {
		expect(listOf('"https, http')).toEqual(['"https', 'http']);
		const [, last] = elementsOf('for="6.6.6.6, for=203.0.113.9;proto=https');
		expect(last?.for).toBe('203.0.113.9');
		expect(last?.params.get('proto')).toBe('https');
	});
});

describe('elementsOf', () => {
	test('the first for, and a parameter named twice marked', () => {
		const [element] = elementsOf(
			'For=1.1.1.1;for=2.2.2.2;proto=http;PROTO=https',
		);
		expect(element?.for).toBe('1.1.1.1');
		expect(element?.params.get('proto')).not.toBe('http');
		expect(element?.params.get('proto')).not.toBe('https');
	});

	test('a missing header has no element', () => {
		expect(elementsOf(null)).toEqual([]);
		expect(listOf(null)).toEqual([]);
	});
});
