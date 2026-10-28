import { hasSiteCheck } from '../errors/same-site';
import { CHALLENGE_OVER, INVALID_CODE } from './codes';
import type {
	FlowContext,
	SignInFlow,
	SignInFlowBase,
	SignInFlowOptions,
	SignInFlowWithoutSecondFactorOptions,
} from './flow-types';
import { samesitePost } from './guard';
import { landing, landReplacing, revokeSession } from './land';
import { SIGN_IN_PATHS, type SignInPaths } from './model';
import { sitePath } from './model/site-path';
import { codeStep, readCodeInput } from './second-factor';
import { codeRefusal, signInStep, unavailableMessage } from './step';
import {
	nextParam,
	requireViewer,
	signInRedirect,
	signOut,
	viewer,
} from './viewer';

function resolve<L extends string, C>(
	options: SignInFlowOptions<L, C> | SignInFlowWithoutSecondFactorOptions<L, C>,
): FlowContext<L, C> {
	if (
		(options.attemptsLeft === undefined) !==
		!('commitChallenge' in options.cookies)
	) {
		throw new TypeError(
			'signInFlow(): a second factor needs both the challenge cookie (sessionCookies({ challenge })) and attemptsLeft; without one, give neither.',
		);
	}
	const paths: SignInPaths = { ...SIGN_IN_PATHS, ...options.paths };
	for (const key of ['signIn', 'secondFactor'] as const) {
		sitePath(paths[key], { label: `signInFlow(): paths.${key}` });
	}
	if (!hasSiteCheck(options.json)) {
		throw new TypeError(
			"signInFlow(): json must come from jsonActions(), which carries the site check every step runs; this object has none (a hand-made double?). Pass the app's jsonActions({ origin }) instance, or a spread copy of it.",
		);
	}
	const invalidCode = options.codes?.invalidCode ?? INVALID_CODE;
	const challengeOver = options.codes?.challengeOver ?? CHALLENGE_OVER;
	if (challengeOver.includes(invalidCode)) {
		throw new TypeError(
			`signInFlow(): the code ${JSON.stringify(invalidCode)} is both the wrong-code code (codes.invalidCode) and in codes.challengeOver. A wrong code that leaves tries cannot end the challenge.`,
		);
	}
	return { options, paths, invalidCode, challengeOver };
}

/**
 * The server side of a BFF's sign-in, over the cookies, the app's
 * `createApiErrors` and its `jsonActions`: where an answer lands, the form
 * steps with their refusals, the second factor, the viewer and sign-out.
 * Built once, beside the app's cookies; it speaks `@nxgt/janus`'s words
 * (`signedIn`, `secondFactor`, `CODE_INVALID`) and the app maps its API's.
 *
 * @example
 * export const signIn = signInFlow({
 * 	cookies, errors, json,
 * 	revoke: (token, request, caller?: Caller) =>
 * 		execute(SignOutMutation, {}, { token, ...caller }),
 * 	attemptsLeft: (count, language) => t('auth.attempts-left', { count }, language),
 * });
 */
export function signInFlow<L extends string, C = undefined>(
	options: SignInFlowOptions<L, C>,
): SignInFlow<L, C, true>;
export function signInFlow<L extends string, C = undefined>(
	options: SignInFlowWithoutSecondFactorOptions<L, C>,
): SignInFlow<L, C, false>;
export function signInFlow<L extends string, C = undefined>(
	options: SignInFlowOptions<L, C> | SignInFlowWithoutSecondFactorOptions<L, C>,
): SignInFlow<L, C, boolean> {
	const context = resolve(options);
	const { options: o } = context;
	const base: SignInFlowBase<L, C, boolean> = {
		cookies: o.cookies,
		errors: o.errors,
		json: o.json,
		unavailable: (language) => unavailableMessage(o, language),
		clear: () => o.clear?.() ?? [],
		guard: (request) => samesitePost(o.json, request),
		nextParam,
		signInRedirect: (request) => signInRedirect(context, request),
		landing: (answer, next) => landing(context, answer, next),
		landReplacing: (answer, next, o) => landReplacing(context, answer, next, o),
		signInStep: (run, o) => signInStep(context, run, o),
		revokeSession: (request, o) => revokeSession(context, request, o),
		signOut: (request, o) => signOut(context, request, o),
		viewer: (request, read, token) => viewer(context, request, read, token),
		requireViewer: (request, read, expiresAt) =>
			requireViewer(context, request, read, expiresAt),
	};
	if (!o.attemptsLeft) return base as SignInFlow<L, C, false>;
	const wording = { ...context, options: o };
	return {
		...base,
		attemptsLeft: o.attemptsLeft,
		codeRefusal: (error, language, whenNone) =>
			codeRefusal(wording, error, language, whenNone),
		readCodeInput: (request) => readCodeInput(context, request),
		codeStep,
	} as SignInFlow<L, C, true>;
}
