import { describe, expect, test } from 'bun:test';
import { refusal } from '../../test/errors/refusal';
import { steps } from '../../test/session/step-up';

describe('isStepUpRequired', () => {
	test('is the API asking for a step-up first', () => {
		const { isStepUpRequired } = steps();
		expect(
			isStepUpRequired(refusal('STEP_UP_REQUIRED', 'Forbidden', {}, 403)),
		).toBe(true);
		expect(isStepUpRequired(refusal('CODE_INVALID', 'Wrong'))).toBe(false);
		expect(isStepUpRequired(new Error('STEP_UP_REQUIRED'))).toBe(false);
		expect(isStepUpRequired(undefined)).toBe(false);
	});

	test('codes.stepUpRequired names the app’s code', () => {
		const { isStepUpRequired } = steps({
			codes: { stepUpRequired: 'auth.errors.step-up-required' },
		});
		expect(isStepUpRequired(refusal('auth.errors.step-up-required', 'x'))).toBe(
			true,
		);
		expect(isStepUpRequired(refusal('STEP_UP_REQUIRED', 'x'))).toBe(false);
	});
});

describe('stepUpSteps()', () => {
	test('refuses a wrong-code code that also ends the challenge', () => {
		expect(() =>
			steps({
				codes: { invalidCode: 'TOKEN_SPENT', challengeOver: ['TOKEN_SPENT'] },
			}),
		).toThrow(
			new TypeError(
				'stepUpSteps(): the code "TOKEN_SPENT" is both the wrong-code code (codes.invalidCode) and in codes.challengeOver. A wrong code that leaves tries cannot end the challenge.',
			),
		);
	});
});
