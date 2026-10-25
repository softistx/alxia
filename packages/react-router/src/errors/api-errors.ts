import type { data } from 'react-router';
import type { ApiErrorLike } from './api-error';
import { describeApiErrors } from './describe';
import type { FormErrors } from './form-errors';
import type { ApiMessages } from './messages';

/** A refused call, as a page says it: the message, and the HTTP status to answer. */
export type ApiRefusal = { message: string; status: number };

export interface ApiErrorsOptions<L extends string> {
	/** The catalogue the API's codes are worded from. */
	messages: ApiMessages<L>;
	/**
	 * The app's own word for an API it cannot reach (a 503 `Response`): not
	 * an API error, so never one of the catalogue's codes.
	 */
	unavailable(language: L): string;
	/**
	 * The app's generic refusal, said for an error with no API code (a raw
	 * `BAD_USER_INPUT` before the API's validation layer), never the raw
	 * message. Without it, such an error says the message the API sent.
	 */
	refused?(language: L): string;
	/**
	 * An app's own wording for given codes, such as the API's request limits
	 * (depth, cost, introspection), whose params differ and name no field.
	 * Checked after `refused`, before the catalogue.
	 */
	byCode?: Readonly<
		Record<string, (error: ApiErrorLike, language: L) => string>
	>;
	/** Whether a code is an API code; `<module>.errors.<slug>` by default. */
	isApiCode?(code: string): boolean;
}

/** What a page says of an API's refusals, in a language. */
export interface ApiErrors<L extends string> {
	/**
	 * The catalogue's text of an API code in `language`, else `fallback` (the
	 * message the API already worded). `values` are the message's arguments
	 * (`extensions.params`).
	 */
	translateCode(
		code: string | undefined,
		fallback: string,
		language: L,
		values?: Readonly<Record<string, unknown>>,
	): string;
	/**
	 * What to show for an API error: `refused` for an error with no API code,
	 * when given; else `byCode`'s wording of its code; else the catalogue's
	 * text; else the message the API already worded.
	 */
	apiErrorMessage(error: ApiErrorLike, language: L): string;
	/**
	 * The message of each refused field, by input path, ready for a form: the
	 * entries of `extensions.fields`, else the one field `extensions.field`
	 * names, with the error's own message. Empty for neither.
	 */
	fieldErrors(error: ApiErrorLike, language: L): Record<string, string>;
	/** `unavailable`, in `language`. */
	unavailableMessage(language: L): string;
	/**
	 * What a failed call says to the user: an API refusal's message and its
	 * status, or an API it cannot reach (a 503 `Response`: the unavailable
	 * word). Undefined for anything else, which the caller rethrows.
	 */
	apiRefusal(error: unknown, language: L): ApiRefusal | undefined;
	/**
	 * A fetcher's refusal: `apiRefusal`'s, so the page stays where it was. A
	 * 401 (the session caller redirects first) or any other failure is
	 * thrown, through `routeError`, for the error page.
	 */
	fetcherRefusal(error: unknown, language: L): ApiRefusal;
	/**
	 * Runs the mutation of an action a fetcher posted to: `{ ok: true }` with
	 * `about` and the mutation's value, or `{ ok: false, error }` with `about`
	 * and the refusal's message, answered with its HTTP status.
	 */
	fetcherResult<
		About extends object,
		Value extends object = Record<never, never>,
	>(
		language: L,
		about: About,
		run: () => Promise<Value>,
	): Promise<
		| ({ ok: true } & About & Value)
		| ReturnType<typeof data<{ ok: false; error: string } & About>>
	>;
	/**
	 * Runs a form's mutation: `{ ok: true, value }`, or the form's errors
	 * (`fieldErrors` under the form field `fieldOf` names an input path by,
	 * and a `formError` for the rest) with the refusal's status. A 404 about
	 * none of the form's fields, a 401 and other failures are thrown for the
	 * error page.
	 */
	submitForm<T>(
		language: L,
		run: () => Promise<T>,
		fieldOf: (path: string) => string | undefined,
	): Promise<{ ok: true; value: T } | ReturnType<typeof data<FormErrors>>>;
}

/**
 * The wording of an API's refusals for the languages `L`, from the
 * catalogue `messages` holds. Make one per app, beside its `createApiMessages`.
 */
export function createApiErrors<L extends string>(
	options: ApiErrorsOptions<L>,
): ApiErrors<L> {
	return describeApiErrors(options);
}
