import { describe, expect, test } from 'bun:test';
import type { Lang } from '../../test/errors/format';
import { refusal } from '../../test/errors/refusal';
import { flowFor, jsonPost } from '../../test/session/flow';
import { errors } from '../../test/session/step-up';
import { type StepUpSignIn, stepUpSteps } from './index';

const run = {
	request: async () => ({ challenge: 'c1', via: 'email' as const }),
	confirm: async () => {},
};

/** A hand-written sign-in: only the members the step-up reads. */
function handWritten(): StepUpSignIn<Lang> {
	const { flow } = flowFor({
		errors,
		attemptsLeft: (count, language) => `${count} left (${language})`,
	});
	return {
		errors: flow.errors,
		json: flow.json,
		attemptsLeft: flow.attemptsLeft,
	};
}

describe('stepUpSteps with a hand-written sign-in', () => {
	test('accepts errors, json and attemptsLeft alone, no signInFlow', async () => {
		const steps = stepUpSteps<Lang>({
			signIn: handWritten(),
			spent: (language) => `ask again (${language})`,
		});
		const answer = await steps.route(run, {
			request: jsonPost('/step-up', { intent: 'request-step-up' }),
			language: 'en',
		});
		expect(answer).toMatchObject({ ok: true, intent: 'request-step-up' });
	});

	test("onSignedOut: 'sign-in' without signInRedirect throws at the call", () => {
		expect(() =>
			stepUpSteps<Lang>({
				signIn: handWritten(),
				spent: () => 'again',
				onSignedOut: 'sign-in',
			}),
		).toThrow(/signInRedirect/);
	});

	test("onSignedOut: 'sign-in' redirects through the given signInRedirect", async () => {
		const redirect = new Response(null, { status: 303 });
		const steps = stepUpSteps<Lang>({
			signIn: { ...handWritten(), signInRedirect: () => redirect },
			spent: () => 'again',
			onSignedOut: 'sign-in',
		});
		const thrown = await steps
			.route(
				{
					request: async () => {
						throw refusal('UNAUTHENTICATED', 'No session', {}, 401);
					},
					confirm: async () => {},
				},
				{
					request: jsonPost('/step-up', { intent: 'request-step-up' }),
					language: 'en',
				},
			)
			.catch((e: unknown) => e);
		expect(thrown).toBe(redirect);
	});
});
