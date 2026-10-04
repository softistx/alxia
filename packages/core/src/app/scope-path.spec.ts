/**
 * `use(path, …)`'s path against a request: `reach` decides at declaration
 * what a route's own pattern settles, `matches` checks the rest per request.
 */
import { describe, expect, test } from 'bun:test';
import { matches, reach, scopePath } from './scope-path';

const at = (pattern: string) => scopePath('', pattern);

describe('matches', () => {
	test('a path and every path under it; a trailing slash forgiven', () => {
		const admin = at('/admin');
		expect(matches(admin, '/admin')).toBe(true);
		expect(matches(admin, '/admin/')).toBe(true);
		expect(matches(admin, '/admin/stats')).toBe(true);
		expect(matches(admin, '/administrator')).toBe(false);
		expect(matches(admin, '/')).toBe(false);
	});

	test('a parameter is any one segment; a star, what is under', () => {
		expect(matches(at('/users/:id/posts'), '/users/7/posts')).toBe(true);
		expect(matches(at('/users/:id/posts'), '/users/posts')).toBe(false);
		expect(matches(at('/files/*'), '/files/a/b')).toBe(true);
		expect(matches(at('/files/*'), '/files')).toBe(false);
	});

	test('the root holds every path', () => {
		expect(matches(at('/'), '/')).toBe(true);
		expect(matches(at('/'), '/anything/at/all')).toBe(true);
	});

	test('read as the router reads it: decoded, collapsed, in any case', () => {
		const admin = at('/users/admin');
		expect(matches(admin, '/users/ad%6Din')).toBe(true);
		expect(matches(admin, '/users%2Fadmin')).toBe(true);
		expect(matches(admin, '//users//admin/')).toBe(true);
		expect(matches(admin, '/USERS/Admin')).toBe(true);
		expect(matches(at('/Users'), '/users')).toBe(true);
		expect(matches(admin, '/users/ad%6Dins')).toBe(false);
		expect(matches(at('/files/*'), '/files%2F')).toBe(false);
	});

	test('fails closed: a segment that does not decode, a dot segment', () => {
		expect(matches(at('/admin'), '/%E0%A4%A')).toBe(true);
		expect(matches(at('/admin'), '/x/%2e%2e/admin')).toBe(true);
		expect(matches(at('/admin'), '/x/./y')).toBe(true);
	});
});

describe('reach', () => {
	test('settled by the route when it can be, per request otherwise', () => {
		expect(reach(at('/admin'), '/admin/stats')).toBe('always');
		expect(reach(at('/admin'), '/public')).toBe('never');
		expect(reach(at('/users/admin'), '/users/:id')).toBe('maybe');
		expect(reach(at('/admin'), '/Admin/:id')).toBe('always');
	});
});
