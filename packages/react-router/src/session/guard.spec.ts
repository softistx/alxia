import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { asking, flowFor, posted, thrown } from '../../test/session/flow';
import { linksFor, PATH } from '../../test/session/links';
import { steps } from '../../test/session/step-up';
import { jsonActions } from '../errors';
import { samesitePost } from './guard';

/** A JSON post another site sent: it carries the session cookie of the browser. */
const evil = (token = 'old') =>
	asking('/sign-in?next=%2Forders', token, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			origin: 'https://evil.test',
			'sec-fetch-site': 'cross-site',
		},
		body: JSON.stringify({ token: 'secret', kind: 'code', code: '123456' }),
	});
/** A native form post of the same site (before hydration). */
const form = () =>
	asking('/auth/magic-link?token=secret', undefined, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: 'token=secret',
	});
const signedIn = {
	status: 'signedIn',
	token: 'new',
	expiresAt: new Date(Date.now() + 3_600_000),
} as const;

const status = (error: unknown) =>
	(error as { init: { status: number } }).init.status;

describe('samesitePost', () => {
	test('a native form post goes back to its page', async () => {
		const error = await thrown(() => samesitePost(jsonActions(), form()));
		expect(error).toBeInstanceOf(Response);
		expect((error as Response).headers.get('location')).toBe(
			`${PATH}?token=secret`,
		);
	});

	test('a JSON post from another site is a 403, on the origin or the fetch site alone', async () => {
		const only = (headers: Record<string, string>) =>
			asking('/x', undefined, {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...headers },
				body: '{}',
			});
		for (const headers of [
			{ origin: 'https://evil.test' },
			{ 'sec-fetch-site': 'cross-site' },
		]) {
			const error = await thrown(() =>
				samesitePost(jsonActions(), only(headers)),
			);
			expect(status(error)).toBe(403);
		}
	});

	test('the configured origin is the one allowed, as readJson has it', async () => {
		const json = jsonActions({ origin: 'https://my-app.test' });
		const post = (origin: string) =>
			asking('/x', undefined, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin },
				body: '{}',
			});
		expect(samesitePost(json, post('https://my-app.test'))).toBeUndefined();
		expect(
			status(
				await thrown(() => samesitePost(json, post('http://my-app.test'))),
			),
		).toBe(403);
	});

	test('it does not read the body', () => {
		const request = asking('/x', undefined, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		});
		samesitePost(jsonActions(), request);
		expect(request.bodyUsed).toBe(false);
	});
});

describe('a cross-site JSON post does nothing', () => {
	test('signInStep: no run, nothing revoked', async () => {
		const { flow, revoked } = flowFor();
		let ran = false;
		const error = await thrown(() =>
			flow.signInStep(
				async () => {
					ran = true;
					return signedIn;
				},
				{
					request: evil(),
					language: 'en',
					next: '/',
					extra: {},
				},
			),
		);
		expect(status(error)).toBe(403);
		expect([ran, revoked]).toEqual([false, []]);
	});

	test('readCodeInput', async () => {
		const { flow } = flowFor();
		expect(status(await thrown(() => flow.readCodeInput(evil())))).toBe(403);
	});

	test('landByLink: nothing landed, nothing revoked', async () => {
		const { links, revoked } = linksFor();
		const error = await thrown(() =>
			links.landByLink(signedIn, { request: evil(), language: 'en' }),
		);
		expect(status(error)).toBe(403);
		expect(revoked).toEqual([]);
	});

	test('afterReset: nothing revoked', async () => {
		const { links, revoked } = linksFor();
		expect(status(await thrown(() => links.afterReset(evil())))).toBe(403);
		expect(revoked).toEqual([]);
	});

	test('requestLink: nothing mailed', async () => {
		const { links } = linksFor();
		let ran = false;
		const error = await thrown(() =>
			links.requestLink(
				async () => {
					ran = true;
				},
				{
					request: evil(),
					language: 'en',
				},
			),
		);
		expect(status(error)).toBe(403);
		expect(ran).toBe(false);
	});

	test('linkArgs: the body is not read', async () => {
		const { links } = linksFor();
		const request = evil();
		const error = await thrown(() =>
			links.linkArgs(z.object({ token: z.string() }), request, PATH),
		);
		expect(status(error)).toBe(403);
		expect(request.bodyUsed).toBe(false);
	});

	test('spendToken: no run', async () => {
		const { links } = linksFor();
		let ran = false;
		const error = await thrown(() =>
			links.spendToken(
				async () => {
					ran = true;
				},
				{
					request: evil(),
					language: 'en',
					path: PATH,
					states: {},
				},
			),
		);
		expect(status(error)).toBe(403);
		expect(ran).toBe(false);
	});

	test('stepUp.request and stepUp.confirm: no run', async () => {
		let ran = 0;
		const run = async () => {
			ran++;
			return { challenge: 'c', via: 'email' as const };
		};
		const call = { request: evil(), language: 'en' as const };
		expect(status(await thrown(() => steps().request(run, call)))).toBe(403);
		expect(status(await thrown(() => steps().confirm(run, call)))).toBe(403);
		expect(ran).toBe(0);
	});
});

describe('a native form post goes back to its page', () => {
	test('linkArgs redirects, not 415', async () => {
		const { links } = linksFor();
		const error = await thrown(() =>
			links.linkArgs(z.object({ token: z.string() }), form(), PATH),
		);
		expect(error).toBeInstanceOf(Response);
		expect((error as Response).headers.get('location')).toBe(
			`${PATH}?token=secret`,
		);
	});

	test('the step-up steps redirect too', async () => {
		const run = async () => ({ challenge: 'c', via: 'email' as const });
		const error = await thrown(() =>
			steps().request(run, { request: form(), language: 'en' }),
		);
		expect(error).toBeInstanceOf(Response);
	});
});

describe('the flow’s public steps and guard', () => {
	test('guard(request) is the same check: a redirect for a native post, a 403 across sites', async () => {
		const { flow } = flowFor();
		expect(await thrown(() => flow.guard(form()))).toBeInstanceOf(Response);
		expect(status(await thrown(() => flow.guard(evil())))).toBe(403);
		expect(flow.guard(posted('/passkey', 'tok'))).toBeUndefined();
	});

	test('landReplacing refuses a cross-site post before it lands or revokes', async () => {
		const { flow, revoked } = flowFor();
		const error = await thrown(() =>
			flow.landReplacing(signedIn, '/', { request: evil() }),
		);
		expect(status(error)).toBe(403);
		expect(revoked).toEqual([]);
	});

	test('revokeSession refuses a cross-site post before it revokes', async () => {
		const { flow, revoked } = flowFor();
		expect(status(await thrown(() => flow.revokeSession(evil())))).toBe(403);
		expect(revoked).toEqual([]);
	});

	test('a spread copy of jsonActions keeps the configured origin', async () => {
		const json = { ...jsonActions({ origin: 'https://my-app.test' }) };
		const { flow } = flowFor({ json });
		const from = (origin: string) =>
			asking('/x', undefined, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin },
				body: '{}',
			});
		expect(flow.guard(from('https://my-app.test'))).toBeUndefined();
		expect(
			status(await thrown(() => flow.guard(from('http://my-app.test')))),
		).toBe(403);
	});

	test('the origin option is read at each request', async () => {
		let origin = 'https://a.test';
		const { flow } = flowFor({ json: jsonActions({ origin: () => origin }) });
		const from = asking('/x', undefined, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: 'https://b.test' },
			body: '{}',
		});
		expect(status(await thrown(() => flow.guard(from)))).toBe(403);
		origin = 'https://b.test';
		expect(flow.guard(from)).toBeUndefined();
	});

	test('signInFlow refuses a json that did not come from jsonActions()', () => {
		const double = {
			readJson: async () => ({}),
			requireJsonPost: () => undefined,
			readInput: async () => ({}),
		} as never;
		expect(() => flowFor({ json: double })).toThrow(
			new TypeError(
				"signInFlow(): json must come from jsonActions(), which carries the site check every step runs; this object has none (a hand-made double?). Pass the app's jsonActions({ origin }) instance, or a spread copy of it.",
			),
		);
	});
});
