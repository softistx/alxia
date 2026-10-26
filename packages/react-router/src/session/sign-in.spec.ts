import { describe, expect, test } from 'bun:test';
import { asking, flowFor, setCookies, thrown } from '../../test/session/flow';

const json = { 'content-type': 'application/json' };
const signOutRequest = (headers: Record<string, string> = {}) =>
	asking('/sign-out', 'tok', {
		method: 'POST',
		headers: { ...json, ...headers },
		body: '{}',
	});

describe('signOut', () => {
	test('revokes, clears the session and the app’s cookies, and goes to the sign-in page', async () => {
		const { flow, revoked } = flowFor({ clear: () => ['recent=; Max-Age=0'] });
		const response = await flow.signOut(signOutRequest());
		expect(revoked).toEqual(['tok']);
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/sign-in?signed-out=1');
		expect(setCookies(response)).toEqual([
			'my-app_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
			'my-app_challenge=; Max-Age=0; Path=/sign-in; HttpOnly; SameSite=Lax',
			'recent=; Max-Age=0',
		]);
	});

	test('a cross-site post is refused before anything is revoked: 403', async () => {
		const { flow, revoked } = flowFor();
		for (const headers of [
			{ origin: 'http://evil.test' },
			{ 'sec-fetch-site': 'cross-site' },
		]) {
			const caught = (await thrown(() =>
				flow.signOut(signOutRequest(headers)),
			)) as {
				init: { status: number };
			};
			expect(caught.init.status).toBe(403);
		}
		expect(revoked).toEqual([]);
	});

	test('a body that is not JSON is refused: 415', async () => {
		const { flow, revoked } = flowFor();
		const form = asking('/sign-out', 'tok', {
			method: 'POST',
			headers: { 'content-type': 'text/plain' },
			body: 'x',
		});
		const caught = (await thrown(() => flow.signOut(form))) as {
			init: { status: number };
		};
		expect(caught.init.status).toBe(415);
		expect(revoked).toEqual([]);
	});

	test('the sign-in path is the app’s', async () => {
		const { flow } = flowFor({ paths: { signIn: '/login' } });
		const response = await flow.signOut(signOutRequest());
		expect(response.headers.get('location')).toBe('/login?signed-out=1');
	});

	test('`to` goes through safeNext: a path of the site, and nothing else', async () => {
		const { flow } = flowFor();
		const to = async (value: string) =>
			(await flow.signOut(signOutRequest(), { to: value })).headers.get(
				'location',
			);
		expect(await to('/goodbye?x=1')).toBe('/goodbye?x=1');
		expect(await to('//evil.test')).toBe('/');
		expect(await to('https://evil.test')).toBe('/');
	});

	test('a revoke that fails does not keep the user signed in', async () => {
		const { flow } = flowFor({
			revoke: () => Promise.reject(new Error('down')),
		});
		const response = await flow.signOut(signOutRequest());
		expect(setCookies(response)[0]).toStartWith('my-app_session=; Max-Age=0');
	});
});

describe('signInFlow refuses', () => {
	test('a sign-in path that is not absolute', () => {
		expect(() => flowFor({ paths: { signIn: 'sign-in' } })).toThrow(
			new TypeError(
				'signInFlow(): paths.signIn must be a path of this site with no query or fragment, starting with a single "/"; got "sign-in".',
			),
		);
	});

	test('a second-factor path that is not absolute, or starts with //', () => {
		expect(() => flowFor({ paths: { secondFactor: 'code' } })).toThrow(
			new TypeError(
				'signInFlow(): paths.secondFactor must be a path of this site with no query or fragment, starting with a single "/"; got "code".',
			),
		);
		for (const path of ['//evil.test', '/\\evil.test', '/a?b', '/a#b']) {
			expect(() => flowFor({ paths: { secondFactor: path } })).toThrow(
				/paths\.secondFactor must be a path of this site/,
			);
		}
	});

	test('a wrong-code code that also ends the challenge', () => {
		expect(() =>
			flowFor({
				codes: { invalidCode: 'TOKEN_SPENT' },
			}),
		).toThrow(
			new TypeError(
				'signInFlow(): the code "TOKEN_SPENT" is both the wrong-code code (codes.invalidCode) and in codes.challengeOver. A wrong code that leaves tries cannot end the challenge.',
			),
		);
		expect(() =>
			flowFor({
				codes: { invalidCode: 'x', challengeOver: ['y', 'x'] },
			}),
		).toThrow(/is both the wrong-code code/);
	});

	test('nothing for the defaults, or for codes that do not overlap', () => {
		expect(() => flowFor()).not.toThrow();
		expect(() =>
			flowFor({ codes: { invalidCode: 'a', challengeOver: ['b'] } }),
		).not.toThrow();
	});
});

describe('the flow’s properties', () => {
	test('cookies, errors and json are the ones it was built with', () => {
		const { flow, cookies } = flowFor();
		expect(flow.cookies).toBe(cookies);
		expect(typeof flow.errors.apiErrorMessage).toBe('function');
		expect(typeof flow.json.readJson).toBe('function');
	});

	test('unavailable words the option, else errors’', () => {
		expect(flowFor().flow.unavailable('en')).toBe(
			'The service is unavailable.',
		);
		const own = flowFor({ unavailable: (language) => `down (${language})` });
		expect(own.flow.unavailable('fr')).toBe('down (fr)');
	});

	test('clear lists the option’s cookies, none by default', () => {
		expect(flowFor().flow.clear()).toEqual([]);
		const own = flowFor({ clear: () => ['theme=; Max-Age=0'] });
		expect(own.flow.clear()).toEqual(['theme=; Max-Age=0']);
	});
});
