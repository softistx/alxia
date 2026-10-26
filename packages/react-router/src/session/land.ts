import { redirect } from 'react-router';
import type { FlowContext, SignInAnswer, SignInFlow } from './flow-types';
import { samesitePost } from './guard';
import { safeNext, secondFactorPath } from './model';
import { millisOf } from './serialize';

/**
 * Ends the request's session at the API, when it carries one; a failure is
 * ignored, the caller clears the cookie anyway. True when there was one.
 */
export async function revokeSession<L extends string>(
	{ options }: FlowContext<L>,
	request: Request,
): Promise<boolean> {
	samesitePost(options.json, request);
	const token = options.cookies.token(request);
	if (!token) return false;
	try {
		await options.revoke(token, request);
	} catch {
		// The old session ends when it expires.
	}
	return true;
}

/** The condition a session opens on: a signed-in answer with a token and an end still to come. */
export const isLive = (
	answer: SignInAnswer,
): answer is Extract<SignInAnswer, { status: 'signedIn' }> =>
	answer.status === 'signedIn' &&
	Boolean(answer.token) &&
	Boolean(answer.expiresAt) &&
	millisOf(answer.expiresAt) > Date.now();

/**
 * Where a sign-in's answer leads: signed in, to `next` with the session
 * cookie (and the challenge cleared); a second factor, to its page with the
 * challenge in its own cookie, never in the URL. Any other answer, or a
 * signed-in one with no token or an end that is missing, unreadable or past,
 * opens no session: `null`, the caller shows its own state.
 */
export function landing<L extends string>(
	{ options, paths }: FlowContext<L>,
	answer: SignInAnswer,
	next: string,
): Response | null {
	const { cookies } = options;
	// A session with no readable or past end would be set and dead at once.
	if (isLive(answer)) {
		const headers = new Headers();
		headers.append(
			'Set-Cookie',
			cookies.commit(answer.token, answer.expiresAt),
		);
		headers.append('Set-Cookie', cookies.destroyChallenge());
		for (const cookie of options.clear?.() ?? []) {
			headers.append('Set-Cookie', cookie);
		}
		return redirect(safeNext(next), { headers });
	}
	if (answer.status === 'secondFactor' && answer.challenge) {
		return redirect(secondFactorPath(next, paths.secondFactor), {
			headers: {
				'Set-Cookie': cookies.commitChallenge(
					answer.challenge,
					answer.expiresAt,
				),
			},
		});
	}
	return null;
}

/**
 * `landing`, ending the session the browser held first: one browser holds
 * one session, so the one its cookie names, whoever's, is revoked when an
 * answer in `revokeOn` lands. A signed-in answer's own cookie replaces the
 * old one; any other answer clears it. A failed revoke is ignored.
 */
export async function landReplacing<L extends string>(
	context: FlowContext<L>,
	answer: SignInAnswer,
	next: string,
	{
		request,
		revokeOn = ['signedIn'],
	}: Parameters<SignInFlow<L>['landReplacing']>[2],
): Promise<Response | null> {
	samesitePost(context.options.json, request);
	const landed = landing(context, answer, next);
	if (!landed || answer.status === 'other') return landed;
	if (!revokeOn.includes(answer.status)) return landed;
	const hadSession = await revokeSession(context, request);
	if (hadSession && answer.status !== 'signedIn') {
		landed.headers.append('Set-Cookie', context.options.cookies.destroy());
	}
	return landed;
}
