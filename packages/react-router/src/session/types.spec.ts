import { describe, expect, test } from 'bun:test';
import { jsonPost } from '../../test/session/flow';
import { linksFor } from '../../test/session/links';
import { steps } from '../../test/session/step-up';
import { INITIAL_STEP_UP, stepUpReducer } from './model';

// The refused cases of the factories, checked by `tsc` (the package's
// `typecheck` runs over the specs): each `@ts-expect-error` fails the build
// the day the line stops being an error.
describe('what the types refuse', () => {
	test('stepUpSteps: a way of confirming that janus does not have', async () => {
		const answer = await steps().confirm(async () => true, {
			request: jsonPost(),
			language: 'en',
			// @ts-expect-error 'sms' is not 'email' | 'secondFactor'
			via: 'sms',
		});
		expect(answer).toBeDefined();
	});

	test('authLinks: answerOf takes a refusal, not an ok Spent', () => {
		const { links } = linksFor();
		const ok = { ok: true, value: 1 } as const;
		// @ts-expect-error an ok Spent has nothing to answer
		const run = () => links.answerOf(ok);
		expect(run).toBeFunction();
	});

	test('stepUpReducer: an action of an unknown type', () => {
		// @ts-expect-error 'reset' is not one of the reducer's actions
		const run = () => stepUpReducer(INITIAL_STEP_UP, { type: 'reset' });
		expect(run).toBeFunction();
	});
});
