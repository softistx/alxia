import { AccessError } from './errors';

/** A refusal as the host sees it, whoever raised it: a guard or the tenancy layer. */
export interface Refusal {
	readonly code: string;
	readonly status: number;
	readonly params: Readonly<Record<string, string>>;
}

/**
 * The refusal an error stands for: an `AccessError`, or any error carrying a
 * string `code` under `auth.errors.` or `tenancy.errors.` and a numeric
 * `status` (`@alxia/tenancy`'s `TenancyError`). `undefined` for anything else.
 */
export function refusalOf(error: unknown): Refusal | undefined {
	if (error instanceof AccessError) return error;
	if (typeof error !== 'object' || error === null) return undefined;
	const { code, status, params } = error as Record<string, unknown>;
	if (
		typeof code === 'string' &&
		typeof status === 'number' &&
		(code.startsWith('auth.errors.') || code.startsWith('tenancy.errors.'))
	) {
		return {
			code,
			status,
			params: (params ?? {}) as Readonly<Record<string, string>>,
		};
	}
	return undefined;
}

/**
 * The hook that maps refusals to the host's error codes and type. `map` gets
 * each refusal and returns the host's error (a GraphQL error with its
 * extensions, an `HttpError`...); anything that is not a refusal passes
 * through untouched. Give the result to the GraphQL server's error masking,
 * or use `withRefusals` on a resolver.
 */
export function refusalMapper<E>(
	map: (refusal: Refusal) => E,
): (error: unknown) => unknown {
	return (error) => {
		const refusal = refusalOf(error);
		return refusal ? map(refusal) : error;
	};
}

/** Wraps a resolver (or any async function): its refusals are thrown mapped. */
export function withRefusals<A extends unknown[], R>(
	map: (refusal: Refusal) => unknown,
	fn: (...args: A) => R | Promise<R>,
): (...args: A) => Promise<R> {
	const mapped = refusalMapper(map);
	return async (...args) => {
		try {
			return await fn(...args);
		} catch (error) {
			throw mapped(error);
		}
	};
}
