import { describe, expect, test } from 'bun:test';
import { refusal } from '../../test/errors/refusal';
import { asking, body, END, flowFor, thrown } from '../../test/session/flow';

const signedIn = { status: 'signedIn', token: 'new', expiresAt: END } as const;
const api = (status: number, message = 'Wrong password') =>
	refusal('auth.errors.wrong', message, { http: { status } });
const step = { language: 'en', next: '/', extra: { method: 'code' } } as const;

describe('signInStep', () => {
	test('lands where the answer leads', async () => {
		const { flow, revoked } = flowFor();
		const response = await flow.signInStep(async () => signedIn, {
			...step,
			request: asking('/sign-in', 'old'),
			next: '/orders',
		});
		expect((response as Response).headers.get('location')).toBe('/orders');
		expect(revoked).toEqual(['old']);
	});

	test('an API refusal is the form message with the API’s status, plus the extra fields', async () => {
		const { flow } = flowFor();
		const result = body(
			await flow.signInStep(() => Promise.reject(api(401)), {
				...step,
				request: asking('/sign-in'),
			}),
		);
		expect(result.data).toEqual({
			method: 'code',
			formError: 'Wrong password',
		});
		expect(result.init.status).toBe(401);
	});

	test('refused returns a string: that is the message, with the same status', async () => {
		const { flow } = flowFor();
		const result = body(
			await flow.signInStep(() => Promise.reject(api(401)), {
				...step,
				request: asking('/sign-in'),
				refused: (error) => `locked (${error.code})`,
			}),
		);
		expect(result.data['formError']).toBe('locked (auth.errors.wrong)');
		expect(result.init.status).toBe(401);
	});

	test('refused returns a Response: that is the answer', async () => {
		const { flow } = flowFor();
		const gone = new Response(null, { status: 303 });
		const response = await flow.signInStep(() => Promise.reject(api(401)), {
			...step,
			request: asking('/sign-in'),
			refused: () => gone,
		});
		expect(response).toBe(gone);
	});

	test('refused returns nothing: the default message', async () => {
		const { flow } = flowFor();
		const result = body(
			await flow.signInStep(() => Promise.reject(api(429, 'Slow down')), {
				...step,
				request: asking('/sign-in'),
				refused: () => undefined,
			}),
		);
		expect(result.data['formError']).toBe('Slow down');
		expect(result.init.status).toBe(429);
	});

	test('an API it cannot reach is the unavailable word, with 503', async () => {
		const { flow } = flowFor();
		const result = body(
			await flow.signInStep(
				() => Promise.reject(new Response('down', { status: 503 })),
				{ ...step, request: asking('/sign-in') },
			),
		);
		expect(result.data).toEqual({
			method: 'code',
			formError: 'The service is unavailable.',
		});
		expect(result.init.status).toBe(503);
	});

	test('the app can word unavailable itself, and refused is not asked', async () => {
		const { flow } = flowFor({
			unavailable: (language) => `down (${language})`,
		});
		let asked = false;
		const result = body(
			await flow.signInStep(
				() => Promise.reject(new Response('down', { status: 503 })),
				{
					...step,
					request: asking('/sign-in'),
					refused: () => {
						asked = true;
						return undefined;
					},
				},
			),
		);
		expect(result.data['formError']).toBe('down (en)');
		expect(asked).toBe(false);
	});

	test('an answer that opens no session says unavailable too', async () => {
		const { flow } = flowFor();
		const result = body(
			await flow.signInStep(async () => ({ status: 'other' }), {
				...step,
				request: asking('/sign-in'),
			}),
		);
		expect(result.init.status).toBe(503);
	});

	test('a failure that is not the API’s is rethrown', async () => {
		const { flow } = flowFor();
		const error = new TypeError('bug');
		const caught = await thrown(() =>
			flow.signInStep(() => Promise.reject(error), {
				...step,
				request: asking('/sign-in'),
			}),
		);
		expect(caught).toBe(error);
	});
});

describe('codeRefusal', () => {
	const wrong = (extensions: Record<string, unknown> = {}) =>
		refusal('CODE_INVALID', 'Wrong code', extensions);

	test('a wrong code says the tries left', () => {
		const { flow } = flowFor();
		expect(flow.codeRefusal(wrong({ attemptsLeft: 3 }), 'en')).toBe(
			'Wrong code 3 left (en)',
		);
	});

	test('with none left the challenge is over: undefined', () => {
		const { flow } = flowFor();
		expect(flow.codeRefusal(wrong({ attemptsLeft: 0 }), 'en')).toBeUndefined();
	});

	test('with none left and whenNone, the message says it instead', () => {
		const { flow } = flowFor();
		expect(flow.codeRefusal(wrong({ attemptsLeft: 0 }), 'en', 'Wait.')).toBe(
			'Wrong code Wait.',
		);
	});

	test('an API that counts no tries gives the message alone', () => {
		const { flow } = flowFor();
		expect(flow.codeRefusal(wrong(), 'en')).toBe('Wrong code');
		expect(flow.codeRefusal(wrong(), 'en', 'Wait.')).toBe('Wrong code');
	});

	test('a challenge gone is over: undefined', () => {
		const { flow } = flowFor();
		for (const code of ['TOKEN_UNKNOWN', 'TOKEN_SPENT', 'TOKEN_EXPIRED']) {
			expect(flow.codeRefusal(refusal(code, 'Gone'), 'en')).toBeUndefined();
		}
	});

	test('any other refusal is worded as it is', () => {
		const { flow } = flowFor();
		const throttled = refusal('MAIL_THROTTLED', 'Slow down');
		expect(flow.codeRefusal(throttled, 'en')).toBe('Slow down');
		expect(flow.codeRefusal(refusal(undefined, 'Odd'), 'en')).toBe('Odd');
	});

	test('the app’s own codes replace the defaults', () => {
		const { flow } = flowFor({
			codes: {
				invalidCode: 'auth.errors.invalid-code',
				challengeOver: ['auth.errors.invalid-token'],
			},
		});
		const invalid = refusal('auth.errors.invalid-code', 'Nope', {
			attemptsLeft: 2,
		});
		expect(flow.codeRefusal(invalid, 'fr')).toBe('Nope 2 left (fr)');
		const gone = refusal('auth.errors.invalid-token', 'Gone');
		expect(flow.codeRefusal(gone, 'en')).toBeUndefined();
		expect(flow.codeRefusal(wrong(), 'en')).toBe('Wrong code');
	});
});
