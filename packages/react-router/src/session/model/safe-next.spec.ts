import { describe, expect, test } from 'bun:test';
import { HOME, safeNext } from './safe-next';

describe('safeNext', () => {
	test('keeps a path of this site, with its search and hash', () => {
		expect(safeNext('/orders/42/items?q=ada#top')).toBe(
			'/orders/42/items?q=ada#top',
		);
		expect(safeNext('/')).toBe('/');
		expect(HOME).toBe('/');
	});

	test('refuses anything that could leave the site', () => {
		for (const value of [
			'//evil.test',
			'//evil.test/orders',
			'/\\evil.test',
			'\\\\evil.test',
			'/\t/evil.test',
			'/\n/evil.test',
			' /orders',
			'https://evil.test/',
			'http:/evil.test',
			'javascript:alert(1)',
			'data:text/html,x',
			'orders/42',
			'',
			null,
			undefined,
			`/${'a'.repeat(2001)}`,
		]) {
			expect(safeNext(value)).toBe('/');
		}
	});

	test('refuses a value of 2001 characters and keeps one of 2000', () => {
		expect(safeNext(`/${'a'.repeat(2000)}`)).toBe('/');
		expect(safeNext(`/${'a'.repeat(1999)}`)).toBe(`/${'a'.repeat(1999)}`);
	});

	test('does not read a percent-encoded value as a way out', () => {
		// Not decoded by the browser's resolution: these stay paths of this site.
		expect(safeNext('/%2F%2Fevil.test')).toBe('/%2F%2Fevil.test');
		expect(safeNext('/%5Cevil.test')).toBe('/%5Cevil.test');
		// A decoded form is the refused one.
		expect(safeNext('%2F%2Fevil.test')).toBe('/');
		expect(safeNext(decodeURIComponent('%2F%2Fevil.test'))).toBe('/');
		expect(safeNext(decodeURIComponent('/%5Cevil'))).toBe('/');
	});

	test('normalises dot segments without leaving the site', () => {
		expect(safeNext('/orders/../..//evil.test')).toBe('/');
		expect(safeNext('/a/..//evil.test')).toBe('/');
		expect(safeNext('/a/./b')).toBe('/a/b');
	});

	test('names no app in its base host', () => {
		expect(safeNext('/a')).toBe('/a');
	});
});
