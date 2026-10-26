import { describe, expect, test } from 'bun:test';
import { sessionCookies } from './cookies';

const NOW = Date.parse('2026-10-10T08:00:00.000Z');
const END = '2026-10-10T20:00:00.000Z';
const production = () =>
	sessionCookies({
		session: 'my-app_session',
		challenge: 'my-app_challenge',
		secure: true,
	});
const development = () =>
	sessionCookies({
		session: 'my-app_session',
		challenge: 'my-app_challenge',
		secure: false,
	});
const attributes = (header: string) => header.split('; ').slice(1);
const withCookie = (cookie: string) =>
	new Request('http://my-app.test/', { headers: { cookie } });

describe('the names', () => {
	test('secure: __Host- for the session, __Secure- for the challenge', () => {
		expect(production().names).toEqual({
			session: '__Host-my-app_session',
			challenge: '__Secure-my-app_challenge',
		});
	});

	test('not secure: the base names, no prefix', () => {
		expect(development().names).toEqual({
			session: 'my-app_session',
			challenge: 'my-app_challenge',
		});
	});
});

describe('the session cookie, byte for byte', () => {
	test('secure', () => {
		expect(production().commit('t0k/=;', END, NOW)).toBe(
			`__Host-my-app_session=${Date.parse(END)}.t0k%2F%3D%3B; Max-Age=43200; Path=/; HttpOnly; Secure; SameSite=Lax`,
		);
		expect(production().destroy()).toBe(
			'__Host-my-app_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax',
		);
	});

	test('development: no Secure, no prefix', () => {
		expect(development().commit('t', END, NOW)).toBe(
			`my-app_session=${Date.parse(END)}.t; Max-Age=43200; Path=/; HttpOnly; SameSite=Lax`,
		);
		expect(development().destroy()).toBe(
			'my-app_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
		);
	});

	test('a Date ends it like its ISO string', () => {
		expect(production().commit('t', new Date(END), NOW)).toBe(
			production().commit('t', END, NOW),
		);
	});

	test('a past or unreadable expiry ends it at once', () => {
		expect(production().commit('t', '2026-10-09T00:00:00.000Z', NOW)).toContain(
			'Max-Age=0;',
		);
		expect(production().commit('t', 'soon', NOW)).toContain('Max-Age=0;');
	});

	test('the value is <ms>.<token> and round-trips', () => {
		const cookies = production();
		const pair = cookies.commit('t0k/=;', END, NOW).split('; ')[0] as string;
		expect(pair).toStartWith(`__Host-my-app_session=${Date.parse(END)}.`);
		const request = withCookie(`language=fr; ${pair}; other=1`);
		expect(cookies.read(request)).toEqual({
			token: 't0k/=;',
			expiresAt: Date.parse(END),
		});
		expect(cookies.token(request)).toBe('t0k/=;');
	});

	test('a token with a dot keeps it', () => {
		const cookies = production();
		const pair = cookies.commit('a.b.c', END, NOW).split('; ')[0] as string;
		expect(cookies.token(withCookie(pair))).toBe('a.b.c');
	});

	test('an absent, empty, unprefixed or badly formed cookie is no session', () => {
		const cookies = production();
		expect(cookies.read(new Request('http://my-app.test/'))).toBeNull();
		for (const cookie of [
			'__Host-my-app_session=',
			'__Host-my-app_session=token-without-expiry',
			'__Host-my-app_session=abc.t',
			'__Host-my-app_session=.t',
			'__Host-my-app_session=12.',
			'my-app_session=12.t',
			'__Host-my-app_sessionx=12.t',
		]) {
			expect(cookies.read(withCookie(cookie))).toBeNull();
			expect(cookies.token(withCookie(cookie))).toBeNull();
		}
	});

	test('a malformed % is no session', () => {
		expect(
			production().read(withCookie('__Host-my-app_session=%E0%A4%A')),
		).toBeNull();
	});

	test('the first duplicate wins', () => {
		const request = withCookie(
			'__Host-my-app_session=1.first; __Host-my-app_session=2.second',
		);
		expect(production().token(request)).toBe('first');
	});
});

describe('refreshed', () => {
	const cookies = production();
	const held = { token: 't', expiresAt: Date.parse(END) };

	test('sends nothing when the expiry is unchanged', () => {
		expect(cookies.refreshed(held, END)).toEqual({});
		expect(cookies.refreshed(held, new Date(END))).toEqual({});
	});

	test('sends nothing when the API gives no expiry', () => {
		expect(cookies.refreshed(held, null)).toEqual({});
	});

	test('sets the cookie again when the expiry moved', () => {
		const later = '2026-10-10T21:00:00.000Z';
		const headers = cookies.refreshed(held, later) as Record<string, string>;
		expect(headers['Set-Cookie']).toStartWith(
			`__Host-my-app_session=${Date.parse(later)}.t; Max-Age=`,
		);
	});
});

describe('the challenge cookie', () => {
	test('lives five minutes at most, on the sign-in pages only', () => {
		const header = production().commitChallenge(
			'ch',
			'2026-10-10T09:00:00.000Z',
			NOW,
		);
		expect(header.split('; ')[0]).toBe('__Secure-my-app_challenge=ch');
		expect(attributes(header)).toEqual([
			'Max-Age=300',
			'Path=/sign-in',
			'HttpOnly',
			'Secure',
			'SameSite=Lax',
		]);
	});

	test('is shorter when the challenge ends sooner, and five minutes with no expiry', () => {
		const cookies = production();
		expect(
			cookies.commitChallenge('ch', '2026-10-10T08:02:00.000Z', NOW),
		).toContain('Max-Age=120;');
		expect(cookies.commitChallenge('ch', null, NOW)).toContain('Max-Age=300;');
		expect(cookies.commitChallenge('ch')).toContain('Max-Age=300;');
	});

	test('development bytes', () => {
		expect(development().commitChallenge('ch', null)).toBe(
			'my-app_challenge=ch; Max-Age=300; Path=/sign-in; HttpOnly; SameSite=Lax',
		);
	});

	test('is destroyed on the same path, and read back', () => {
		const cookies = production();
		expect(cookies.destroyChallenge()).toBe(
			'__Secure-my-app_challenge=; Max-Age=0; Path=/sign-in; HttpOnly; Secure; SameSite=Lax',
		);
		expect(
			cookies.challengeOf(withCookie('__Secure-my-app_challenge=ch')),
		).toBe('ch');
		expect(cookies.challengeOf(withCookie('my-app_challenge=ch'))).toBeNull();
	});

	test('takes a path and a lifetime of its own', () => {
		const cookies = sessionCookies({
			session: 's',
			challenge: 'c',
			secure: true,
			challengePath: '/login',
			challengeSeconds: 60,
		});
		expect(cookies.commitChallenge('ch', null)).toBe(
			'__Secure-c=ch; Max-Age=60; Path=/login; HttpOnly; Secure; SameSite=Lax',
		);
		expect(cookies.destroyChallenge()).toContain('Path=/login;');
	});
});

describe('signInPageHeaders', () => {
	test('clears the challenge blind, as /sign-in.data never shows it', () => {
		const headers = production().signInPageHeaders(false);
		expect(headers.getSetCookie()).toEqual([production().destroyChallenge()]);
	});

	test("also clears a dead session's cookie", () => {
		const cookies = production();
		expect(cookies.signInPageHeaders(true).getSetCookie()).toEqual([
			cookies.destroyChallenge(),
			cookies.destroy(),
		]);
	});
});

describe('what it refuses', () => {
	const make = (overrides: object) => () =>
		sessionCookies({
			session: 'my-app_session',
			challenge: 'my-app_challenge',
			secure: true,
			...overrides,
		});

	test('a session name that is not a cookie name', () => {
		expect(make({ session: 'my app' })).toThrow(
			new TypeError(
				'sessionCookies(): the session name "my app" is not a cookie name (an RFC 6265 token: letters, digits and ! # $ % & \' * + - . ^ _ ` | ~). Pass a name such as "my-app_session".',
			),
		);
		expect(make({ session: '' })).toThrow('is not a cookie name');
	});

	test('a challenge name that is not a cookie name', () => {
		expect(make({ challenge: 'a;b' })).toThrow(
			new TypeError(
				'sessionCookies(): the challenge name "a;b" is not a cookie name (an RFC 6265 token: letters, digits and ! # $ % & \' * + - . ^ _ ` | ~). Pass a name such as "my-app_challenge".',
			),
		);
	});

	test('a name that already carries a prefix', () => {
		expect(make({ session: '__Host-my-app_session' })).toThrow(
			new TypeError(
				'sessionCookies(): the session name "__Host-my-app_session" already carries a prefix. Pass the base name: the package adds __Host- (session) or __Secure- (challenge) when secure is true.',
			),
		);
		expect(make({ challenge: '__Secure-c' })).toThrow(
			'the challenge name "__Secure-c" already carries a prefix',
		);
	});

	test('a challengeSeconds that is not a positive integer', () => {
		for (const [value, shown] of [
			[0, '0'],
			[-1, '-1'],
			[1.5, '1.5'],
			[Number.NaN, 'NaN'],
		] as const) {
			expect(make({ challengeSeconds: value })).toThrow(
				new TypeError(
					`sessionCookies(): challengeSeconds must be a positive integer; got ${shown}.`,
				),
			);
		}
	});

	test('a challengePath that does not start with /', () => {
		expect(make({ challengePath: 'sign-in' })).toThrow(
			new TypeError(
				'sessionCookies(): challengePath must start with "/"; got "sign-in".',
			),
		);
	});
});
