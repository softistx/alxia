import { describe, expect, test } from 'bun:test';
import { asking, END, flowFor, setCookies } from '../../test/session/flow';

const signedIn = { status: 'signedIn', token: 'new', expiresAt: END } as const;
const challenged = { status: 'secondFactor', challenge: 'c1' } as const;

describe('landing', () => {
	test('signed in: to next, the session set, the challenge and the app clears removed', () => {
		const { flow } = flowFor({ clear: () => ['recent=; Max-Age=0'] });
		const response = flow.landing(signedIn, '/orders?page=2');
		expect(response?.status).toBe(302);
		expect(response?.headers.get('location')).toBe('/orders?page=2');
		const cookies = setCookies(response as Response);
		expect(cookies[0]).toStartWith(
			`my-app_session=${END.getTime()}.new; Max-Age=`,
		);
		expect(cookies[1]).toBe(
			'my-app_challenge=; Max-Age=0; Path=/sign-in; HttpOnly; SameSite=Lax',
		);
		expect(cookies[2]).toBe('recent=; Max-Age=0');
	});

	test('an unsafe next lands on /', () => {
		const { flow } = flowFor();
		const response = flow.landing(signedIn, '//evil.test');
		expect(response?.headers.get('location')).toBe('/');
	});

	test('a second factor: to its page, the challenge in a cookie and not in the URL', () => {
		const { flow } = flowFor();
		const response = flow.landing(challenged, '/orders') as Response;
		expect(response.headers.get('location')).toBe(
			'/sign-in/second-factor?next=%2Forders',
		);
		expect(response.headers.get('location')).not.toContain('c1');
		const cookies = setCookies(response);
		expect(cookies).toHaveLength(1);
		expect(cookies[0]).toStartWith(
			'my-app_challenge=c1; Max-Age=300; Path=/sign-in;',
		);
	});

	test('a second factor with its own path, and a challenge that ends sooner', () => {
		const { flow } = flowFor({ paths: { secondFactor: '/sign-in/code' } });
		const soon = new Date(Date.now() + 60_000);
		const response = flow.landing(
			{ status: 'secondFactor', challenge: 'c1', expiresAt: soon },
			'/',
		) as Response;
		expect(response.headers.get('location')).toBe('/sign-in/code');
		expect(setCookies(response)[0]).toMatch(/Max-Age=(59|60);/);
	});

	test('any other answer opens nothing: null', () => {
		const { flow } = flowFor();
		expect(flow.landing({ status: 'other' }, '/')).toBeNull();
		expect(flow.landing({ ...signedIn, token: '' }, '/')).toBeNull();
		expect(flow.landing({ ...challenged, challenge: '' }, '/')).toBeNull();
	});
});

describe('landReplacing', () => {
	test('a new session revokes the browser’s once, and its own cookie replaces the old', async () => {
		const { flow, revoked } = flowFor();
		const response = await flow.landReplacing(signedIn, '/', {
			request: asking('/sign-in', 'old'),
		});
		expect(revoked).toEqual(['old']);
		const cookies = setCookies(response as Response);
		expect(
			cookies.filter((cookie) => cookie.startsWith('my-app_session=')),
		).toHaveLength(1);
		expect(cookies[0]).not.toContain('Max-Age=0');
	});

	test('with no session cookie there is nothing to revoke', async () => {
		const { flow, revoked } = flowFor();
		await flow.landReplacing(signedIn, '/', { request: asking('/sign-in') });
		expect(revoked).toEqual([]);
	});

	test('a second factor revokes nothing by default, so a failed code keeps the session', async () => {
		const { flow, revoked } = flowFor();
		const response = await flow.landReplacing(challenged, '/', {
			request: asking('/sign-in', 'old'),
		});
		expect(revoked).toEqual([]);
		expect(setCookies(response as Response)).toHaveLength(1);
	});

	test('revokeOn adds the status: revoked once, and the cookie cleared', async () => {
		const { flow, revoked } = flowFor();
		const response = await flow.landReplacing(challenged, '/', {
			request: asking('/sign-in', 'old'),
			revokeOn: ['signedIn', 'secondFactor'],
		});
		expect(revoked).toEqual(['old']);
		expect(setCookies(response as Response)).toContain(
			'my-app_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
		);
	});

	test('an answer that opens no session is null and revokes nothing', async () => {
		const { flow, revoked } = flowFor();
		const response = await flow.landReplacing({ status: 'other' }, '/', {
			request: asking('/sign-in', 'old'),
			revokeOn: ['signedIn', 'secondFactor'],
		});
		expect(response).toBeNull();
		expect(revoked).toEqual([]);
	});

	test('a revoke that fails is ignored: the session still lands', async () => {
		const { flow } = flowFor({
			revoke: () => Promise.reject(new Error('down')),
		});
		const response = await flow.landReplacing(signedIn, '/', {
			request: asking('/sign-in', 'old'),
		});
		expect(response?.status).toBe(302);
	});
});

describe('revokeSession', () => {
	test('true when the request carried a session, false when not', async () => {
		const { flow, revoked } = flowFor();
		expect(await flow.revokeSession(asking('/', 'tok'))).toBe(true);
		expect(await flow.revokeSession(asking('/'))).toBe(false);
		expect(revoked).toEqual(['tok']);
	});

	test('hands the revoke the request, for its caller’s language and address', async () => {
		const seen: Request[] = [];
		const { flow } = flowFor({
			revoke: async (_token, request) => {
				seen.push(request);
			},
		});
		const request = asking('/', 'tok');
		await flow.revokeSession(request);
		expect(seen).toEqual([request]);
	});
});

describe('a signed-in answer with no live session to set', () => {
	const ends: [string, unknown][] = [
		['an empty expiry', ''],
		['a null expiry', null],
		['an unreadable expiry', 'not a date'],
		['a past expiry', new Date(Date.now() - 1000)],
		['a past ISO expiry', '2020-01-01T00:00:00.000Z'],
	];

	for (const [name, expiresAt] of ends) {
		test(`${name} lands nothing and revokes nothing`, async () => {
			const { flow, revoked } = flowFor();
			const answer = { status: 'signedIn', token: 'new', expiresAt } as never;
			expect(flow.landing(answer, '/')).toBeNull();
			const landed = await flow.landReplacing(answer, '/', {
				request: asking('/sign-in', 'old'),
			});
			expect(landed).toBeNull();
			expect(revoked).toEqual([]);
		});
	}
});
