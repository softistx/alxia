import type { ApiMessages } from './messages';

/** The part of a zod issue a code reads, by shape (`@nxgt/material-core`'s `CodeIssue`). */
export type CodeIssueLike = {
	readonly code: string;
	/** A custom issue's params: `.refine(…, { params: { code } })`. */
	readonly params?: Record<string, unknown> | undefined;
	readonly input?: unknown;
	readonly origin?: string | undefined;
	readonly minimum?: unknown;
	readonly maximum?: unknown;
	readonly expected?: unknown;
	readonly message?: string | undefined;
};

const API_CODE = /^[a-z-]+\.errors\.[a-z0-9-]+$/;

export interface ApiCodeResolverOptions<L extends string> {
	/**
	 * The app's translator, for every key that is not an API code. Method
	 * syntax: the app's own `Translate<LocaleKey>` is accepted.
	 */
	translate(
		key: string,
		context?: Readonly<Record<string, unknown>>,
		language?: L | (() => L),
	): string;
	/** The page's language, when a call names none. */
	language(): L;
	/** Which code an issue carries; the issue's `params.code` by default. */
	codeOf?(issue: CodeIssueLike): string | undefined;
	/** Whether a key is an API code; `<module>.errors.<slug>` by default. */
	isApiCode?(key: string): boolean;
}

/** What `@nxgt/material`'s `useCodeResolver(schema, resolver)` takes. */
export interface ApiCodeResolver<L extends string> {
	translate: (
		key: string,
		context?: Readonly<Record<string, unknown>>,
		language?: L | (() => L),
	) => string;
	codeOf: (issue: CodeIssueLike) => string | undefined;
}

function paramsCode(issue: CodeIssueLike) {
	const code = (issue.params as { code?: unknown } | undefined)?.code;
	return typeof code === 'string' ? code : undefined;
}

/**
 * The words of what a form's checks ask for: a refinement carrying an API
 * code in `params.code` reads exactly as the API words it (from the
 * catalogue `messages` holds), any other key takes the app's translator, and
 * a code the catalogue lacks comes back as it is, so the form library words
 * the issue with its own locale instead. Both functions are stable: a
 * resolver is made once per schema and language, so build this once, at
 * module scope.
 */
export function apiCodeResolver<L extends string>(
	messages: ApiMessages<L>,
	options: ApiCodeResolverOptions<L>,
): ApiCodeResolver<L> {
	const isApiCode = (key: string) =>
		options.isApiCode ? options.isApiCode(key) : API_CODE.test(key);
	return {
		translate(key, context, provideLanguage) {
			if (!isApiCode(key))
				return options.translate(key, context, provideLanguage);
			const language =
				typeof provideLanguage === 'function'
					? provideLanguage()
					: (provideLanguage ?? options.language());
			return messages.apiMessage(key, context, language) ?? key;
		},
		codeOf(issue) {
			return options.codeOf ? options.codeOf(issue) : paramsCode(issue);
		},
	};
}
