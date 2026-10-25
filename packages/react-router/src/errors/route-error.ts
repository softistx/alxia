import { data } from 'react-router';
import { isApiErrorLike } from './api-error';
import { REQUEST_ID_HEADER } from './request-id';

/** The statuses an error page words: unauthenticated, forbidden, missing, unavailable. */
const ROUTED: ReadonlySet<number> = new Set([401, 403, 404, 503]);

/**
 * What a route error of the API carries to the error page: the API's code
 * and message when it gave a code, and the `X-Request-Id` of the call as the
 * support reference (`errorRequestId`).
 */
export type RouteErrorData = {
	code?: string | undefined;
	message?: string | undefined;
	requestId?: string | undefined;
};

export interface RouteErrorOptions {
	/** The statuses that become a route error of their own; 401, 403, 404 and 503 by default. */
	statuses?: ReadonlySet<number>;
	/** The header a thrown `Response` carries the request id in; `x-request-id` by default. */
	requestIdHeader?: string;
}

/**
 * What a loader throws for an error from the API: an `ApiError` whose
 * status is routed (401, 403, 404 or 503) becomes a route error response of
 * that status, which the root `ErrorBoundary` renders as its page, with the
 * call's request id when the API gave one. A thrown routed `Response` that
 * carries a request id becomes one too (a bare `Response` hands the browser
 * its body only). Any other `ApiError` that has a request id becomes a 500
 * with just that id, so the generic error page can show it. Anything else
 * is returned as it is.
 */
export function routeError(
	error: unknown,
	{
		statuses = ROUTED,
		requestIdHeader = REQUEST_ID_HEADER,
	}: RouteErrorOptions = {},
): unknown {
	if (isApiErrorLike(error)) {
		const { requestId } = error;
		if (statuses.has(error.status)) {
			return data<RouteErrorData>(
				{ code: error.code, message: error.message, requestId },
				{ status: error.status },
			);
		}
		return requestId
			? data<RouteErrorData>({ requestId }, { status: 500 })
			: error;
	}
	if (error instanceof Response && statuses.has(error.status)) {
		const requestId = error.headers.get(requestIdHeader);
		if (requestId) {
			return data<RouteErrorData>({ requestId }, { status: error.status });
		}
	}
	return error;
}

/**
 * The support reference an error page shows: the API's `X-Request-Id` a
 * route error carries (`routeError`), if it carries one.
 */
export function errorRequestId(error: unknown): string | undefined {
	if (typeof error !== 'object' || error === null) return undefined;
	const { data: body } = error as { data?: unknown };
	if (typeof body !== 'object' || body === null) return undefined;
	const { requestId } = body as { requestId?: unknown };
	return typeof requestId === 'string' && requestId ? requestId : undefined;
}
