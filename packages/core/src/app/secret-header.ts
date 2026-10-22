/**
 * `proxySecretHeader(ctx)`: the name of the header `trustProxy({ secret })`
 * reads, kept on the request's context under a symbol shared by every copy
 * of core, so a proxy middleware can drop it before forwarding.
 */

/** Where a request's context keeps the name of the proxy secret's header. */
export const SECRET_HEADER: unique symbol = Symbol.for(
	'alxia.proxy.secretHeader',
);

/**
 * The header `trustProxy({ secret })` reads the secret from, lower case, or
 * `undefined` with no secret. A middleware that forwards a request strips it:
 * the secret proves the proxy to this app, not to the next one.
 */
export function proxySecretHeader(ctx: object): string | undefined {
	return (ctx as { [SECRET_HEADER]?: string })[SECRET_HEADER];
}
