import { CHALLENGE_OVER, INVALID_CODE } from './codes';
import type { FlowContext, SignInFlow, SignInFlowOptions } from './flow-types';
import { landing, landReplacing, revokeSession } from './land';
import { SIGN_IN_PATHS, type SignInPaths, safeNext } from './model';
import { codeStep, readCodeInput } from './second-factor';
import { codeRefusal, signInStep, unavailableMessage } from './step';
import {
	nextParam,
	requireViewer,
	signInRedirect,
	signOut,
	viewer,
} from './viewer';

function resolve<L extends string>(
	options: SignInFlowOptions<L>,
): FlowContext<L> {
	const paths: SignInPaths = { ...SIGN_IN_PATHS, ...options.paths };
	for (const key of ['signIn', 'secondFactor'] as const) {
		const path = paths[key];
		if (safeNext(path) !== path || /[?#]/.test(path)) {
			throw new TypeError(
				`signInFlow(): paths.${key} must be a path of this site with no query or fragment, starting with a single "/"; got ${JSON.stringify(path)}.`,
			);
		}
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
 * 	revoke: (token, request) => execute(SignOutMutation, {}, { token }),
 * 	attemptsLeft: (count, language) => t('auth.attempts-left', { count }, language),
 * });
 */
export function signInFlow<L extends string>(
	options: SignInFlowOptions<L>,
): SignInFlow<L> {
	const context = resolve(options);
	const { options: o } = context;
	return {
		cookies: o.cookies,
		errors: o.errors,
		json: o.json,
		unavailable: (language) => unavailableMessage(o, language),
		clear: () => o.clear?.() ?? [],
		nextParam,
		signInRedirect: (request) => signInRedirect(context, request),
		landing: (answer, next) => landing(context, answer, next),
		landReplacing: (answer, next, o) => landReplacing(context, answer, next, o),
		signInStep: (run, o) => signInStep(context, run, o),
		codeRefusal: (error, language, whenNone) =>
			codeRefusal(context, error, language, whenNone),
		readCodeInput: (request) => readCodeInput(context, request),
		codeStep,
		revokeSession: (request) => revokeSession(context, request),
		signOut: (request, o) => signOut(context, request, o),
		viewer: (request, read, token) => viewer(context, request, read, token),
		requireViewer: (request, read, expiresAt) =>
			requireViewer(context, request, read, expiresAt),
	};
}
