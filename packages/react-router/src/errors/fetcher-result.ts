import { data } from 'react-router';
import { isApiErrorLike } from './api-error';
import type { ApiErrors, ApiRefusal } from './api-errors';
import { type RouteErrorOptions, routeError } from './route-error';

/**
 * A fetcher's refusal: the API's (`apiRefusal`), an unreachable API's too,
 * so the page stays where it was. A 401 (the session caller redirects
 * first) or any other failure is thrown, for the error page.
 */
export function fetcherRefusal<L extends string>(
	errors: Pick<ApiErrors<L>, 'apiRefusal'>,
	error: unknown,
	language: L,
	route?: RouteErrorOptions,
): ApiRefusal {
	const refusal =
		isApiErrorLike(error) && error.status === 401
			? undefined
			: errors.apiRefusal(error, language);
	if (!refusal) throw routeError(error, route);
	return refusal;
}

/** What `fetcherResult` takes after `run`: `routeError`'s options, and a rewording. */
export interface FetcherResultOptions extends RouteErrorOptions {
	/**
	 * Words the refusal of this call: given the caught API error, the message
	 * to answer, or `undefined` to keep the worded one. The status is the
	 * refusal's. Not called for what is thrown to the error page.
	 */
	reword?: (error: unknown) => string | undefined;
}

/**
 * Runs the mutation of an action a fetcher posted to: `{ ok: true }` with
 * `about` and the mutation's value, or the refusal (`fetcherRefusal`) as a
 * worded `error`, with its HTTP status, for a toast or a form message.
 */
export async function fetcherResult<
	L extends string,
	About extends object,
	Value extends object = Record<never, never>,
>(
	errors: Pick<ApiErrors<L>, 'apiRefusal'>,
	language: L,
	about: About,
	run: () => Promise<Value>,
	options?: FetcherResultOptions,
) {
	try {
		return { ok: true as const, ...about, ...(await run()) };
	} catch (error) {
		const { message, status } = fetcherRefusal(
			errors,
			error,
			language,
			options,
		);
		return data(
			{
				ok: false as const,
				...about,
				error: options?.reword?.(error) ?? message,
			},
			{ status },
		);
	}
}
