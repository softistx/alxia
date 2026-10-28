import { describe, expect, test } from 'bun:test';
import { plainErrors } from '../../test/errors/refusal';
import { asking, END, setCookies } from '../../test/session/flow';
import { jsonActions } from '../errors';
import { sessionCookies } from './cookies';
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
		// @ts-expect-error a cookie set built without `challenge` has no challengeOf
		expect(plain.challengeOf).toBeUndefined();
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
		expect(() =>
			// Typed as a flow without a second factor (the cookies are a superset),
			// refused when it is built.
			signInFlow<'en'>({ ...base, cookies: full }),
		).toThrow(/second factor needs both/);
		expect(() =>
			// @ts-expect-error attemptsLeft needs the challenge cookie
			signInFlow<'en'>({
				...base,
				cookies: cookies(),
				attemptsLeft: () => '',
			}),
		).toThrow(/second factor needs both/);
	});
});
