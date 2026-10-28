import { describe, expect, test } from 'bun:test';
import { body, jsonPost, thrown } from '../../test/session/flow';
import { steps } from '../../test/session/step-up';

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
});
