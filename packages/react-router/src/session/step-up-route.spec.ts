import { describe, expect, test } from 'bun:test';
import { refusal } from '../../test/errors/refusal';
import { asking, body, jsonPost, thrown } from '../../test/session/flow';
import { steps, wrong } from '../../test/session/step-up';

const call = (payload: unknown) => ({
	request: jsonPost('/step-up', payload),
	language: 'en' as const,
});

const run = (log: unknown[] = []) => ({
	request: async () => {
		log.push('request');
		return { challenge: 'c1', via: 'email' as const };
	},
	confirm: async (input: { challenge: string; code: string }) => {
		log.push(input);
	},
});

describe('route', () => {
	test('request-step-up runs the request step', async () => {
		const log: unknown[] = [];
		const answer = await steps().route(
			run(log),
			call({ intent: 'request-step-up' }),
		);
		expect(answer).toEqual({
			ok: true,
			intent: 'request-step-up',
			challenge: 'c1',
			via: 'email',
		});
		expect(log).toEqual(['request']);
	});

	test('confirm-step-up runs the confirm step with the challenge and the code', async () => {
		const log: unknown[] = [];
		const answer = await steps().route(
			run(log),
			call({
				intent: 'confirm-step-up',
				challenge: 'c1',
				code: '123456',
				via: 'secondFactor',
			}),
		);
		expect(answer).toEqual({ ok: true, intent: 'confirm-step-up' });
		expect(log).toEqual([{ challenge: 'c1', code: '123456' }]);
	});

	test('a refused code answers the confirm step’s refusal', async () => {
		const result = body(
			await steps().route(
				{
					...run(),
					confirm: () => Promise.reject(new Response('down', { status: 503 })),
				},
				call({ intent: 'confirm-step-up', challenge: 'c', code: '1' }),
			),
		);
		expect(result.data).toMatchObject({
			ok: false,
			intent: 'confirm-step-up',
			error: 'failed',
		});
		expect(result.init.status).toBe(503);
	});

	test('any other intent, or a confirm with no code, is a 400 and runs nothing', async () => {
		const log: unknown[] = [];
		for (const payload of [
			{ intent: 'delete' },
			{ intent: 'confirm-step-up', challenge: 'c' },
			null,
		]) {
			const error = (await thrown(() =>
				steps().route(run(log), call(payload)),
			)) as { init: { status: number } };
			expect(error.init.status).toBe(400);
		}
		expect(log).toEqual([]);
	});

	test('a JSON post from another site is a 403, and a native form post goes back to its page', async () => {
		const log: unknown[] = [];
		const crossSite = asking('/step-up', undefined, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				origin: 'https://evil.test',
			},
			body: JSON.stringify({ intent: 'request-step-up' }),
		});
		const forbidden = (await thrown(() =>
			steps().route(run(log), { request: crossSite, language: 'en' }),
		)) as { init?: { status: number }; status?: number };
		expect(forbidden.init?.status ?? forbidden.status).toBe(403);

		const form = asking('/step-up', undefined, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: 'intent=request-step-up',
		});
		const back = (await thrown(() =>
			steps().route(run(log), { request: form, language: 'en' }),
		)) as Response;
		expect(back.status).toBe(302);
		expect(log).toEqual([]);
	});
});

describe('route, onSignedOut: sign-in', () => {
	const confirmPayload = {
		intent: 'confirm-step-up',
		challenge: 'c',
		code: '1',
	};
	const callFrom = (payload: unknown, referer?: string) => ({
		request: asking('/step-up', undefined, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(referer ? { referer } : {}),
			},
			body: JSON.stringify(payload),
		}),
		language: 'en' as const,
	});
	const failing = (error: unknown) => ({
		request: () => Promise.reject(error),
		confirm: () => Promise.reject(error),
	});
	const signedOut = () => refusal('UNAUTHENTICATED', 'No session', {}, 401);
	const to = async (call: ReturnType<typeof callFrom>, error: unknown) =>
		(await thrown(() =>
			steps({}, [], 'sign-in').route(failing(error), call),
		)) as Response;

	test('a wrong code stays a refusal for the dialog', async () => {
		const answer = body(
			await steps({}, [], 'sign-in').route(
				failing(wrong(2)),
				callFrom(confirmPayload),
			),
		);
		expect(answer.data).toMatchObject({ ok: false, error: 'invalid' });
		expect(answer.init.status).toBe(401);
	});

	test('an UNAUTHENTICATED answer redirects to sign-in with the same-site Referer as next', async () => {
		for (const payload of [{ intent: 'request-step-up' }, confirmPayload]) {
			const res = await to(
				callFrom(payload, 'http://my-app.test/orders?page=2'),
				signedOut(),
			);
			expect(res.status).toBe(302);
			const location = new URL(res.headers.get('location') ?? '', 'http://h');
			expect(location.searchParams.get('next')).toBe('/orders?page=2');
		}
	});

	test('a bare 401 response redirects too', async () => {
		const res = await to(
			callFrom(confirmPayload, 'http://my-app.test/a'),
			new Response('no', { status: 401 }),
		);
		expect(res.status).toBe(302);
	});

	test('a foreign Referer is ignored: next is the route’s own path', async () => {
		const res = await to(
			callFrom(confirmPayload, 'https://evil.test/orders'),
			signedOut(),
		);
		const location = new URL(res.headers.get('location') ?? '', 'http://h');
		expect(location.searchParams.get('next')).toBe('/step-up');
	});

	test('a second-factor-required answer is a refusal, never a redirect', async () => {
		const answer = body(
			await steps({}, [], 'sign-in').route(
				failing(refusal('SECOND_FACTOR_REQUIRED', 'Enrol', {}, 403)),
				callFrom({ intent: 'request-step-up' }, 'http://my-app.test/orders'),
			),
		);
		expect(answer.data).toMatchObject({ ok: false, error: 'failed' });
	});

	test('without the option, an UNAUTHENTICATED answer is not redirected', async () => {
		const answer = body(
			await steps().route(failing(signedOut()), callFrom(confirmPayload)),
		);
		expect(answer.data).toMatchObject({ ok: false });
	});
});
