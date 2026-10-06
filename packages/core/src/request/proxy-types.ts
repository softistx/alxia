/**
 * The types `trustProxy` and its refusal share, apart from both so neither
 * imports the other.
 */
import type { Origin } from './origin';
import type { ProxyRefusal } from './untrusted';

/**
 * What the `refusal` function is given: the request, its URL, the
 * connection's own address (never one a forwarding header wrote), and why
 * it is refused.
 */
export interface RefusedRequest {
	readonly request: Request;
	readonly url: URL;
	readonly ip: string | undefined;
	readonly refusal: ProxyRefusal;
}

/** An answer to a refused request: a 403 `Response`, sync or async. */
export type ProxyRefusalAnswer = (
	refused: RefusedRequest,
) => Response | Promise<Response>;

/** What the proxies say of a request, believed. */
export interface Forwarded {
	/** The client's address; the connection's when the proxies do not name it. */
	readonly ip: string | undefined;
	/** The scheme and host the client asked for, each when a trusted proxy said it and it is valid. */
	readonly origin: Origin;
	/**
	 * Whether the request is answered 403: forwarding headers from an
	 * untrusted connection, under `untrusted: 'refuse'`, or any request
	 * from one `allow` does not let through, under `'refuse-all'`.
	 */
	readonly refused: boolean;
	/** Why it is refused, when it is: its forwarding headers (`'headers'`), or its connection (`'peer'`). */
	readonly refusal?: ProxyRefusal;
	/** The `refusal` option's answer to it. */
	readonly answer?: ProxyRefusalAnswer;
}

/** The `proxy` option: what the proxies say of a request, from its connection. */
export type ProxyTrust = (
	request: Request,
	server: Bun.Server<unknown> | undefined,
) => Forwarded;
