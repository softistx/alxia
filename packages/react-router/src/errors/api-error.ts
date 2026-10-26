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
	readonly attemptsLeft?: unknown;
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
	/** A throttle's wait, in minutes (`waitMinutes` coerces a string). */
	readonly minutes?: unknown;
	/** A throttle's wait, in seconds. */
	readonly retryAfter?: unknown;
	/** The tries a refused code leaves, as `@nxgt/janus` counts them. */
	readonly attemptsLeft?: unknown;
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

/** Whether `error` is an `Error` of this `name`: the client's errors are told by it, never `instanceof`. */
export const isNamed = (error: unknown, name: string): error is Error =>
	error instanceof Error && error.name === name;

/**
 * Whether `error` is an `ApiError` of `@nxgt/graphql-client`, by the test
 * that client's `isApiError` makes (an `Error` named `ApiError` with an
 * `errors` array), plus a numeric `status`, which `ApiErrorLike` promises.
 * It holds across two copies of the client.
 */
export function isApiErrorLike(error: unknown): error is ApiErrorLike {
	return (
		isNamed(error, 'ApiError') &&
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

const MAX_RETRY_AFTER = 86_400;

/** A wait in seconds from one value: a finite number from 0, or a decimal string. */
function secondsOf(value: unknown): number | undefined {
	const seconds =
		typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())
			? Number(value.trim())
			: value;
	return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0
		? Math.min(MAX_RETRY_AFTER, Math.ceil(seconds)) + 0
		: undefined;
}

/**
 * The seconds a throttle asks to wait: `retryAfter` of the first error's
 * `extensions.params`, else (when that is unusable) of its `extensions`.
 * Only a finite number from 0, or a decimal string, counts; it is rounded up
 * and held at a day (86 400), and `-0` is 0. `undefined` when the API sent
 * none usable. Internal: `/session` words it as a typed `retryAfter`.
 */
export function retryAfterOf(error: ApiErrorLike): number | undefined {
	const extensions = error.errors[0]?.extensions;
	return (
		secondsOf(extensions?.params?.retryAfter) ??
		secondsOf(extensions?.retryAfter)
	);
}

/**
 * The tries a refused code leaves, as `@nxgt/janus` counts them:
 * `extensions.attemptsLeft` of the first error, else the same key in its
 * `params`. A whole number from 0 up; `undefined` when the API sent none or
 * something that is not a count.
 */
export function attemptsLeftOf(error: ApiErrorLike): number | undefined {
	const extensions = error.errors[0]?.extensions;
	for (const value of [
		extensions?.attemptsLeft,
		extensions?.params?.attemptsLeft,
	]) {
		if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
			return value;
		}
	}
	return undefined;
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

/** `@nxgt/graphql-client`'s `ApiStatusError`, as far as the failure reads it. */
export interface StatusErrorLike extends Error {
	status: number;
	statusText?: string | undefined;
	body?: unknown;
}

/** `@nxgt/graphql-client`'s `ApiUnavailableError`, as far as the failure reads it. */
export interface UnavailableErrorLike extends Error {
	reason: string;
}

export const isStatusError = (error: unknown): error is StatusErrorLike =>
	isNamed(error, 'ApiStatusError') &&
	typeof (error as { status?: unknown }).status === 'number';

export const isUnavailableError = (
	error: unknown,
): error is UnavailableErrorLike =>
	isNamed(error, 'ApiUnavailableError') &&
	typeof (error as { reason?: unknown }).reason === 'string';
