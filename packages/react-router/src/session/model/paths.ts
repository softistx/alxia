import { HOME, safeNext } from './safe-next';

/** The two pages of a sign-in. */
export interface SignInPaths {
	readonly signIn: string;
	readonly secondFactor: string;
}

/** The defaults: `/sign-in` and `/sign-in/second-factor`. */
export const SIGN_IN_PATHS: SignInPaths = {
	signIn: '/sign-in',
	secondFactor: '/sign-in/second-factor',
};

function withNext(
	path: string,
	next: string,
	query?: Record<string, string>,
): string {
	const params = new URLSearchParams(query);
	const target = safeNext(next);
	if (target !== HOME) params.set('next', target);
	const search = params.toString();
	return search ? `${path}?${search}` : path;
}

/**
 * The sign-in page's URL, coming back to `next` (none for the home page, and
 * `next` goes through `safeNext`). `query` adds parameters, such as
 * `{ expired: '1' }`; `path` replaces `/sign-in`.
 *
 * @example
 * signInPath('/orders'); // '/sign-in?next=%2Forders'
 * signInPath('/', { query: { expired: '1' } }); // '/sign-in?expired=1'
 */
export function signInPath(
	next: string,
	options: {
		readonly query?: Record<string, string>;
		readonly path?: string;
	} = {},
): string {
	return withNext(options.path ?? SIGN_IN_PATHS.signIn, next, options.query);
}

/** The second-factor page's URL, coming back to `next` as `signInPath` does. */
export function secondFactorPath(
	next: string,
	path: string = SIGN_IN_PATHS.secondFactor,
): string {
	return withNext(path, next);
}
