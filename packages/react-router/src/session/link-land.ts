import { data, replace } from 'react-router';
import type { FormErrors } from '../errors/form-errors';
import type { SignInAnswer } from './flow-types';
import { samesitePost } from './guard';
import { isLive } from './land';
import { stateRedirect, withTokenHeaders } from './link-token';
import type { AuthLinks, LinkStayed, LinksContext } from './link-types';
import { HOME, safeNext } from './model';

/** Where a new session starts: the app's start page, else `/`; never an unsafe path. */
async function startOf<L extends string>(
	{ start }: LinksContext<L>,
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
 * first: one browser holds one session. Only a JSON post goes on, before
 * anything is revoked or landed.
 */
export async function landByLink<L extends string>(
	options: LinksContext<L>,
	answer: SignInAnswer,
	{ request, language, other }: Parameters<AuthLinks<L>['landByLink']>[1],
): Promise<Response | LinkStayed> {
	samesitePost(options.json, request);
	if (answer.status === 'other' && other) {
		return stateRedirect(other.path, other.state);
	}
	// A dead session would be looked up with a token the API refuses.
	const next = isLive(answer)
		? await startOf(options, request, answer.token)
		: HOME;
	const landed = await options.signIn.landReplacing(answer, next, {
		request,
		revokeOn: ['signedIn', 'secondFactor'],
	});
	if (!landed) {
		return data<FormErrors>(
			{ formError: options.signIn.unavailable(language) },
			{ status: 503 },
		);
	}
	const location = landed.headers.get('Location') ?? HOME;
	return replace(location, { headers: withTokenHeaders(landed.headers) });
}

/**
 * After a password reset, which signs the account out everywhere: the
 * browser's session is revoked (it may be another account's) and its cookie
 * cleared, then the sign-in page says the password changed. Only a JSON post
 * goes on.
 */
export async function afterReset<L extends string>(
	options: LinksContext<L>,
	resetDone: string,
	request: Request,
): Promise<Response> {
	samesitePost(options.json, request);
	await options.signIn.revokeSession(request);
	return replace(resetDone, {
		headers: withTokenHeaders({ 'Set-Cookie': options.cookies.destroy() }),
	});
}
