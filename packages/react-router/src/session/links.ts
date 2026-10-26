import { data } from 'react-router';
import {
	type ApiErrorLike,
	isApiErrorLike,
	retryAfterOf,
} from '../errors/api-error';
import { MAIL_THROTTLED } from './codes';
import { samesitePost } from './guard';
import { afterReset, landByLink } from './link-land';
import {
	answerOf,
	linkArgs,
	spendToken,
	statePath,
	stateRedirect,
} from './link-token';
import type {
	AuthLinks,
	AuthLinksOptions,
	LinksContext,
	RequestLinkAnswer,
} from './link-types';
import { sitePath } from './model/site-path';

const RESET_DONE = '/sign-in?password-reset=1';

/**
 * Requests a mail's link with `run`. The API answers true whether or not
 * the e-mail holds an account, and so does the page: the same "sent" for
 * everyone. A wait or an unreachable API is the form's message; a malformed
 * address is the `email` field's.
 */
/** The refusal's message: the app's own wording, else `errors`'. */
const worded = <L extends string, C>(
	{ wording, errors }: LinksContext<L, C>,
	error: ApiErrorLike,
	language: L,
): string =>
	wording?.(error, language) ?? errors.apiErrorMessage(error, language);

async function requestLink<L extends string, C>(
	options: LinksContext<L, C>,
	run: () => Promise<unknown>,
	{ request, language }: Parameters<AuthLinks<L, C>['requestLink']>[1],
) {
	const { errors } = options;
	samesitePost(options.json, request);
	try {
		await run();
		return data<RequestLinkAnswer>({ sent: true });
	} catch (error) {
		const api = isApiErrorLike(error);
		if (
			api &&
			error.code === (options.codes?.mailThrottled ?? MAIL_THROTTLED)
		) {
			const retryAfter = retryAfterOf(error);
			return data<RequestLinkAnswer>(
				{
					formError: worded(options, error, language),
					throttled: true,
					...(retryAfter === undefined ? {} : { retryAfter }),
				},
				{ status: 429 },
			);
		}
		if (api) {
			const email = errors.fieldErrors(error, language)['email'];
			if (email) {
				return data<RequestLinkAnswer>(
					{ fieldErrors: { email } },
					{ status: error.status },
				);
			}
		}
		const refusal = errors.apiRefusal(error, language);
		if (!refusal) throw error;
		return data<RequestLinkAnswer>(
			{ formError: api ? worded(options, error, language) : refusal.message },
			{ status: refusal.status },
		);
	}
}

/**
 * The pages a mail's link opens (a magic link, a password reset, an
 * invitation): the token page's end states, the arguments it posts, the
 * token spent against the API, the sign-in it leads to (replacing the
 * token's history entry), and the request for a link. Built once, beside the
 * app's `signInFlow`.
 *
 * @example
 * export const links = authLinks({ signIn });
 * // loader: return data({ ... }, { headers: TOKEN_PAGE_HEADERS });
 */
export function authLinks<L extends string, C = undefined>(
	links: AuthLinksOptions<L, C>,
): AuthLinks<L, C> {
	const { signIn } = links;
	const options: LinksContext<L, C> = {
		...links,
		cookies: signIn.cookies,
		errors: signIn.errors,
		json: signIn.json,
	};
	const resetDone = options.resetDone ?? RESET_DONE;
	sitePath(resetDone, { label: 'authLinks(): resetDone', query: true });
	const invalid = options.invalidState ?? 'invalid';
	return {
		statePath,
		ended: stateRedirect,
		linkArgs: (schema, request, path) =>
			linkArgs(options, invalid, schema, request, path),
		spendToken: (run, o) => spendToken(options, run, o),
		answerOf,
		landByLink: (answer, o) => landByLink(options, answer, o),
		afterReset: (request, o) => afterReset(options, resetDone, request, o),
		requestLink: (run, o) => requestLink(options, run, o),
	};
}
