import { describe, expect, test } from 'bun:test';
import { body, END, setCookies, thrown } from '../../test/session/flow';
import { crossSite, linksFor, posting } from '../../test/session/links';

const signedIn = { status: 'signedIn', token: 'new', expiresAt: END } as const;
const at = posting;
const land = (
	links: ReturnType<typeof linksFor>['links'],
	answer: Parameters<ReturnType<typeof linksFor>['links']['landByLink']>[0],
	token?: string,
) =>
	links.landByLink(answer, {
		request: at(token),
		language: 'en',
	}) as Promise<Response>;

describe('landByLink', () => {
	test('signed in: to the start page, with the session, replacing the token’s entry', async () => {
		const { links } = linksFor({ start: async (token) => `/home/${token}` });
		const response = await land(links, signedIn);
		expect(response.headers.get('location')).toBe('/home/new');
		expect(response.headers.get('x-remix-replace')).toBe('true');
		expect(setCookies(response)[0]).toStartWith(
			`my-app_session=${END.getTime()}.new;`,
		);
	});

	test('with no start it lands on /; a start that throws or leaves the site does too', async () => {
		for (const start of [
			undefined,
			async () => {
				throw new Error('down');
			},
			async () => '//evil.test',
		]) {
			const { links } = linksFor(start ? { start } : {});
			const response = await land(links, signedIn);
			expect(response.headers.get('location')).toBe('/');
			expect(response.headers.get('x-remix-replace')).toBe('true');
		}
	});

	test('start reads the new token, and the redirect never carries it', async () => {
		let seen: string | undefined;
		const { links } = linksFor({
			start: async (token) => {
				seen = token;
				return '/home';
			},
		});
		const response = await land(links, signedIn);
		expect(seen).toBe('new');
		expect(response.headers.get('location')).not.toContain('new');
		expect(response.headers.get('location')).not.toContain('secret');
	});

	test('the session the browser held is revoked, whoever’s', async () => {
		const { links, revoked } = linksFor();
		await land(links, signedIn, 'old');
		expect(revoked).toEqual(['old']);
	});

	test('a second factor: its page, the challenge in a cookie, the old session revoked and cleared', async () => {
		const { links, revoked } = linksFor();
		const response = await land(
			links,
			{ status: 'secondFactor', challenge: 'ch' },
			'old',
		);
		expect(response.headers.get('location')).toBe('/sign-in/second-factor');
		expect(response.headers.get('x-remix-replace')).toBe('true');
		const cookies = setCookies(response);
		expect(cookies).toHaveLength(2);
		expect(cookies[0]).toStartWith('my-app_challenge=ch;');
		expect(cookies[1]).toStartWith('my-app_session=; Max-Age=0');
		expect(revoked).toEqual(['old']);
		expect(response.headers.get('location')).not.toContain('ch');
	});

	test('a session that ended already never reaches start, and opens nothing', async () => {
		let called = false;
		const { links, revoked } = linksFor({
			start: async () => {
				called = true;
				return '/home';
			},
		});
		const answered = body(
			await links.landByLink(
				{
					status: 'signedIn',
					token: 'new',
					expiresAt: new Date(Date.now() - 1000),
				},
				{ request: at('old'), language: 'en' },
			),
		);
		expect(called).toBe(false);
		expect(answered.init.status).toBe(503);
		expect(revoked).toEqual([]);
	});

	test('the redirect carries the token page’s headers', async () => {
		const { links } = linksFor();
		const response = await land(links, signedIn);
		expect(response.headers.get('referrer-policy')).toBe('no-referrer');
		expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
	});

	test('other ends on the state given, keeping the browser’s session', async () => {
		const { links, revoked } = linksFor();
		const response = (await links.landByLink(
			{ status: 'other' },
			{
				request: at('old'),
				language: 'en',
				other: { path: '/auth/magic-link', state: 'linked' },
			},
		)) as Response;
		expect(response.headers.get('location')).toBe(
			'/auth/magic-link?state=linked',
		);
		expect(response.headers.get('x-remix-replace')).toBe('true');
		expect(response.headers.get('set-cookie')).toBeNull();
		expect(response.headers.get('referrer-policy')).toBe('no-referrer');
		expect(revoked).toEqual([]);
	});

	test('other without a state is the form’s unavailable', async () => {
		const { links } = linksFor();
		const answered = body(
			await links.landByLink(
				{ status: 'other' },
				{ request: at('old'), language: 'en' },
			),
		);
		expect(answered.init.status).toBe(503);
	});

	test('a cross-site post lands nothing, revokes nothing and starts nothing', async () => {
		let called = false;
		const { links, revoked } = linksFor({
			start: async () => {
				called = true;
				return '/home';
			},
		});
		const refused = (await thrown(() =>
			links.landByLink(signedIn, { request: crossSite('old'), language: 'en' }),
		)) as Response;
		expect(refused.headers.get('set-cookie')).toBeNull();
		expect(refused.status).toBe(302);
		expect(revoked).toEqual([]);
		expect(called).toBe(false);
	});

	test('an answer that leads nowhere is the form’s unavailable, with the session kept', async () => {
		const { links, revoked } = linksFor();
		for (const answer of [
			{ status: 'other' },
			{ status: 'signedIn', token: '', expiresAt: END },
		] as const) {
			const answered = body(
				await links.landByLink(answer, { request: at('old'), language: 'en' }),
			);
			expect(answered.init.status).toBe(503);
			expect(answered.data['formError']).toBe('The service is unavailable.');
		}
		expect(revoked).toEqual([]);
	});
});

describe('afterReset', () => {
	test('a cross-site post signs nobody out', async () => {
		const { links, revoked } = linksFor();
		const refused = (await thrown(() =>
			links.afterReset(crossSite('old')),
		)) as Response;
		expect(refused.headers.get('set-cookie')).toBeNull();
		expect(revoked).toEqual([]);
	});

	test('the redirect carries the token page’s headers', async () => {
		const { links } = linksFor();
		const response = await links.afterReset(at('old'));
		expect(response.headers.get('referrer-policy')).toBe('no-referrer');
	});

	test('the browser is signed out, to sign-in with its notice, replacing the entry', async () => {
		const { links, revoked } = linksFor();
		const response = await links.afterReset(at('old'));
		expect(response.headers.get('location')).toBe('/sign-in?password-reset=1');
		expect(response.headers.get('x-remix-replace')).toBe('true');
		expect(setCookies(response)[0]).toStartWith('my-app_session=; Max-Age=0');
		expect(revoked).toEqual(['old']);
	});

	test('the challenge and the app’s cookies are cleared too', async () => {
		const { links } = linksFor({}, { clear: () => ['recent=; Max-Age=0'] });
		const cookies = setCookies(await links.afterReset(at('old')));
		expect(cookies).toEqual([
			'my-app_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
			'my-app_challenge=; Max-Age=0; Path=/sign-in; HttpOnly; SameSite=Lax',
			'recent=; Max-Age=0',
		]);
	});

	test('resetDone leads elsewhere; with no session nothing is revoked', async () => {
		const { links, revoked } = linksFor({ resetDone: '/welcome?reset=1' });
		const response = await links.afterReset(at());
		expect(response.headers.get('location')).toBe('/welcome?reset=1');
		expect(revoked).toEqual([]);
	});
});
