import { data } from 'react-router';
import { isApiErrorLike, retryAfterOf } from '../errors/api-error';
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
async function requestLink<L extends string>(
	options: LinksContext<L>,
	run: () => Promise<unknown>,
	{ request, language }: Parameters<AuthLinks<L>['requestLink']>[1],
) {
	const { errors } = options;
	samesitePost(options.json, request);
	try {
		await run();
		return data<RequestLinkAnswer>({ sent: true });
	} catch (error) {
		if (isApiErrorLike(error)) {
			if (error.code === (options.codes?.mailThrottled ?? MAIL_THROTTLED)) {
				const formError =
					options.wording?.(error, language) ??
					errors.apiErrorMessage(error, language);
				const retryAfter = retryAfterOf(error);
				return data<RequestLinkAnswer>(
					{ formError, ...(retryAfter === undefined ? {} : { retryAfter }) },
					{ status: 429 },
				);
			}
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
			{ formError: refusal.message },
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
export function authLinks<L extends string>(
	links: AuthLinksOptions<L>,
): AuthLinks<L> {
	const { signIn } = links;
	const options: LinksContext<L> = {
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
		afterReset: (request) => afterReset(options, resetDone, request),
		requestLink: (run, o) => requestLink(options, run, o),
	};
}
