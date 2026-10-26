import { describe, expect, test } from 'bun:test';
import { INITIAL_STEP_UP, type StepUpState, stepUpReducer } from './step-up';
import { stepUpProps } from './step-up-props';

describe('stepUpProps', () => {
	test('maps the initial state to the props with no optional key', () => {
		expect(stepUpProps(INITIAL_STEP_UP)).toStrictEqual({
			locked: false,
			pending: false,
			resent: false,
		});
	});

	test('maps each field of a refused code', () => {
		const code = stepUpReducer(
			stepUpReducer(INITIAL_STEP_UP, {
				type: 'requested',
				answer: {
					ok: true,
					intent: 'request-step-up',
					challenge: 'c1',
					via: 'secondFactor',
				},
			}),
			{
				type: 'confirmed',
				answer: {
					ok: false,
					intent: 'confirm-step-up',
					error: 'invalid',
					attemptsLeft: 2,
					locked: false,
				},
			},
		);
		expect(stepUpProps(code)).toStrictEqual({
			via: 'secondFactor',
			attemptsLeft: 2,
			locked: false,
			error: 'invalid',
			pending: false,
			resent: false,
		});
	});

	test('drops the phase and the challenge: the challenge is a secret', () => {
		const state: StepUpState = {
			...INITIAL_STEP_UP,
			phase: 'code',
			challenge: 'secret',
			via: 'email',
			pending: true,
			resent: true,
			locked: true,
			error: 'expired',
		};
		const props = stepUpProps(state);
		expect(props).toStrictEqual({
			via: 'email',
			locked: true,
			error: 'expired',
			pending: true,
			resent: true,
		});
		expect('challenge' in props).toBe(false);
		expect('phase' in props).toBe(false);
	});
});
