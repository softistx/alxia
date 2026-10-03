import { describe, expect, test } from 'bun:test';
import { compilePath } from './compile';
import { Router } from './router';

describe('compilePath', () => {
	test('erases parameter names from the shape', () => {
		expect(compilePath('/users/:id/posts/*').shape).toBe('/users/:/posts/*');
	});

	test('refuses a path that is not absolute, or a misplaced wildcard', () => {
		expect(() => compilePath('users')).toThrow('must start with "/"');
		expect(() => compilePath('/a/*/b')).toThrow('may only end a path');
		expect(() => compilePath('/a/:id/:id')).toThrow('twice');
	});

	test('refuses a `:` or a `*` inside a segment', () => {
		for (const path of ['/at/10:30', '/at/x:y', '/at/a:']) {
			expect(() => compilePath(path)).toThrow(
				new TypeError(
					`"${path}": ":" may only start a segment, as a parameter`,
				),
			);
		}
		for (const path of ['/*a', '/a*', '/a*b', '/a/x*/b']) {
			expect(() => compilePath(path)).toThrow(
				new TypeError(
					`"${path}": "*" may only be a whole segment, as a wildcard`,
				),
			);
		}
	});

	test('refuses a dot segment, which a URL resolves away', () => {
		for (const [path, segment] of [
			['/.', '.'],
			['/a/..', '..'],
			['/a/./b', '.'],
			['/a/%2e/b', '%2e'],
			['/a/%2E%2E', '%2E%2E'],
		]) {
			expect(() => compilePath(path as string)).toThrow(
				new TypeError(
					`"${path}": "${segment}" is a dot segment, which a request's URL never keeps`,
				),
			);
		}
	});

	test('refuses a literal not encoded as a request carries it, and names the form', () => {
		for (const [path, carried] of [
			['/caf\u00e9', '/caf%C3%A9'],
			['/u/:id/\u00e9', '/u/:id/%C3%A9'],
			['/a b', '/a%20b'],
			['/a"b', '/a%22b'],
			['/a{b}', '/a%7Bb%7D'],
			['/a^b', '/a%5Eb'],
			['/a?b', '/a%3Fb'],
			['/a#b', '/a%23b'],
			['/a\\b', '/a%5Cb'],
			['/a\tb', '/a%09b'],
		]) {
			expect(() => compilePath(path as string)).toThrow(
				new TypeError(
					`"${path}" is not encoded as a request's URL carries it: declare "${carried}"`,
				),
			);
		}
	});

	test('takes what a URL keeps as it is', () => {
		for (const path of [
			'/caf%C3%A9',
			'/caf%c3%a9',
			'/a%20b',
			'/%',
			'/100%',
			'/%zz',
			'/a|b',
			"/a'b",
			'/a~b',
			'/.well-known/x',
			'/a..b',
			'//',
			'/a//b',
			'/a/',
			'/',
		]) {
			expect(compilePath(path).path).toBe(path);
		}
	});
});

describe('Router', () => {
	test('a static path wins over one with parameters', () => {
		const router = new Router<string>();
		router.add('GET', '/users/:id', 'one');
		router.add('GET', '/users/me', 'me');
		expect(router.match('GET', '/users/me')).toEqual({
			path: '/users/me',
			value: 'me',
			params: {},
		});
		expect(router.match('GET', '/users/7')).toEqual({
			path: '/users/:id',
			value: 'one',
			params: { id: '7' },
		});
	});

	test('parameters are decoded', () => {
		const router = new Router<string>();
		router.add('GET', '/tags/:tag', 'tag');
		expect(router.match('GET', '/tags/a%20b')).toEqual({
			path: '/tags/:tag',
			value: 'tag',
			params: { tag: 'a b' },
		});
	});

	test('refuses two paths of one shape with other names', () => {
		const router = new Router<string>();
		router.add('GET', '/users/:id', 'a');
		expect(() => router.add('POST', '/users/:userId', 'b')).toThrow(
			'same names',
		);
	});

	test('refuses a route declared twice', () => {
		const router = new Router<string>();
		router.add('GET', '/a', 'a');
		expect(() => router.add('GET', '/a', 'b')).toThrow('declared twice');
	});

	test('reports the methods a matched path allows', () => {
		const router = new Router<string>();
		router.add('GET', '/a', 'a');
		router.add('PUT', '/a', 'a');
		expect(router.match('POST', '/a')).toEqual({
			path: '/a',
			allowed: ['GET', 'PUT'],
		});
	});

	test('ranks as Bun.serve does, whatever the order of declaration', () => {
		const router = new Router<string>();
		router.add('GET', '/*', 'all');
		router.add('GET', '/a/:id', 'param');
		router.add('GET', '/a/*', 'rest');
		router.add('GET', '/:x/b', 'second');
		const path = (pathname: string) => router.match('GET', pathname)?.path;
		expect(path('/a/b')).toBe('/a/:id');
		expect(path('/a/b/c')).toBe('/a/*');
		expect(path('/z/b')).toBe('/:x/b');
		expect(path('/z/b/c')).toBe('/*');
	});

	test('the best path decides, even without the method', () => {
		const router = new Router<string>();
		router.add('GET', '/users/:id', 'one');
		router.add('POST', '/users/me', 'me');
		expect(router.match('GET', '/users/me')).toEqual({
			path: '/users/me',
			allowed: ['POST'],
		});
	});

	test('forgives a trailing slash only when nothing matches strictly', () => {
		const router = new Router<string>();
		router.add('GET', '/a', 'a');
		router.add('GET', '/f/*', 'f');
		expect(router.match('GET', '/a/')?.path).toBe('/a');
		expect(router.match('GET', '/f')).toEqual({
			path: '/f/*',
			value: 'f',
			params: { '*': '' },
		});
		router.add('GET', '/a/*', 'rest');
		expect(router.match('GET', '/a/')?.path).toBe('/a/*');
	});

	test('a path served elsewhere that ranks first matches nothing', () => {
		const router = new Router<string>();
		router.add('GET', '/*', 'all');
		expect(router.match('GET', '/', ['/'])).toBeUndefined();
		expect(router.match('GET', '/x', ['/'])?.path).toBe('/*');
		expect(router.match('GET', '/x/', ['/x'])?.path).toBe('/*');
	});

	test('a page matching strictly wins over a trailing slash forgiven', () => {
		const router = new Router<string>();
		router.add('GET', '/s', 's');
		expect(router.match('GET', '/s/', ['/s/'])).toBeUndefined();
		expect(router.match('GET', '/s/')?.path).toBe('/s');
	});
});
