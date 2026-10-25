/**
 * The shape of an API's refusal, as `@nxgt/graphql-client`'s `ApiError`
 * carries it, declared structurally: `/errors` never imports the client, so
 * an app needs it only if it calls the API through it. `api-error.spec.ts`
 * holds the two in step.
 */

/** One refused input field: `extensions.fields` of a validation refusal. */
export interface ApiFieldErrorLike {
	readonly path: string;
	readonly code: string;
	readonly message: string;
	/** The values the field's message interpolates. */
	readonly params?: Readonly<Record<string, unknown>>;
}

/** The values a message interpolates; a throttle's wait is `minutes` or `retryAfter`. */
export interface ApiErrorParamsLike {
	readonly minutes?: unknown;
	readonly retryAfter?: unknown;
	readonly [key: string]: unknown;
}

/**
 * One GraphQL error's `extensions`. `code` is the API's own
 * `<module>.errors.<slug>`; the rest is what its messages name.
 */
export interface ApiErrorExtensionsLike {
	readonly code?: string;
	/** The values the message interpolates, when the API sends them. */
	readonly params?: ApiErrorParamsLike;
	/** A validation refusal: every field at fault, by input path. */
	readonly fields?: readonly ApiFieldErrorLike[];
	/** Any other refusal about one input field, by its path. */
	readonly field?: string;
	/** A throttle's wait, in minutes. */
	readonly minutes?: number;
	/** A throttle's wait, in seconds. */
	readonly retryAfter?: number;
	readonly [key: string]: unknown;
}

/** One error of a response's `errors`. */
export interface ApiErrorEntryLike {
	readonly message: string;
	readonly extensions?: ApiErrorExtensionsLike;
}

/** A refusal read from a GraphQL API: what `ApiError` has, and the request id. */
export interface ApiErrorLike extends Error {
	readonly errors: readonly ApiErrorEntryLike[];
	/** The first error's `extensions.code`. */
	readonly code: string | undefined;
	/** The HTTP status to answer with. */
	readonly status: number;
	/** The id the API logged the request under, when the caller kept it. */
	readonly requestId?: string;
}

/**
 * Whether `error` is an `ApiError` of `@nxgt/graphql-client`, by the test
 * that client's own `isApiError` makes: an `Error` named `ApiError` with its
 * `errors` and a numeric `status`. It holds across two copies of the client.
 */
export function isApiErrorLike(error: unknown): error is ApiErrorLike {
	return (
		error instanceof Error &&
		error.name === 'ApiError' &&
		Array.isArray((error as { errors?: unknown }).errors) &&
		typeof (error as { status?: unknown }).status === 'number'
	);
}

/**
 * The minutes a wait lasts, as the API words it: `minutes` (at least one, in
 * `extensions.params` or beside it), else the `retryAfter` seconds rounded
 * up, else one.
 */
export function waitMinutes(
	extensions: ApiErrorExtensionsLike | undefined,
): number {
	const minutes = extensions?.params?.minutes ?? extensions?.minutes;
	if (minutes !== undefined) return Math.max(1, Number(minutes) || 1);
	const seconds = extensions?.params?.retryAfter ?? extensions?.retryAfter;
	return Math.max(1, Math.ceil(Number(seconds) / 60) || 1);
}

/**
 * The values a message names: `extensions.params` over the extensions
 * themselves, where older errors and the extras of a few sit.
 */
export function valuesOf(
	extensions: ApiErrorExtensionsLike | undefined,
): Record<string, unknown> | undefined {
	if (!extensions) return undefined;
	return extensions.params
		? { ...extensions, ...extensions.params }
		: extensions;
}
