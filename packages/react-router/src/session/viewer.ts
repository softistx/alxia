import { redirect } from 'react-router';
import { isApiErrorLike } from '../errors/api-error';
import { nextOf } from '../errors/page-path';
import { routeError } from '../errors/route-error';
import type { FlowContext } from './flow-types';
import { revokeSession } from './land';
import { safeNext, signInPath } from './model';

/** The `next` a sign-in page was opened with, safe to redirect to. */
export const nextParam = (request: Request): string =>
	safeNext(new URL(request.url).searchParams.get('next'));

/**
 * The sign-in page, coming back to this request's page afterwards, with the
 * session cookie cleared: what a page answers without a (live) session. A
 * request that carried a session cookie says it ended when `endedParam` is
 * set.
 */
export function signInRedirect<L extends string>(
	{ options, paths }: FlowContext<L>,
	request: Request,
): Response {
	const { endedParam, cookies } = options;
	const query =
		endedParam && cookies.read(request) ? { [endedParam]: '1' } : undefined;
	return redirect(
		signInPath(nextOf(request.url), {
			path: paths.signIn,
			...(query && { query }),
		}),
		{ headers: { 'Set-Cookie': cookies.destroy() } },
	);
}

/**
 * For the sign-in pages: the viewer when the cookie holds a live session,
 * `null` when the API refuses it (a 401), `undefined` without a cookie or
 * when the API cannot tell.
 */
export async function viewer<L extends string, V>(
	{ options }: FlowContext<L>,
	request: Request,
	read: (token: string) => Promise<V | null>,
	token: string | null | undefined = options.cookies.token(request),
): Promise<V | null | undefined> {
	if (!token) return undefined;
	try {
		return await read(token);
	} catch (error) {
		return isApiErrorLike(error) && error.status === 401 ? null : undefined;
	}
}

/**
 * The signed-in viewer, else the sign-in redirect. Its `headers` move the
 * cookie's expiry to the session's when the API moved it.
 */
export async function requireViewer<L extends string, V>(
	context: FlowContext<L>,
	request: Request,
	read: (token: string) => Promise<V | null>,
	expiresAt: (viewer: V) => string | null,
): Promise<{ viewer: V; headers: HeadersInit }> {
	const session = context.options.cookies.read(request);
	if (!session) throw signInRedirect(context, request);
	let found: V | null;
	try {
		found = await read(session.token);
	} catch (error) {
		if (isApiErrorLike(error) && error.status === 401) {
			throw signInRedirect(context, request);
		}
		throw routeError(error);
	}
	if (!found) throw signInRedirect(context, request);
	return {
		viewer: found,
		headers: context.options.cookies.refreshed(session, expiresAt(found)),
	};
}

/**
 * Ends the session and goes to the sign-in page (`?signed-out=1`), or to
 * `to`. The body is read as JSON first: JSON and same-origin only, so
 * another site cannot sign the user out.
 */
export async function signOut<L extends string>(
	context: FlowContext<L>,
	request: Request,
	{ to }: { readonly to?: string | undefined } = {},
): Promise<Response> {
	const { options, paths } = context;
	await options.json.readJson(request);
	await revokeSession(context, request);
	const headers = new Headers();
	headers.append('Set-Cookie', options.cookies.destroy());
	headers.append('Set-Cookie', options.cookies.destroyChallenge());
	for (const cookie of options.clear?.() ?? []) {
		headers.append('Set-Cookie', cookie);
	}
	return redirect(
		to === undefined ? `${paths.signIn}?signed-out=1` : safeNext(to),
		{ headers },
	);
}
