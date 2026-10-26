import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { refusal } from '../../test/errors/refusal';
import { body, thrown } from '../../test/session/flow';
import {
	crossSiteJson,
	linksFor,
	PATH,
	posting,
} from '../../test/session/links';
import { type Spent, TOKEN_PAGE_HEADERS } from './index';

const { links } = linksFor();
const api = (code: string, status: number, extra = {}) =>
	refusal(code, code, { http: { status }, ...extra });
/** A `Spent` known to be a refusal. */
function refused<T>(spent: Spent<T>) {
	if (spent.ok) throw new Error('expected a refusal');
	return spent;
}
const spend = (run: () => Promise<unknown>, fields = ['password']) =>
	links.spendToken(run, {
		request: posting(),
		language: 'en',
		path: PATH,
		fields,
		states: { 'auth.errors.invalid-token': 'invalid' },
	});

describe('spendToken', () => {
	test('the mutation’s value', async () => {
		expect(await spend(async () => 42)).toEqual({ ok: true, value: 42 });
	});

	test('a token that no longer works ends on its state, its URL replaced', async () => {
		const spent = await spend(() =>
			Promise.reject(api('auth.errors.invalid-token', 400)),
		);
		const response = (spent as { response: Response }).response;
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe(`${PATH}?state=invalid`);
		expect(response.headers.get('x-remix-replace')).toBe('true');
	});

	test('refused fields stay on the form', async () => {
		const spent = await spend(() =>
			Promise.reject(
				api('validation.errors.invalid-input', 400, {
					fields: [
						{
							path: 'password',
							code: 'validation.errors.required',
							message: 'x',
						},
					],
				}),
			),
		);
		expect(spent).toEqual({
			ok: false,
			refusal: { fieldErrors: { password: 'Required.' } },
			status: 400,
		});
	});

	test('a refused field the page does not show is the form’s message', async () => {
		const spent = await spend(
			() =>
				Promise.reject(
					api('validation.errors.invalid-input', 400, {
						fields: [
							{
								path: 'token',
								code: 'validation.errors.required',
								message: 'x',
							},
						],
					}),
				),
			[],
		);
		expect(spent).toMatchObject({
			ok: false,
			refusal: { formError: expect.any(String) },
		});
		expect(spent).not.toHaveProperty('refusal.fieldErrors');
	});

	test('a wait is answered with its status, an unreachable API with a 503', async () => {
		const wait = await spend(() =>
			Promise.reject(
				api('notes.errors.too-many-attempts', 429, { minutes: 1 }),
			),
		);
		const answered = body(links.answerOf(refused(wait)));
		expect(answered.init.status).toBe(429);
		expect(answered.data['formError']).toBe(
			'Too many attempts. Try again in 1 minute.',
		);
		expect(
			await spend(() => Promise.reject(new Response(null, { status: 503 }))),
		).toMatchObject({
			ok: false,
			status: 503,
			refusal: { formError: 'The service is unavailable.' },
		});
	});

	test('any other failure is the page’s error', async () => {
		const error = new Error('boom');
		await expect(spend(() => Promise.reject(error))).rejects.toBe(error);
	});

	test('answerOf gives an end state its redirect as it is', async () => {
		const spent = await spend(() =>
			Promise.reject(api('auth.errors.invalid-token', 400)),
		);
		expect(links.answerOf(refused(spent))).toBeInstanceOf(Response);
	});
});

describe('linkArgs', () => {
	test('a cross-site post is refused before the schema reads it', async () => {
		const refusedPost = (await thrown(() =>
			links.linkArgs(z.object({ token: z.string() }), crossSiteJson(), PATH),
		)) as { init: { status: number } };
		expect(refusedPost.init.status).toBe(403);
		const text = new Request('http://my-app.test/x', {
			method: 'POST',
			headers: { 'content-type': 'text/plain' },
			body: '{"token":"t"}',
		});
		// Not JSON: a native post, which goes back to its page.
		const native = await thrown(() =>
			links.linkArgs(z.object({ token: z.string() }), text, PATH),
		);
		expect(native).toBeInstanceOf(Response);
		const foreign = new Request('http://my-app.test/x', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				origin: 'http://evil.test',
			},
			body: '{"token":"t"}',
		});
		const forbidden = (await thrown(() =>
			links.linkArgs(z.object({ token: z.string() }), foreign, PATH),
		)) as { init: { status: number } };
		expect(forbidden.init.status).toBe(403);
	});

	const schema = z.object({
		token: z.string().max(200),
		password: z.string().optional(),
	});

	test('a token too long or missing ends on the invalid state, replaced', async () => {
		for (const input of [{ token: 't'.repeat(201) }, {}]) {
			const response = (await thrown(() =>
				links.linkArgs(schema, posting(undefined, input), PATH),
			)) as Response;
			expect(response.headers.get('location')).toBe(`${PATH}?state=invalid`);
			expect(response.headers.get('x-remix-replace')).toBe('true');
			expect(response.headers.get('location')).not.toContain('ttt');
		}
	});

	test('any other refusal is a 400', async () => {
		const error = (await thrown(() =>
			links.linkArgs(
				schema,
				posting(undefined, { token: 't', password: 1 }),
				PATH,
			),
		)) as { init: { status: number } };
		expect(error.init.status).toBe(400);
	});

	test('a well-formed token goes on, from an async schema too', async () => {
		expect(
			await links.linkArgs(schema, posting(undefined, { token: 't' }), PATH),
		).toEqual({
			token: 't',
		});
		const later = z.object({ token: z.string() }).refine(async () => true);
		expect(
			await links.linkArgs(later, posting(undefined, { token: 't' }), PATH),
		).toEqual({
			token: 't',
		});
	});

	test('the invalid state is the app’s when it names one', async () => {
		const { links: own } = linksFor({ invalidState: 'expired' });
		const response = (await thrown(() =>
			own.linkArgs(schema, posting(), PATH),
		)) as Response;
		expect(response.headers.get('location')).toBe(`${PATH}?state=expired`);
	});
});

test('TOKEN_PAGE_HEADERS keeps the token out of Referer and out of search engines', () => {
	expect(TOKEN_PAGE_HEADERS).toEqual({
		'Referrer-Policy': 'no-referrer',
		'X-Robots-Tag': 'noindex, nofollow',
	});
});
