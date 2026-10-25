import { isApiErrorLike, isStatusError, isUnavailableError } from './api-error';
import { quietLog } from './log';
import { REQUEST_ID_HEADER } from './request-id';

/** The statuses an API's gateway or auth layer may answer without a GraphQL body. */
const PASSED_THROUGH: ReadonlySet<number> = new Set([401, 403, 404]);

/** The statuses a `Response` cannot carry a body with. */
const NO_BODY: ReadonlySet<number> = new Set([101, 204, 205, 304]);

export interface CallFailureOptions {
	/** What a log line names the API by, such as `my-api https://api.example.com/graphql`. */
	api: string;
	/** The operation's name, for the log (`operationName(document)`). */
	operation?: string;
	/** The `x-request-id` the API answered, when it did (`requestIdOf(response)`). */
	requestId?: string;
	/** The incoming request's signal: an aborted call is answered 503. */
	signal?: AbortSignal;
	/** The statuses without a GraphQL body that become a `Response` of their own; 401, 403 and 404 by default. */
	passedThrough?: ReadonlySet<number>;
	/** Where the lines go; `console` by default. */
	log?: Pick<Console, 'warn' | 'error'>;
}

/**
 * What a call became once it failed, for a loader or an action to throw: the
 * `ApiError` as it is (carrying `requestId`), a `Response` of the API's own
 * status for a 401, 403 or 404 without a GraphQL body, a 503 `Response` (with no body; the reason is in the log) for an
 * unreachable, slow, garbled or aborted API, and any other error as it is.
 * Every case it recognises is logged with the request id, when the API gave one, and never
 * the headers, the variables nor a token; the id rides on the `ApiError` as
 * `requestId` and on a `Response` as `x-request-id`, where `routeError` reads
 * it.
 *
 * It recognises `@nxgt/graphql-client`'s errors by their `name`, never with
 * `instanceof`, so it needs no import of the client and holds across two
 * copies of it.
 */
export function apiCallFailure(
	error: unknown,
	{
		api,
		operation = 'operation',
		requestId,
		signal,
		passedThrough = PASSED_THROUGH,
		log: appLog = console,
	}: CallFailureOptions,
): unknown {
	const log = quietLog(appLog, ['warn', 'error']);
	const call = `${api}: ${operation}${requestId ? ` (request ${requestId})` : ''}`;
	const headers: Record<string, string> = requestId
		? { [REQUEST_ID_HEADER]: requestId }
		: {};
	const unavailable = (reason: string, cause?: unknown): Response => {
		log.error(`${call} ${reason}`, cause ?? '');
		return new Response(null, { status: 503, headers });
	};
	if (isApiErrorLike(error)) {
		// The client's `ApiError.requestId` is writable, though the structural type marks it readonly.
		if (requestId) (error as { requestId?: string }).requestId = requestId;
		const line = `${call} answered ${error.status}${error.code ? ` ${error.code}` : ''}`;
		if (error.status >= 500) log.error(line);
		else log.warn(line);
		return error;
	}
	if (isStatusError(error)) {
		if (passedThrough.has(error.status)) {
			log.warn(`${call} answered ${error.status}`);
			const statusText =
				typeof error.statusText === 'string' ? error.statusText : '';
			if (NO_BODY.has(error.status)) {
				return new Response(null, {
					status: error.status,
					statusText,
					headers,
				});
			}
			return new Response(statusText, {
				status: error.status,
				statusText,
				headers,
			});
		}
		return unavailable(`answered ${error.status} without GraphQL`, error.body);
	}
	if (isUnavailableError(error)) return unavailable(error.reason, error.cause);
	if (signal?.aborted) return unavailable('aborted', error);
	return error;
}

/** A document, as far as `operationName` reads it: `graphql`'s `DocumentNode` fits. */
export interface DocumentLike {
	readonly definitions: readonly {
		readonly kind: string;
		readonly operation?: string | undefined;
		readonly name?: { readonly value: string } | undefined;
	}[];
}

/**
 * The name of the operation a document holds, for a log line: its name, else
 * its kind (`query`, `mutation`, `subscription`), else `operation`.
 */
export function operationName(document: DocumentLike): string {
	for (const definition of document.definitions) {
		if (definition.kind === 'OperationDefinition') {
			return definition.name?.value ?? definition.operation ?? 'operation';
		}
	}
	return 'operation';
}
