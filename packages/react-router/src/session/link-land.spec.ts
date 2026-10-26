import { describe, expect, test } from 'bun:test';
import { asking, body, END, setCookies } from '../../test/session/flow';
import { linksFor, PATH } from '../../test/session/links';

const signedIn = { status: 'signedIn', token: 'new', expiresAt: END } as const;
const at = (token?: string) => asking(`${PATH}?token=secret`, token);
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
	test('the browser is signed out, to sign-in with its notice, replacing the entry', async () => {
		const { links, revoked } = linksFor();
		const response = await links.afterReset(at('old'));
		expect(response.headers.get('location')).toBe('/sign-in?password-reset=1');
		expect(response.headers.get('x-remix-replace')).toBe('true');
		expect(response.headers.get('set-cookie')).toStartWith(
			'my-app_session=; Max-Age=0',
		);
		expect(revoked).toEqual(['old']);
	});

	test('resetDone leads elsewhere; with no session nothing is revoked', async () => {
		const { links, revoked } = linksFor({ resetDone: '/welcome?reset=1' });
		const response = await links.afterReset(at());
		expect(response.headers.get('location')).toBe('/welcome?reset=1');
		expect(revoked).toEqual([]);
	});
});
