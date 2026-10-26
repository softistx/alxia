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
			error: 'failed',
			message: 'wait 120 s (en)',
		});
		expect(result.init.status).toBe(429);
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
