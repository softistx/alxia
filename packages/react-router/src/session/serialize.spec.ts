import { describe, expect, test } from 'bun:test';
import {
	isCookieName,
	isCookiePath,
	millisOf,
	readCookie,
	secondsUntil,
	serializeCookie,
} from './serialize';

const withCookie = (cookie: string) =>
	new Request('http://my-app.test/', { headers: { cookie } });

describe('serializeCookie', () => {
	test("writes the apps' bytes, Secure", () => {
		expect(serializeCookie('s', 'v', { maxAge: 60, secure: true })).toBe(
			's=v; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=Lax',
		);
	});

	test('drops Secure and nothing else when not secure', () => {
		expect(serializeCookie('s', 'v', { maxAge: 60, secure: false })).toBe(
			's=v; Max-Age=60; Path=/; HttpOnly; SameSite=Lax',
		);
	});

	test('takes a path of its own', () => {
		expect(
			serializeCookie('c', 'v', { maxAge: 1, path: '/sign-in', secure: true }),
		).toBe('c=v; Max-Age=1; Path=/sign-in; HttpOnly; Secure; SameSite=Lax');
	});

	test('encodes the value', () => {
		expect(
			serializeCookie('s', 't0k/=;', { maxAge: 1, secure: true }),
		).toStartWith('s=t0k%2F%3D%3B; ');
	});

	test('floors Max-Age and never goes below 0', () => {
		const age = (maxAge: number) =>
			serializeCookie('s', 'v', { maxAge, secure: true }).split('; ')[1];
		expect(age(59.9)).toBe('Max-Age=59');
		expect(age(-5)).toBe('Max-Age=0');
		expect(age(0.4)).toBe('Max-Age=0');
	});
});

describe('serializeCookie refuses what could open another attribute', () => {
	test('a name that is not an RFC 6265 token', () => {
		for (const name of ['', 'a b', 'a;b', 'a=b', 'a\nb', 'é']) {
			expect(() =>
				serializeCookie(name, 'v', { maxAge: 1, secure: true }),
			).toThrow(
				new TypeError(
					`serializeCookie(): the name ${JSON.stringify(name)} is not a cookie name (an RFC 6265 token).`,
				),
			);
		}
	});

	test('a path that is relative, holds ";" or a control character', () => {
		for (const path of [
			'sign-in',
			'',
			'/a; Domain=x',
			'/a\r\nSet-Cookie: b',
			'/a\x7f',
		]) {
			expect(() =>
				serializeCookie('s', 'v', { maxAge: 1, path, secure: true }),
			).toThrow(
				new TypeError(
					`serializeCookie(): the path ${JSON.stringify(path)} is not a cookie path: it must start with "/" and hold no ";" or control character.`,
				),
			);
		}
	});

	test('a maxAge that is not finite is 0', () => {
		for (const maxAge of [Number.NaN, Infinity, -Infinity]) {
			expect(serializeCookie('s', 'v', { maxAge, secure: true })).toContain(
				'Max-Age=0;',
			);
		}
	});

	test('the checks agree with isCookieName and isCookiePath', () => {
		expect(isCookieName('my-app_session')).toBe(true);
		expect(isCookieName('a b')).toBe(false);
		expect(isCookiePath('/sign-in')).toBe(true);
		expect(isCookiePath('/a;b')).toBe(false);
	});
});

describe('readCookie', () => {
	test('reads one cookie among others, decoded', () => {
		expect(readCookie(withCookie('a=1; s=t0k%2F%3D; b=2'), 's')).toBe('t0k/=');
	});

	test('the first duplicate wins', () => {
		expect(readCookie(withCookie('s=first; s=second'), 's')).toBe('first');
	});

	test('skips an empty one for the next', () => {
		expect(readCookie(withCookie('s=; s=second'), 's')).toBe('second');
	});

	test('a malformed % gives null', () => {
		expect(readCookie(withCookie('s=%E0%A4%A'), 's')).toBeNull();
	});

	test('absent gives null, and a name that only starts the same is not it', () => {
		expect(readCookie(new Request('http://my-app.test/'), 's')).toBeNull();
		expect(readCookie(withCookie('sx=1; =2; s'), 's')).toBeNull();
	});
});

describe('secondsUntil and millisOf', () => {
	const NOW = Date.parse('2026-10-10T08:00:00.000Z');
	test('counts from now, to a string or a Date', () => {
		const end = '2026-10-10T20:00:00.000Z';
		expect(secondsUntil(end, NOW)).toBe(43200);
		expect(secondsUntil(new Date(end), NOW)).toBe(43200);
	});

	test('is 0 when past or unreadable', () => {
		expect(secondsUntil('2026-10-09T00:00:00.000Z', NOW)).toBe(0);
		expect(secondsUntil('soon', NOW)).toBe(0);
		expect(secondsUntil(new Date(Number.NaN), NOW)).toBe(0);
	});

	test('millisOf is 0 for what is not a date', () => {
		expect(millisOf('soon')).toBe(0);
		expect(millisOf(new Date(5))).toBe(5);
	});
});
