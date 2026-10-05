/**
 * The 403 `trustProxy({ untrusted: 'refuse' })` answers a request whose
 * forwarding headers come from a connection that is no trusted proxy, in
 * the serving app's format, before routing and every middleware: nothing
 * the app runs reads a context whose `ip` the client may have written.
 */
import { PROBLEM, problemOf } from '../errors/problems';
import { toResponse } from '../reply/reply';
import { errorFormat } from './served';

/** `{ error: 'untrusted_proxy' }`, or a problem saying why, with status 403. */
export function untrustedProxy(ctx: { readonly url: URL }): Response {
	if (errorFormat(ctx) === 'json') {
		return toResponse(403, { error: 'untrusted_proxy' }, new Headers());
	}
	const body = problemOf(ctx, {
		status: 403,
		detail: 'Forwarding headers from a connection that is no trusted proxy',
	});
	return toResponse(403, body, new Headers({ 'content-type': PROBLEM }));
}
