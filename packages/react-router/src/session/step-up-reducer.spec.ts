import { describe, expect, test } from 'bun:test';
import type { Lang } from '../../test/errors/format';
import { filledMessages, refusal } from '../../test/errors/refusal';
import { createApiErrors } from '../errors';
import {
	INITIAL_STEP_UP,
	type StepUpConfirmAnswer,
	type StepUpRequestAnswer,
	type StepUpState,
	stepUpProps,
	stepUpReducer,
} from './model';
import { stepUpSteps } from './step-up';

// The answers the server steps give, taken as they are by the page's reducer
// (what a fetcher's `data` holds: `data()` carries it in `.data`).
const steps = stepUpSteps<Lang>({
	errors: createApiErrors<Lang>({
		messages: filledMessages(),
		unavailable: () => 'down',
	}),
	attemptsLeft: (count) => `${count} left`,
	spent: () => 'ask again',
	locked: () => 'wait',
});

const plain = <T>(answer: T | { data: T }): T =>
	answer && typeof answer === 'object' && 'data' in answer
		? (answer.data as T)
		: (answer as T);

async function held(via: 'email' | 'secondFactor'): Promise<StepUpState> {
	const answer = plain<StepUpRequestAnswer>(
		await steps.request(async () => ({ challenge: 'c1', via }), 'en'),
	);
	return [
		{ type: 'start' } as const,
		{ type: 'requested', answer } as const,
	].reduce(stepUpReducer, INITIAL_STEP_UP);
}

async function refuse(state: StepUpState, attemptsLeft: number) {
	const answer = plain<StepUpConfirmAnswer>(
		await steps.confirm(
			() =>
				Promise.reject(refusal('CODE_INVALID', 'Wrong code', { attemptsLeft })),
			state.via ? { via: state.via } : {},
			'en',
		),
	);
	return stepUpReducer(stepUpReducer(state, { type: 'submit' }), {
		type: 'confirmed',
		answer,
	});
}

describe('the step-up answers through stepUpReducer and stepUpProps', () => {
	test('a granted request shows the code form, never the challenge in the props', async () => {
		const state = await held('email');
		expect(state).toMatchObject({
			phase: 'code',
			via: 'email',
			challenge: 'c1',
		});
		expect(stepUpProps(state)).toEqual({
			via: 'email',
			locked: false,
			pending: false,
			resent: false,
		});
	});

	test('a wrong code with tries left keeps the form up with the count', async () => {
		const state = await refuse(await held('secondFactor'), 2);
		expect(state.phase).toBe('code');
		expect(stepUpProps(state)).toEqual({
			via: 'secondFactor',
			attemptsLeft: 2,
			locked: false,
			error: 'invalid',
			pending: false,
			resent: false,
		});
	});

	test('0 tries left on a mailed code: expired, ask again (not locked)', async () => {
		const state = await refuse(await held('email'), 0);
		expect(state.phase).toBe('idle');
		expect(stepUpProps(state)).toMatchObject({
			via: 'email',
			error: 'expired',
			locked: false,
		});
	});

	test('0 tries left on an app or recovery code: locked, the form stays', async () => {
		const state = await refuse(await held('secondFactor'), 0);
		expect(state.phase).toBe('code');
		expect(stepUpProps(state)).toMatchObject({
			via: 'secondFactor',
			attemptsLeft: 0,
			error: 'invalid',
			locked: true,
		});
	});

	test('a refused request is failed, a code accepted is done', async () => {
		const failed = plain<StepUpRequestAnswer>(
			await steps.request(
				() => Promise.reject(new Response('', { status: 503 })),
				'en',
			),
		);
		const idle = [
			{ type: 'start' } as const,
			{ type: 'requested', answer: failed } as const,
		].reduce(stepUpReducer, INITIAL_STEP_UP);
		expect(stepUpProps(idle)).toMatchObject({ error: 'failed' });

		const state = await held('email');
		const ok = plain<StepUpConfirmAnswer>(
			await steps.confirm(async () => true, { via: 'email' }, 'en'),
		);
		expect(stepUpReducer(state, { type: 'confirmed', answer: ok }).phase).toBe(
			'done',
		);
	});
});
