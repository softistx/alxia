import { isApiErrorLike } from '../errors/api-error';
import type { SignInFlow } from './flow-types';
import type { StepUpRun } from './step-up-types';

/**
 * A signed-out user's failure. From `request`, the API's no-session code or a
 * bare 401 response; from `confirm`, the code only: a 401 there is also what a
 * wrong code answers, so a bare one stays a refusal.
 */
function isSignedOut(
	error: unknown,
	unauthenticated: string,
	from: 'request' | 'confirm',
): boolean {
	if (error instanceof Response)
		return from === 'request' && error.status === 401;
	return isApiErrorLike(error) && error.code === unauthenticated;
}

/**
 * The request the sign-in redirect comes back to: the same-site `Referer`'s
 * page (the step-up route has none of its own), else the request's own URL.
 * A `Referer` of another origin (port and protocol count), or one that is not
 * a URL, is ignored. Behind a TLS-terminating proxy an `http` `request.url`
 * never matches an `https` `Referer`, so `next` is the route's own path.
 */
export function cameFrom(request: Request): Request {
	const referer = request.headers.get('referer');
	if (referer) {
		try {
			const from = new URL(referer);
			if (from.origin === new URL(request.url).origin) {
				return new Request(from, { headers: request.headers });
			}
		} catch {
			// Not a URL: the request's own path.
		}
	}
	return request;
}

/**
 * Runs `route` over a `run` that notes a signed-out failure, then throws the
 * flow's sign-in redirect in place of whatever the step answered or threw.
 */
export async function signingOut<A>(
	{
		signIn,
		unauthenticated,
		run,
		request,
	}: {
		readonly signIn: Pick<SignInFlow<string, never>, 'signInRedirect'>;
		readonly unauthenticated: string;
		readonly run: StepUpRun;
		readonly request: Request;
	},
	route: (watched: StepUpRun) => Promise<A>,
): Promise<A> {
	let signedOut = false;
	const watched: StepUpRun = {
		request: async () => {
			try {
				return await run.request();
			} catch (error) {
				signedOut ||= isSignedOut(error, unauthenticated, 'request');
				throw error;
			}
		},
		confirm: async (input) => {
			try {
				return await run.confirm(input);
			} catch (error) {
				signedOut ||= isSignedOut(error, unauthenticated, 'confirm');
				throw error;
			}
		},
	};
	const redirect = () => signIn.signInRedirect(cameFrom(request));
	let answer: A;
	try {
		answer = await route(watched);
	} catch (error) {
		throw signedOut ? redirect() : error;
	}
	if (signedOut) throw redirect();
	return answer;
}
