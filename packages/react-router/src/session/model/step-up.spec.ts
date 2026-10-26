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
const refusedRequest: StepUpAction = {
	type: 'requested',
	answer: { ok: false, intent: 'request-step-up', error: 'failed' },
};
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

describe('stepUpReducer', () => {
	test('starts idle; a request in flight is requesting, a challenge granted the code phase', () => {
		expect(INITIAL_STEP_UP.phase).toBe('idle');
		const asking = run({ type: 'start' });
		expect(asking.phase).toBe('requesting');
		expect(asking.pending).toBe(true);
		const state = run({ type: 'start' }, issued());
		expect(state.phase).toBe('code');
		expect(state).toMatchObject({
			via: 'email',
			challenge: 'c1',
			pending: false,
			locked: false,
			resent: false,
		});
	});

	test('a request refused before any challenge is idle, with its error', () => {
		const state = run({ type: 'start' }, refusedRequest);
		expect(state.phase).toBe('idle');
		expect(state.error).toBe('failed');
		expect(state.pending).toBe(false);
	});

	test('a resend refused keeps the code form and the challenge, and says why', () => {
		const state = run(issued(), { type: 'start' }, refusedRequest);
		expect(state.phase).toBe('code');
		expect(state.error).toBe('failed');
		expect(state.challenge).toBe('c1');
	});

	test('a resend in flight keeps the code form', () => {
		const state = run(issued(), { type: 'start' });
		expect(state.phase).toBe('code');
		expect(state.pending).toBe(true);
	});

	test('a new challenge replaces the held one, marks resent and clears the error', () => {
		const state = run(
			issued(),
			refused({ attemptsLeft: 3 }),
			{ type: 'start' },
			issued('email', 'c2'),
		);
		expect(state.challenge).toBe('c2');
		expect(state.resent).toBe(true);
		expect(state.error).toBeUndefined();
		expect(state.attemptsLeft).toBeUndefined();
	});

	test('a challenge asked again after an expiry is not a resend', () => {
		const state = run(
			issued(),
			refused({ error: 'expired' }),
			{ type: 'start' },
			issued('email', 'c2'),
		);
		expect(state.resent).toBe(false);
	});

	test("a wrong code is the field's: the code phase, the error and the tries left", () => {
		const state = run(
			issued('secondFactor'),
			{ type: 'submit' },
			refused({ attemptsLeft: 3 }),
		);
		expect(state.phase).toBe('code');
		expect(state).toMatchObject({
			error: 'invalid',
			attemptsLeft: 3,
			locked: false,
			pending: false,
			challenge: 'c1',
		});
	});

	test('submitting is confirming and forgets the error', () => {
		const state = run(issued(), refused(), { type: 'submit' });
		expect(state.phase).toBe('confirming');
		expect(state.pending).toBe(true);
		expect(state.error).toBeUndefined();
	});

	test('a code accepted spends the challenge: done', () => {
		const state = run(issued(), { type: 'submit' }, accepted);
		expect(state.phase).toBe('done');
		expect(state.challenge).toBeUndefined();
		expect(state.pending).toBe(false);
		expect(state.error).toBeUndefined();
	});

	test('an expired or spent challenge is idle with error expired, its via kept', () => {
		const state = run(issued('secondFactor'), refused({ error: 'expired' }));
		expect(state.phase).toBe('idle');
		expect(state.error).toBe('expired');
		expect(state.via).toBe('secondFactor');
		expect(state.challenge).toBeUndefined();
	});

	test('ask again leaves the expiry; release forgets everything', () => {
		const expired = run(issued(), refused({ error: 'expired' }));
		const again = stepUpReducer(expired, { type: 'start' });
		expect(again.phase).toBe('requesting');
		expect(again.error).toBeUndefined();
		expect(stepUpReducer(expired, { type: 'release' })).toEqual(
			INITIAL_STEP_UP,
		);
	});

	describe('no try left (the Q5 rule)', () => {
		test('a mailed code is expired: ask again', () => {
			const state = run(issued('email'), refused({ attemptsLeft: 0 }));
			expect(state.phase).toBe('idle');
			expect(state.error).toBe('expired');
			expect(state.locked).toBe(false);
			expect(state.challenge).toBeUndefined();
		});

		test('an app or recovery code is locked: wait', () => {
			const state = run(issued('secondFactor'), refused({ attemptsLeft: 0 }));
			expect(state.phase).toBe('code');
			expect(state).toMatchObject({
				error: 'invalid',
				attemptsLeft: 0,
				locked: true,
				challenge: 'c1',
			});
		});

		test('the server saying locked is locked, with tries left or not', () => {
			const state = run(issued('secondFactor'), refused({ locked: true }));
			expect(state.locked).toBe(true);
		});

		test('a mailed code with tries left stays open', () => {
			const state = run(issued('email'), refused({ attemptsLeft: 1 }));
			expect(state.phase).toBe('code');
			expect(state.locked).toBe(false);
		});
	});

	test('does not mutate the state it is given', () => {
		const before = run(issued());
		const copy = structuredClone(before);
		stepUpReducer(before, refused({ attemptsLeft: 0 }));
		expect(before).toEqual(copy);
	});

	test('a throttled code keeps the challenge, the tries and the form, and holds retryAfter', () => {
		const state = run(
			issued('secondFactor'),
			refused({ attemptsLeft: 2 }),
			{ type: 'submit' },
			refused({ error: 'throttled', retryAfter: 20, message: 'Slow down' }),
		);
		expect(state).toMatchObject({
			phase: 'code',
			challenge: 'c1',
			attemptsLeft: 2,
			locked: false,
			error: 'throttled',
			retryAfter: 20,
			message: 'Slow down',
			pending: false,
		});
	});

	test('a refused code with no retryAfter clears an earlier one', () => {
		const state = run(
			issued(),
			refused({ error: 'throttled', retryAfter: 20 }),
			refused({ attemptsLeft: 1 }),
		);
		expect(state.retryAfter).toBeUndefined();
	});
});
