import { data, replace } from 'react-router';
import type { FormErrors } from '../errors/form-errors';
import type { SignInAnswer } from './flow-types';
import type { AuthLinksOptions, LinkStayed } from './link-types';
import { HOME, safeNext } from './model';

/** Where a new session starts: the app's start page, else `/`; never an unsafe path. */
async function startOf<L extends string>(
	{ start }: AuthLinksOptions<L>,
	request: Request,
	token: string,
): Promise<string> {
	if (!start) return HOME;
	try {
		return safeNext(await start(token, request));
	} catch {
		// The token is spent: a failed lookup must not fail the sign-in.
		return HOME;
	}
}

/**
 * Where a link's sign-in leads, replacing the token's history entry. Signed
 * in: the start page, with the new session's cookie; a second factor: its
 * page. Either way the session the browser held, whoever's, is revoked
 * first: one browser holds one session.
 */
export async function landByLink<L extends string>(
	options: AuthLinksOptions<L>,
	answer: SignInAnswer,
	{ request, language }: { request: Request; language: L },
): Promise<Response | LinkStayed> {
	const next =
		answer.status === 'signedIn' && answer.token
			? await startOf(options, request, answer.token)
			: HOME;
	const landed = await options.signIn.landReplacing(answer, next, {
		request,
		revokeOn: ['signedIn', 'secondFactor'],
	});
	if (!landed) {
		return data<FormErrors>(
			{ formError: options.errors.unavailableMessage(language) },
			{ status: 503 },
		);
	}
	const location = landed.headers.get('Location') ?? HOME;
	return replace(location, { headers: landed.headers });
}

/**
 * After a password reset, which signs the account out everywhere: the
 * browser's session is revoked (it may be another account's) and its cookie
 * cleared, then the sign-in page says the password changed.
 */
export async function afterReset<L extends string>(
	options: AuthLinksOptions<L>,
	resetDone: string,
	request: Request,
): Promise<Response> {
	await options.signIn.revokeSession(request);
	return replace(resetDone, {
		headers: { 'Set-Cookie': options.cookies.destroy() },
	});
}
