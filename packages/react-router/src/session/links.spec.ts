import { describe, expect, test } from 'bun:test';
import { refusal } from '../../test/errors/refusal';
import { body, thrown } from '../../test/session/flow';
import { crossSite, linksFor, posting } from '../../test/session/links';

const api = (code: string, status: number, extra = {}) =>
	refusal(code, 'Wait a little.', { http: { status }, ...extra });

describe('requestLink', () => {
	test('wording words every refusal that is not a field’s, the wait included', async () => {
		const { links } = linksFor({
			wording: (error, language) => `${language}: ${error.code}`,
		});
		const ask = async (code: string, status: number) =>
			body(
				await links.requestLink(() => Promise.reject(api(code, status)), {
					request: posting(),
					language: 'fr',
				}),
			);
		expect((await ask('x.errors.y', 500)).data).toEqual({
			formError: 'fr: x.errors.y',
		});
		expect((await ask('MAIL_THROTTLED', 429)).data).toEqual({
			formError: 'fr: MAIL_THROTTLED',
			throttled: true,
		});
	});

	test('wording returning nothing keeps the default words', async () => {
		const { links } = linksFor({ wording: () => undefined });
		const answered = body(
			await links.requestLink(() => Promise.reject(api('x.errors.y', 500)), {
				request: posting(),
				language: 'en',
			}),
		);
		expect(answered.data).toEqual({ formError: 'Wait a little.' });
	});

	test('sent, whoever the e-mail is', async () => {
		const { links } = linksFor();
		expect(
			body(
				await links.requestLink(async () => true, {
					request: posting(),
					language: 'en',
				}),
			).data,
		).toEqual({
			sent: true,
		});
	});

	test('a wait is a 429 with the API’s words, by MAIL_THROTTLED', async () => {
		const { links } = linksFor();
		const answered = body(
			await links.requestLink(
				() => Promise.reject(api('MAIL_THROTTLED', 429)),
				{
					request: posting(),
					language: 'en',
				},
			),
		);
		expect(answered.init.status).toBe(429);
		expect(answered.data).toEqual({
			formError: 'Wait a little.',
			throttled: true,
		});
	});

	test('a wait with seconds carries them, typed, beside the words', async () => {
		const { links } = linksFor();
		const answered = body(
			await links.requestLink(
				() => Promise.reject(api('MAIL_THROTTLED', 429, { retryAfter: 120 })),
				{ request: posting(), language: 'en' },
			),
		);
		expect(answered.data).toEqual({
			formError: 'Wait a little.',
			throttled: true,
			retryAfter: 120,
		});
	});

	test('the app names its own throttle code and wording', async () => {
		const { links } = linksFor({
			codes: { mailThrottled: 'auth.errors.too-many-attempts' },
			wording: (error, language) => `${language}: ${error.code}`,
		});
		const answered = body(
			await links.requestLink(
				() => Promise.reject(api('auth.errors.too-many-attempts', 429)),
				{ request: posting(), language: 'fr' },
			),
		);
		expect(answered.init.status).toBe(429);
		expect(answered.data['formError']).toBe(
			'fr: auth.errors.too-many-attempts',
		);
	});

	test('several throttle codes each count down', async () => {
		const { links } = linksFor({
			codes: { mailThrottled: ['auth.per-address', 'auth.per-mail'] },
		});
		for (const [code, wait] of [
			['auth.per-address', 30],
			['auth.per-mail', 90],
		] as const) {
			const answered = body(
				await links.requestLink(
					() => Promise.reject(api(code, 429, { retryAfter: wait })),
					{ request: posting(), language: 'fr' },
				),
			);
			expect(answered.init.status).toBe(429);
			expect(answered.data['throttled']).toBe(true);
			expect(answered.data['retryAfter']).toBe(wait);
		}
	});

	test('a code outside the list is not a countdown', async () => {
		const { links } = linksFor({
			codes: { mailThrottled: ['auth.per-address', 'auth.per-mail'] },
		});
		const answered = body(
			await links.requestLink(
				() => Promise.reject(api('MAIL_THROTTLED', 429, { retryAfter: 5 })),
				{ request: posting(), language: 'fr' },
			),
		);
		expect(answered.data['throttled']).toBeUndefined();
		expect(answered.data['retryAfter']).toBeUndefined();
	});

	test('a malformed address is the field’s refusal', async () => {
		const { links } = linksFor();
		const answered = body(
			await links.requestLink(
				() =>
					Promise.reject(
						api('validation.errors.invalid-input', 400, {
							fields: [
								{
									path: 'email',
									code: 'validation.errors.required',
									message: 'x',
								},
							],
						}),
					),
				{ request: posting(), language: 'en' },
			),
		);
		expect(answered.init.status).toBe(400);
		expect(answered.data).toEqual({ fieldErrors: { email: 'Required.' } });
	});

	test('another refusal, or an unreachable API, is the form’s message', async () => {
		const { links } = linksFor();
		const refused = body(
			await links.requestLink(() => Promise.reject(api('x.errors.y', 500)), {
				request: posting(),
				language: 'en',
			}),
		);
		expect(refused.init.status).toBe(500);
		expect(refused.data).toEqual({ formError: 'Wait a little.' });
		const down = body(
			await links.requestLink(
				() => Promise.reject(new Response(null, { status: 503 })),
				{ request: posting(), language: 'en' },
			),
		);
		expect(down.init.status).toBe(503);
	});

	test('any other failure is the page’s error', async () => {
		const { links } = linksFor();
		const error = new Error('boom');
		await expect(
			links.requestLink(() => Promise.reject(error), {
				request: posting(),
				language: 'en',
			}),
		).rejects.toBe(error);
	});
});

test('a cross-site post requests nothing', async () => {
	const { links } = linksFor();
	let ran = false;
	const refused = await thrown(() =>
		links.requestLink(
			async () => {
				ran = true;
			},
			{ request: crossSite(), language: 'en' },
		),
	);
	expect(refused).toBeInstanceOf(Response);
	expect(ran).toBe(false);
});

describe('authLinks', () => {
	test('resetDone must be a path of this site', () => {
		for (const resetDone of ['https://evil.test', '//evil.test', 'sign-in']) {
			expect(() => linksFor({ resetDone })).toThrow(
				new TypeError(
					`authLinks(): resetDone must be a path of this site, starting with a single "/"; got ${JSON.stringify(resetDone)}.`,
				),
			);
		}
	});
});
