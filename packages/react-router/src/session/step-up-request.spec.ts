import { describe, expect, test } from 'bun:test';
import { refusal } from '../../test/errors/refusal';
import { body, stepCall, thrown } from '../../test/session/flow';
import { down, steps } from '../../test/session/step-up';

describe('request', () => {
	test('a granted request carries the challenge and how it is confirmed, plain', async () => {
		const answer = await steps().request(
			async () => ({ challenge: 'c1', via: 'email' }),
			stepCall(),
		);
		expect(answer).toEqual({
			ok: true,
			intent: 'request-step-up',
			challenge: 'c1',
			via: 'email',
		});
	});

	test('keeps only the challenge and how it is confirmed', async () => {
		const answer = await steps().request(
			async () => ({ challenge: 'c1', via: 'secondFactor', code: '1' }),
			stepCall(),
		);
		expect(answer).toEqual({
			ok: true,
			intent: 'request-step-up',
			challenge: 'c1',
			via: 'secondFactor',
		});
	});

	test('a refusal is error "failed" with the API’s words and status', async () => {
		const result = body(
			await steps().request(
				() => Promise.reject(refusal('auth.errors.x', 'Not now', {}, 403)),
				stepCall(),
			),
		);
		expect(result.data).toEqual({
			ok: false,
			intent: 'request-step-up',
			error: 'failed',
			message: 'Not now',
		});
		expect(result.init.status).toBe(403);
	});

	test('the app’s wording comes first: a throttled mail says its wait', async () => {
		const throttled = refusal(
			'MAIL_THROTTLED',
			'Slow down',
			{ retryAfter: 120 },
			429,
		);
		const result = body(
			await steps({
				wording: (error, language) =>
					error.code === 'MAIL_THROTTLED'
						? `wait ${error.errors[0]?.extensions?.['retryAfter']} s (${language})`
						: undefined,
			}).request(() => Promise.reject(throttled), stepCall()),
		);
		expect(result.data).toMatchObject({
			error: 'throttled',
			retryAfter: 120,
			message: 'wait 120 s (en)',
		});
		expect(result.init.status).toBe(429);
	});

	describe('a throttled mail', () => {
		const throttle = async (
			extensions: Record<string, unknown>,
			options: Parameters<typeof steps>[0] = {},
			code = 'MAIL_THROTTLED',
		) =>
			body(
				await steps(options).request(
					() => Promise.reject(refusal(code, 'Slow down', extensions, 429)),
					stepCall(),
				),
			);

		test('is error "throttled" with the seconds to wait and the API’s words', async () => {
			const result = await throttle({ retryAfter: 90 });
			expect(result.data).toEqual({
				ok: false,
				intent: 'request-step-up',
				error: 'throttled',
				message: 'Slow down',
				retryAfter: 90,
			});
			expect(result.init.status).toBe(429);
		});

		test('reads the seconds from params first, a numeric string too, rounded up', async () => {
			expect(
				(await throttle({ params: { retryAfter: 30 }, retryAfter: 90 })).data[
					'retryAfter'
				],
			).toBe(30);
			expect((await throttle({ retryAfter: '45' })).data['retryAfter']).toBe(
				45,
			);
			expect((await throttle({ retryAfter: 1.2 })).data['retryAfter']).toBe(2);
			expect((await throttle({ retryAfter: 0 })).data['retryAfter']).toBe(0);
		});

		test('with no usable seconds it is throttled all the same, without retryAfter', async () => {
			for (const extensions of [
				{},
				{ retryAfter: 'soon' },
				{ retryAfter: -5 },
				{ retryAfter: null },
			]) {
				const result = await throttle(extensions);
				expect(result.data['error']).toBe('throttled');
				expect('retryAfter' in result.data).toBe(false);
				expect(result.data['message']).toBe('Slow down');
			}
		});

		test('codes.mailThrottled names the app’s own code', async () => {
			const own = { codes: { mailThrottled: 'auth.errors.too-many' } };
			expect(
				(await throttle({ retryAfter: 5 }, own, 'auth.errors.too-many')).data[
					'error'
				],
			).toBe('throttled');
			expect((await throttle({ retryAfter: 5 }, own)).data['error']).toBe(
				'failed',
			);
		});

		test('another refusal with a wait is not a throttle', async () => {
			const result = await throttle({ retryAfter: 5 }, {}, 'x.errors.y');
			expect(result.data['error']).toBe('failed');
			expect('retryAfter' in result.data).toBe(false);
		});
	});

	test('wording that returns undefined keeps the default', async () => {
		const result = body(
			await steps({ wording: () => undefined }).request(
				() => Promise.reject(refusal('auth.errors.x', 'Not now')),
				stepCall(),
			),
		);
		expect(result.data['message']).toBe('Not now');
	});

	test('an API it cannot reach is “failed” with the unavailable word and a 503', async () => {
		const result = body(
			await steps().request(() => Promise.reject(down()), stepCall()),
		);
		expect(result.data).toEqual({
			ok: false,
			intent: 'request-step-up',
			error: 'failed',
			message: 'The service is unavailable.',
		});
		expect(result.init.status).toBe(503);
	});

	test('a failure that is not the API’s is rethrown', async () => {
		const bug = new TypeError('bug');
		expect(
			await thrown(() =>
				steps().request(() => Promise.reject(bug), stepCall()),
			),
		).toBe(bug);
	});
});
