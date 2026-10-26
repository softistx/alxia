import { describe, expect, test } from 'bun:test';
import type { StepUpVia } from './second-factor';
import {
	INITIAL_STEP_UP,
	type StepUpAction,
	type StepUpState,
	stepUpReducer,
} from './step-up';
import type { StepUpConfirmAnswer } from './step-up-answers';

const run = (...actions: StepUpAction[]) =>
	actions.reduce<StepUpState>(stepUpReducer, INITIAL_STEP_UP);

const issued = (via: StepUpVia = 'email', challenge = 'c1'): StepUpAction => ({
	type: 'requested',
	answer: { ok: true, intent: 'request-step-up', challenge, via },
});
const refused = (
	answer: Partial<Extract<StepUpConfirmAnswer, { ok: false }>> = {},
): StepUpAction => ({
	type: 'confirmed',
	answer: {
		ok: false,
		intent: 'confirm-step-up',
		error: 'invalid',
		locked: false,
		...answer,
	},
});
const accepted: StepUpAction = {
	type: 'confirmed',
	answer: { ok: true, intent: 'confirm-step-up' },
};

describe('the refusal’s message and wait', () => {
	const throttled: StepUpAction = {
		type: 'requested',
		answer: {
			ok: false,
			intent: 'request-step-up',
			error: 'throttled',
			message: 'Wait 2 minutes.',
			retryAfter: 120,
		},
	};

	test('a refused request keeps its message and its wait', () => {
		const state = run({ type: 'start' }, throttled);
		expect(state).toMatchObject({
			phase: 'idle',
			error: 'throttled',
			message: 'Wait 2 minutes.',
			retryAfter: 120,
		});
	});

	test('a throttle without seconds has a message and no wait', () => {
		const state = run(
			{ type: 'start' },
			{
				type: 'requested',
				answer: {
					ok: false,
					intent: 'request-step-up',
					error: 'throttled',
					message: 'Later.',
				},
			},
		);
		expect(state.message).toBe('Later.');
		expect(state.retryAfter).toBeUndefined();
	});

	test('a refused code keeps its message, and no wait', () => {
		const state = run(
			issued('secondFactor'),
			refused({ message: 'Wrong code.' }),
		);
		expect(state.message).toBe('Wrong code.');
		expect(state.retryAfter).toBeUndefined();
	});

	test('an expired code keeps its message too', () => {
		const state = run(
			issued(),
			refused({ error: 'expired', message: 'Ask again.' }),
		);
		expect(state).toMatchObject({ phase: 'idle', message: 'Ask again.' });
	});

	test('start, submit, an ok answer and release clear them', () => {
		const after = (...more: StepUpAction[]) => run(throttled, ...more);
		for (const state of [
			after({ type: 'start' }),
			after({ type: 'submit' }),
			after(issued()),
			after(issued(), accepted),
			after({ type: 'release' }),
		]) {
			expect(state.message).toBeUndefined();
			expect(state.retryAfter).toBeUndefined();
		}
		const code = run(issued('secondFactor'), refused({ message: 'Wrong.' }));
		expect(
			run(issued('secondFactor'), refused({ message: 'Wrong.' }), {
				type: 'submit',
			}).message,
		).toBeUndefined();
		expect(code.message).toBe('Wrong.');
	});
});
