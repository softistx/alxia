import { describe, expect, test } from 'bun:test';
import { flowFor, jsonPost } from '../../test/session/flow';
import { jsonActions } from '../errors';
import {
	type AuthLinksOptions,
	authLinks,
	type SessionCookiesOptions,
	type SignInAnswer,
	type SignInFlowOptions,
	type SpendOptions,
	type StepUpStepsOptions,
	serializeCookie,
	sessionCookies,
	signInFlow,
	stepUpSteps,
} from './index';
import { signInPath } from './model';

// Under `exactOptionalPropertyTypes`, an optional property written `?: T`
// refuses `undefined`: an app that spreads an optional value of its own would
// not compile. `tsc` checks each assignment below (the package's `typecheck`
// runs over the specs); the tests only prove the calls still run.
describe('optional inputs accept undefined', () => {
	test('the answers an app builds', () => {
		const answer: SignInAnswer = {
			status: 'secondFactor',
			challenge: 'c',
			expiresAt: undefined,
		};
		expect(answer.status).toBe('secondFactor');
	});

	test('the cookies’ options and serializeCookie’s', () => {
		const options: SessionCookiesOptions = {
			session: 'my-app_session',
			challenge: 'my-app_challenge',
			secure: false,
			challengePath: undefined,
			challengeSeconds: undefined,
		};
		expect(sessionCookies(options).names.session).toBe('my-app_session');
		expect(
			serializeCookie('a', 'b', { maxAge: 1, secure: false, path: undefined }),
		).toContain('a=b');
	});

	test('signInFlow’s options, and its per-call options', async () => {
		const { cookies } = flowFor();
		const options: SignInFlowOptions<'en'> = {
			cookies,
			errors: flowFor().flow.errors as SignInFlowOptions<'en'>['errors'],
			json: jsonActions(),
			revoke: async () => undefined,
			attemptsLeft: (count) => `${count}`,
			paths: undefined,
			clear: undefined,
			unavailable: undefined,
			codes: { invalidCode: undefined, challengeOver: undefined },
			endedParam: undefined,
		};
		const flow = signInFlow(options);
		const request = jsonPost('/sign-in');
		const answer: SignInAnswer = { status: 'other' };
		expect(
			await flow.landReplacing(answer, '/', { request, revokeOn: undefined }),
		).toBeNull();
		const stayed = await flow.signInStep(async () => answer, {
			request,
			language: 'en',
			next: '/',
			extra: {},
			refused: undefined,
		});
		expect(stayed).toBeDefined();
		expect((await flow.signOut(request, { to: undefined })).status).toBe(302);
	});

	test('stepUpSteps’ options, and confirm’s via', async () => {
		const options: StepUpStepsOptions<'en'> = {
			signIn: flowFor().flow as StepUpStepsOptions<'en'>['signIn'],
			spent: () => 'again',
			locked: undefined,
			wording: undefined,
			codes: {
				invalidCode: undefined,
				challengeOver: undefined,
				stepUpRequired: undefined,
				mailThrottled: undefined,
			},
		};
		const steps = stepUpSteps(options);
		const answer = await steps.confirm(async () => true, {
			request: jsonPost(),
			language: 'en',
			via: undefined,
		});
		expect(answer).toEqual({ ok: true, intent: 'confirm-step-up' });
	});

	test('authLinks’ options, and the per-call options', async () => {
		const { flow } = flowFor();
		const options: AuthLinksOptions<'en'> = {
			signIn: flow as AuthLinksOptions<'en'>['signIn'],
			codes: undefined,
			wording: undefined,
			start: undefined,
			resetDone: undefined,
			invalidState: undefined,
		};
		const links = authLinks(options);
		const spend: SpendOptions<'en'> = {
			request: jsonPost(),
			language: 'en',
			path: '/auth/magic-link',
			states: {},
			fields: undefined,
		};
		expect((await links.spendToken(async () => 1, spend)).ok).toBe(true);
		const landed = await links.landByLink(
			{ status: 'other' },
			{ request: jsonPost(), language: 'en', other: undefined },
		);
		expect(landed).toBeDefined();
	});

	test('signInPath’s options', () => {
		expect(signInPath('/', { path: undefined, query: undefined })).toBe(
			'/sign-in',
		);
	});
});
