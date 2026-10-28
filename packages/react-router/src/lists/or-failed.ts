/** What a loader answers for a failed cursor page: no rows, so `usePagedRows` sets `error`. */
export const FAILED = Object.freeze({ failed: true as const });

/** The type of {@link FAILED}. */
export type FailedPage = typeof FAILED;

/** Whether a loader answer is {@link FAILED}. */
export function isFailedPage(value: unknown): value is FailedPage {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { failed?: unknown }).failed === true
	);
}

/**
 * The loader half of `usePagedRows`. Runs `run` and returns its answer.
 *
 * - With no `after` (the first page), an error is rethrown, so the route's
 *   `ErrorBoundary` shows.
 * - With an `after` (a "load more"), any error becomes {@link FAILED}, so the
 *   rows stay on screen with a retry, except a 3xx `Response` (a redirect),
 *   which is rethrown.
 */
export async function orFailed<T>(
	after: string | null | undefined,
	run: () => Promise<T> | T,
): Promise<T | FailedPage> {
	if (!after) return await run();
	try {
		return await run();
	} catch (error) {
		if (error instanceof Response && error.status >= 300 && error.status < 400)
			throw error;
		return FAILED;
	}
}
