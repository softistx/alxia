import { data, replace } from 'react-router';
import { isApiErrorLike } from '../errors/api-error';
import type { FormErrors } from '../errors/form-errors';
import type { InferOutput, StandardSchemaV1 } from '../errors/standard-schema';
import { samesitePost } from './guard';
import type {
	LinkStayed,
	LinksContext,
	SpendOptions,
	Spent,
} from './link-types';
import { sitePath } from './model/site-path';

/**
 * The response headers of a page a mail's link opens, whose URL carries a
 * token: no `Referer` sends it to another site (its fonts included), and
 * no search engine keeps it.
 */
export const TOKEN_PAGE_HEADERS = {
	'Referrer-Policy': 'no-referrer',
	'X-Robots-Tag': 'noindex, nofollow',
} as const;

/** A token page's path with no query or fragment, or a `TypeError` naming `call`. */
const pathOf = (path: string, call: string): string =>
	sitePath(path, { label: `${call}: a token page's path` });

export const statePath = (path: string, state: string): string =>
	`${pathOf(path, 'statePath()')}?${new URLSearchParams({ state })}`;

/** `headers`, with the token page's own on top. */
export function withTokenHeaders(headers?: HeadersInit): Headers {
	const merged = new Headers(headers);
	for (const [name, value] of Object.entries(TOKEN_PAGE_HEADERS)) {
		merged.set(name, value);
	}
	return merged;
}

/** A redirect replacing the current history entry: the token's, so Back never opens it again. */
export const stateRedirect = (
	path: string,
	state: string,
	headers?: HeadersInit,
): Response =>
	replace(statePath(path, state), { headers: withTokenHeaders(headers) });

const isTokenIssue = (issue: {
	readonly path?:
		| readonly (PropertyKey | { readonly key: PropertyKey })[]
		| undefined;
}) => {
	const first = issue.path?.[0];
	return (typeof first === 'object' ? first.key : first) === 'token';
};

export async function linkArgs<S extends StandardSchemaV1>(
	{ json }: Pick<LinksContext<string>, 'json'>,
	invalidState: string,
	schema: S,
	request: Request,
	path: string,
): Promise<InferOutput<S>> {
	samesitePost(json, request);
	pathOf(path, 'linkArgs()');
	const body = await json.readJson(request);
	const result = await schema['~standard'].validate(body);
	if (!result.issues) return result.value as InferOutput<S>;
	// A token the API would refuse anyway (a link cut or padded on its way)
	// ends as an unknown one does; anything else is a bad request.
	if (result.issues.some(isTokenIssue)) {
		throw stateRedirect(path, invalidState);
	}
	throw data('Bad link request', { status: 400 });
}

export async function spendToken<L extends string, T>(
	options: LinksContext<L>,
	run: () => Promise<T>,
	{ request, language, path, states, fields: shown = [] }: SpendOptions<L>,
): Promise<Spent<T>> {
	const { errors } = options;
	samesitePost(options.json, request);
	pathOf(path, 'spendToken()');
	try {
		return { ok: true, value: await run() };
	} catch (error) {
		const refusal = errors.apiRefusal(error, language);
		if (!refusal) throw error;
		const { message, status } = refusal;
		if (isApiErrorLike(error)) {
			const state = error.code ? states[error.code] : undefined;
			if (state) return { ok: false, response: stateRedirect(path, state) };
			const fields = errors.fieldErrors(error, language);
			const named = Object.keys(fields);
			// A refusal under a field the page does not show would say nothing.
			if (named.length && named.every((field) => shown.includes(field))) {
				return { ok: false, refusal: { fieldErrors: fields }, status };
			}
		}
		return { ok: false, refusal: { formError: message }, status };
	}
}

export const answerOf = (
	spent: Exclude<Spent<unknown>, { ok: true }>,
): Response | LinkStayed =>
	'response' in spent
		? spent.response
		: data<FormErrors>(spent.refusal, { status: spent.status });
