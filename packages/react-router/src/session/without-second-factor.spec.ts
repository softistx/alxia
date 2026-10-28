import { describe, expect, test } from 'bun:test';
import { plainErrors } from '../../test/errors/refusal';
import { asking, END, setCookies } from '../../test/session/flow';
import { posting } from '../../test/session/links';
import { jsonActions } from '../errors';
import { sessionCookies } from './cookies';
import { authLinks } from './links';
import { signInFlow } from './sign-in';

const cookies = (secure = false) =>
	sessionCookies({ session: 'my-app_session', secure });
const flow = () =>
	signInFlow<'en'>({
		cookies: cookies(),
		errors: plainErrors(),
		json: jsonActions(),
		revoke: async () => {},
	});

describe('sessionCookies without a challenge', () => {
	test('names hold the session alone, prefixed when secure', () => {
		expect(cookies().names).toEqual({ session: 'my-app_session' });
		expect(cookies(true).names).toEqual({ session: '__Host-my-app_session' });
	});

	test('no challenge helper exists at runtime or in the type', () => {
		const plain = cookies();
		expect('challengeOf' in plain).toBe(false);
		expect('commitChallenge' in plain).toBe(false);
		expect('destroyChallenge' in plain).toBe(false);
		// Typed `undefined`, so a call is a compile error.
		expect(plain.challengeOf).toBeUndefined();
		// @ts-expect-error a cookie set built without `challenge` has no challengeOf to call
		expect(() => plain.challengeOf(new Request('http://a.test/'))).toThrow();
	});

	test('the session cookie works as before', () => {
		const plain = cookies();
		const header = plain.commit('tok', END);
		const request = new Request('http://my-app.test/', {
			headers: { cookie: header.split(';')[0] ?? '' },
		});
		expect(plain.token(request)).toBe('tok');
		expect(plain.destroy()).toContain('my-app_session=; Max-Age=0');
	});

	test('the sign-in page clears the dead session only', () => {
		const plain = cookies();
		expect([...plain.signInPageHeaders(false)]).toEqual([]);
		expect(plain.signInPageHeaders(true).getSetCookie()).toEqual([
			plain.destroy(),
		]);
	});

	test('challenge: string | undefined gives SessionCookies<boolean>, which signInFlow refuses until narrowed', () => {
		const name = Math.random() > 2 ? 'c' : undefined;
		const either = sessionCookies({
			session: 's',
			challenge: name,
			secure: false,
		});
		expect('challengeOf' in either).toBe(false);
		const base = {
			errors: plainErrors(),
			json: jsonActions(),
			revoke: async () => {},
		};
		// @ts-expect-error neither overload takes a set that may or may not have a challenge
		signInFlow<'en'>({ ...base, cookies: either });
		expect(either.challengeOf ? 'with' : 'without').toBe('without');
	});

	test('with a challenge the helpers are on the type', () => {
		const full = sessionCookies({
			session: 'my-app_session',
			challenge: 'my-app_challenge',
			secure: false,
		});
		expect(full.destroyChallenge()).toContain('my-app_challenge=; Max-Age=0');
		expect(full.signInPageHeaders(false).getSetCookie()).toHaveLength(1);
	});
});

describe('signInFlow without a second factor', () => {
	test('has no second-factor member', () => {
		const plain = flow();
		for (const key of [
			'attemptsLeft',
			'codeRefusal',
			'readCodeInput',
			'codeStep',
		]) {
			expect(key in plain).toBe(false);
		}
		// @ts-expect-error a flow without attemptsLeft has no codeStep
		expect(plain.codeStep).toBeUndefined();
	});

	test('a signed-in answer lands with the session cookie alone', () => {
		const response = flow().landing(
			{ status: 'signedIn', token: 'tok', expiresAt: END },
			'/orders',
		) as Response;
		expect(response.headers.get('location')).toBe('/orders');
		const set = setCookies(response);
		expect(set).toHaveLength(1);
		expect(set[0]).toStartWith('my-app_session=');
	});

	test('a second-factor answer is not offered: null', () => {
		expect(
			flow().landing({ status: 'secondFactor', challenge: 'c1' }, '/orders'),
		).toBeNull();
	});

	test('sign-out clears the session cookie alone', async () => {
		const response = await flow().signOut(
			asking('/sign-out', 'tok', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}',
			}),
		);
		expect(setCookies(response)).toEqual([cookies().destroy()]);
	});

	test('half a second factor is refused when the flow is built', () => {
		const full = sessionCookies({
			session: 's',
			challenge: 'c',
			secure: false,
		});
		const base = {
			errors: plainErrors(),
			json: jsonActions(),
			revoke: async () => {},
		};
		const halfOpen = { ...base, cookies: full };
		// @ts-expect-error cookies with a challenge need attemptsLeft
		const buildHalf = () => signInFlow<'en'>(halfOpen);
		expect(buildHalf).toThrow(/second factor needs both/);
		const orphan = { ...base, cookies: cookies(), attemptsLeft: () => '' };
		// @ts-expect-error attemptsLeft needs the challenge cookie
		const build = () => signInFlow<'en'>(orphan);
		expect(build).toThrow(/second factor needs both/);
	});
});

describe('authLinks over a flow without a second factor', () => {
	test('afterReset clears the session cookie and the app’s, and no challenge', async () => {
		const revoked: string[] = [];
		const plain = cookies();
		const links = authLinks<'en'>({
			signIn: signInFlow<'en'>({
				cookies: plain,
				errors: plainErrors(),
				json: jsonActions(),
				revoke: async (token) => {
					revoked.push(token);
				},
				clear: () => ['recent=; Max-Age=0'],
			}),
		});
		const response = await links.afterReset(posting('old'));
		expect(response.headers.get('location')).toBe('/sign-in?password-reset=1');
		expect(setCookies(response)).toEqual([
			plain.destroy(),
			'recent=; Max-Age=0',
		]);
		expect(revoked).toEqual(['old']);
	});
});
