/**
 * The 403 `trustProxy({ untrusted: 'refuse' })` answers a request whose
 * forwarding headers come from a connection that is no trusted proxy, and
 * `untrusted: 'refuse-all'` any request from one, in
 * the serving app's format, before routing and every middleware: nothing
 * the app runs reads a context whose `ip` the client may have written.
 */
import { PROBLEM, problemOf } from '../errors/problems';
import { toResponse } from '../reply/reply';
import { answered, type ProxyRefusalAnswer } from '../request/proxy-refusal';
import type { ProxyRefusal } from '../request/untrusted';
import { errorFormat } from './served';

/**
 * The app's own answer, when `trustProxy({ refusal })` gave one, else
 * `{ error: 'untrusted_proxy' }` or a problem saying why: status 403.
 */
export async function untrustedProxy(
	ctx: {
		readonly request: Request;
		readonly url: URL;
		readonly ip: string | undefined;
	},
	refusal: ProxyRefusal = 'headers',
	answer?: ProxyRefusalAnswer,
): Promise<Response> {
	if (answer !== undefined) {
		const { request, url, ip } = ctx;
		return answered(answer, { request, url, ip, refusal });
	}
	if (errorFormat(ctx) === 'json') {
		return toResponse(403, { error: 'untrusted_proxy' }, new Headers());
	}
	const body = problemOf(ctx, {
		status: 403,
		detail:
			refusal === 'peer'
				? 'A connection that is no trusted proxy'
				: 'Forwarding headers from a connection that is no trusted proxy',
	});
	return toResponse(403, body, new Headers({ 'content-type': PROBLEM }));
}
