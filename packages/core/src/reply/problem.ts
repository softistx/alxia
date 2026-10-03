/**
 * Problem details for HTTP APIs (RFC 9457, which obsoletes RFC 7807): a
 * JSON body sent as `application/problem+json`.
 */
import type { ClientErrorStatus, ServerErrorStatus } from '../types/status';
import { Reply, type ReplyInit } from './reply';

/**
 * The members RFC 9457 defines. A problem may carry members of its own
 * beside them, its extensions: `problem()` keeps their types.
 */
export interface ProblemDetails<
	Status extends ClientErrorStatus | ServerErrorStatus =
		| ClientErrorStatus
		| ServerErrorStatus,
> {
	/** A URI naming the problem type; absent, it is `about:blank`. */
	readonly type?: string;
	/** A short summary of the problem type, the same for every occurrence. */
	readonly title?: string;
	/** The status of the response, which `problem()` replies with. */
	readonly status: Status;
	/** What went wrong with this occurrence. */
	readonly detail?: string;
	/** A URI naming this occurrence. */
	readonly instance?: string;
}

/**
 * A reply whose body is a problem, with `status` as its status and
 * `content-type: application/problem+json` unless `init` sets one. Any
 * other member is an extension, kept as given and in the body's type:
 *
 * ```ts
 * problem({ type: 'urn:ietf:params:jmap:error:limit', status: 413, limit: 'maxSizeRequest' });
 * ```
 */
export function problem<const Body extends ProblemDetails>(
	body: Body,
	init?: ReplyInit,
): Reply<Body['status'], Body> {
	const headers = new Headers(init?.headers);
	if (!headers.has('content-type')) {
		headers.set('content-type', 'application/problem+json');
	}
	return new Reply(body.status, body, { ...init, headers });
}
