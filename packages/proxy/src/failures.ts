/**
 * What a request gets when the upstream fails it: a 502 when it could not
 * be reached or broke off before its headers, a 504 when it did not send
 * them in time — thrown as `HttpError`s, so the route boundary answers them
 * in the app's error format (`{ error }`, or an RFC 9457 problem under
 * `alxia({ errors: 'problem' })`) and every observer before the proxy
 * sees them. Neither names the upstream: its address stays in the
 * error's message, for the logs.
 */
import { HttpError } from '@alxia/core';

/** The body of the 502 an unreachable or failing upstream gets. */
export interface BadGatewayBody {
	readonly error: 'bad_gateway';
}

/** The body of the 504 an upstream too slow to answer gets. */
export interface GatewayTimeoutBody {
	readonly error: 'gateway_timeout';
}

/** The 502: the upstream refused the connection, reset it, or sent no valid response. */
export function badGateway(
	upstream: URL,
	cause: unknown,
): HttpError<502, BadGatewayBody> {
	const code = (cause as { code?: unknown } | null)?.code;
	const why = typeof code === 'string' ? code : String(cause);
	return new HttpError(
		502,
		{ error: 'bad_gateway' },
		{
			message: `proxy: ${upstream.origin} failed: ${why}`,
			detail: 'The upstream server could not be reached',
			cause,
		},
	);
}

/** The 504: the upstream sent no response headers within `timeout` milliseconds. */
export function gatewayTimeout(
	upstream: URL,
	timeout: number,
): HttpError<504, GatewayTimeoutBody> {
	return new HttpError(
		504,
		{ error: 'gateway_timeout' },
		{
			message: `proxy: ${upstream.origin} sent no response within ${timeout} ms`,
			detail: 'The upstream server did not answer in time',
		},
	);
}
