import { describe, expect, test } from 'bun:test';
import { SIGN_IN_PATHS, secondFactorPath, signInPath } from './paths';

describe('SIGN_IN_PATHS', () => {
	test('are the defaults', () => {
		expect(SIGN_IN_PATHS).toEqual({
			signIn: '/sign-in',
			secondFactor: '/sign-in/second-factor',
		});
	});
});

describe('signInPath', () => {
	test('carries a safe next, and none for the home page', () => {
		expect(signInPath('/orders/42?q=a')).toBe(
			'/sign-in?next=%2Forders%2F42%3Fq%3Da',
		);
		expect(signInPath('/')).toBe('/sign-in');
		expect(signInPath('//evil.test')).toBe('/sign-in');
	});

	test('adds the query beside next', () => {
		expect(signInPath('/', { query: { expired: '1' } })).toBe(
			'/sign-in?expired=1',
		);
		expect(signInPath('/orders', { query: { expired: '1' } })).toBe(
			'/sign-in?expired=1&next=%2Forders',
		);
	});

	test('a next in the query never wins over the argument', () => {
		expect(signInPath('/orders', { query: { next: '//evil.test' } })).toBe(
			'/sign-in?next=%2Forders',
		);
	});

	test('takes the page from path', () => {
		expect(signInPath('/orders', { path: '/login' })).toBe(
			'/login?next=%2Forders',
		);
		expect(signInPath('/', { path: '/login' })).toBe('/login');
	});
});

describe('secondFactorPath', () => {
	test('is the second-factor page, coming back to a safe next', () => {
		expect(secondFactorPath('/orders')).toBe(
			'/sign-in/second-factor?next=%2Forders',
		);
		expect(secondFactorPath('/')).toBe('/sign-in/second-factor');
		expect(secondFactorPath('https://evil.test')).toBe(
			'/sign-in/second-factor',
		);
	});

	test('takes another page', () => {
		expect(secondFactorPath('/orders', '/sign-in/code')).toBe(
			'/sign-in/code?next=%2Forders',
		);
	});
});

describe('signInPath’s options.path', () => {
	test('a path of this site replaces /sign-in', () => {
		expect(signInPath('/orders', { path: '/login' })).toBe(
			'/login?next=%2Forders',
		);
	});

	test.each([
		['//evil.test', '//evil.test'],
		['https://evil.test/', 'https://evil.test/'],
		['login', 'login'],
		['', ''],
		['/login?x=1', '/login?…'],
		['/login#top', '/login?…'],
		['/a/..//evil.test', '/a/..//evil.test'],
	])('refuses %p with a TypeError', (path, shown) => {
		expect(() => signInPath('/', { path })).toThrow(
			new TypeError(
				`signInPath(): options.path must be a path of this site with no query or fragment, starting with a single "/"; got ${JSON.stringify(shown)}.`,
			),
		);
	});
});
