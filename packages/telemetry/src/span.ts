import type { SpanScope } from '@nxgt/telemetry';
import { HTTP_STATUS, serverFailed } from './attributes';
import { type Outcome, settled, watched } from './body';

/**
 * The status, and the failure. A route's error is recorded as the span's
 * exception, but only a 5xx makes it an error: a 401 a guard answered is
 * the server working.
 */
export function record(scope: SpanScope, status: number, error: unknown): void {
	if (error !== undefined) {
		const before = scope.status;
		scope.fail(error);
		if (!serverFailed(status)) scope.status = before;
	}
	scope.attribute(HTTP_STATUS, status);
	if (serverFailed(status) && scope.status === 'ok') scope.status = 'error';
}

/**
 * The response the span ends with. A body with nothing left to time, or a
 * span never exported, is returned as it is: the span ends, then the
 * response is handed over. A streamed body is handed over at once through
 * `resolve`, watched, and returned once it has ended, so the span ends then.
 */
export async function handOver(
	scope: SpanScope,
	response: Response,
	resolve: (response: Response) => void,
): Promise<Response> {
	if (settled(response) || !scope.context.sampled) return response;
	const { promise: sent, resolve: end } = Promise.withResolvers<void>();
	const body = watched(
		response.body as ReadableStream<Uint8Array>,
		(outcome, error) => {
			try {
				ended(scope, outcome, error);
			} finally {
				end();
			}
		},
	);
	const streamed = new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
	resolve(streamed);
	await sent;
	return streamed;
}

/**
 * How a streamed body ended, on its span: a body that failed fails the
 * span, as a 5xx does; a client that left is an event, the server having
 * done nothing wrong.
 */
function ended(scope: SpanScope, outcome: Outcome, error: unknown): void {
	if (outcome === 'errored') {
		scope.fail(error);
		// `fail` keeps a failure recorded before, and its status with it.
		scope.status = 'error';
	} else if (outcome === 'aborted') scope.event(RESPONSE_ABORTED);
}

/** The event of a server span whose client left before the body was sent. */
const RESPONSE_ABORTED = 'http.response.aborted';
