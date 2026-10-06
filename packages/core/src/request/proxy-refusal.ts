/**
 * `trustProxy({ refusal })`: the app's own answer to a request the proxy
 * gate refuses. The gate runs before routing, so no middleware, `derive`
 * or error handler sees it: this function is the one place that does.
 */
import type {
	Forwarded,
	ProxyRefusalAnswer,
	ProxyTrust,
	RefusedRequest,
} from './proxy-types';

/** `refusal`, checked once at declaration. */
export function answerOf(
	refusal: unknown,
	untrusted: unknown,
	who: string,
): ProxyRefusalAnswer | undefined {
	if (refusal === undefined) return undefined;
	if (untrusted !== 'refuse' && untrusted !== 'refuse-all')
		throw new TypeError(
			`${who}: refusal is for untrusted: 'refuse' or 'refuse-all', which alone refuse a request`,
		);
	if (typeof refusal !== 'function')
		throw new TypeError(
			`${who}: refusal must be a function (refused) => Response`,
		);
	return refusal as ProxyRefusalAnswer;
}

/**
 * What the `refusal` function answered, as the refusal's answer: a
 * `Response` with status 403, so a refusal stays one. Anything else throws,
 * which ends in the app's 500.
 */
export async function answered(
	answer: ProxyRefusalAnswer,
	refused: RefusedRequest,
): Promise<Response> {
	const response = await answer(refused);
	if (!(response instanceof Response) || response.status !== 403)
		throw new TypeError(
			"trustProxy: refusal must answer a Response with status 403, the refusal's own",
		);
	return response;
}

/** `read`, with `answer` carried by each refusal it makes; `read` itself without one. */
export function answering(
	read: ProxyTrust,
	answer: ProxyRefusalAnswer | undefined,
): ProxyTrust {
	if (answer === undefined) return read;
	return (request, server): Forwarded => {
		const forwarded = read(request, server);
		return forwarded.refused ? { ...forwarded, answer } : forwarded;
	};
}
