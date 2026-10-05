/** `nonceOf`: the request's CSP nonce, read from alxia's context if a middleware set one. */
import type { RouterContextProvider } from 'react-router';
import { alxiaContext } from './context';

/**
 * This request's CSP nonce, for `entry.server.tsx`: the `nonce` alxia's
 * middlewares put on the context — `secureHeaders({ nonce: true })` from
 * `@alxia/secure-headers`, or a `derive` of your own — or `undefined` when
 * none did, or when the request did not come through alxia. It reads the
 * key if present: neither package depends on the other.
 *
 * ```tsx
 * const nonce = nonceOf(loadContext);
 * <ServerRouter context={routerContext} url={request.url} nonce={nonce} />
 * ```
 */
export function nonceOf(
	context: Readonly<RouterContextProvider>,
): string | undefined {
	const value = context.get(alxiaContext);
	if (typeof value !== 'object' || value === null || !('nonce' in value)) {
		return undefined;
	}
	return typeof value.nonce === 'string' ? value.nonce : undefined;
}
