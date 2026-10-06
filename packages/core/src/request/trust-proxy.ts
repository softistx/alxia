/**
 * `trustProxy`: what the proxies in front of the app say of a request —
 * the client's address, the scheme and host it asked for — believed only
 * from a connection the one trust definition names.
 */
import { canonicalIp, canonicalOf, type ParsedIp, parseIp } from './ip-address';
import type { Origin } from './origin';
import { fromForwarded, fromLists, NONE } from './proxy-readers';
import { answering, answerOf, type ProxyRefusalAnswer } from './proxy-refusal';
import { peerTrusted, type TrustedProxies, trustOf } from './trust';
import { gateOf, type ProxyAllow, type ProxyRefusal } from './untrusted';

export type { ProxyRefusalAnswer, RefusedRequest } from './proxy-refusal';
export type { ProxyAllow, ProxyRefusal } from './untrusted';

export interface TrustProxyOptions {
	/**
	 * The proxies in front of the app. A number is how many there are: the
	 * client is the entry that many places from the right. CIDR ranges or a
	 * function name the proxies by address: the headers are read only from a
	 * connection of one, and the client is the first entry from the right
	 * that is not one.
	 */
	readonly trusted: TrustedProxies;
	/**
	 * The header the proxies append the client's address to:
	 * `x-forwarded-for` (the default), with the scheme and host from
	 * `X-Forwarded-Proto` and `X-Forwarded-Host`; `forwarded` (RFC 7239),
	 * all three from its `for=`, `proto=` and `host=`; or another one that
	 * lists addresses, with the `X-Forwarded-*` scheme and host.
	 */
	readonly header?: string;
	/**
	 * What a request whose forwarding headers come from a connection the
	 * ranges or the function do not name gets: `'ignore'` (the default)
	 * reads none of them; `'refuse'` answers it 403, in the app's error
	 * format. A request with no such header passes either way. Refusing
	 * needs proxies named by address: a hop count cannot tell a proxy.
	 * `'refuse-all'`, which refuses every such request, headers or not,
	 * takes `StrictProxyOptions`.
	 */
	readonly untrusted?: 'ignore' | 'refuse';
	/** `untrusted: 'refuse-all'`'s escape alone: see `StrictProxyOptions`. */
	readonly allow?: undefined;
	/**
	 * The app's own 403 for a refused request, in place of the default
	 * body: `({ request, url, ip, refusal }) => Response`, run before
	 * routing, so no middleware sees it; not a 403, or a throw, is a 500.
	 */
	readonly refusal?: ProxyRefusalAnswer;
	/**
	 * Whether `ctx.ip` is the address's canonical text — IPv6 as RFC 5952
	 * writes it, an IPv4-mapped address as IPv4, brackets and port dropped —
	 * whether the header or the socket gave it (the default, `true`), or the
	 * address as written (`false`). A `trusted` function is given the same.
	 */
	readonly canonical?: boolean;
}

/**
 * `trustProxy` for an app only its proxies may reach: `untrusted:
 * 'refuse-all'` answers 403 every request from a connection the ranges or
 * the function do not name, forwarding headers or not, but for what
 * `allow` lets through — a health probe's path, a loopback peer — whose
 * headers are not read and whose `ctx.ip` is the connection's.
 */
export interface StrictProxyOptions
	extends Omit<TrustProxyOptions, 'trusted' | 'untrusted' | 'allow'> {
	/** The proxies, by CIDR range, address or a test of one: a hop count cannot tell a proxy. */
	readonly trusted: Exclude<TrustedProxies, number>;
	readonly untrusted: 'refuse-all';
	/**
	 * What passes from another connection: peers by CIDR range or address,
	 * or a test of the request and the peer's address (`undefined` with no
	 * server). Nothing by default.
	 */
	readonly allow?: ProxyAllow;
}

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

/** Marks a `ProxyTrust` that refuses every connection but the proxies', which `listen` reads. */
export const REFUSES_ALL = Symbol.for('alxia.proxy.refusesAll');

/** The options `proxyReader` reads, whichever of `trustProxy`'s forms gave them. */
type ReaderOptions = Omit<TrustProxyOptions, 'untrusted' | 'allow'> & {
	readonly untrusted?: unknown;
	readonly allow?: unknown;
};

/** `trustProxy`, or, with `withOrigin` false, the reading `forwardedIp` makes of the address alone. */
export function proxyReader(
	options: ReaderOptions,
	who: string,
	withOrigin: boolean,
): ProxyTrust {
	const canonical = options.canonical ?? true;
	if (typeof canonical !== 'boolean')
		throw new TypeError(`${who}: canonical must be true or false`);
	const trust = trustOf(options.trusted, who, canonical);
	const header = (options.header ?? 'x-forwarded-for').toLowerCase();
	const gate = gateOf(options, trust, header, who);
	const read = header === 'forwarded' ? fromForwarded : fromLists(header);
	const shown = (ip: ParsedIp) => (canonical ? canonicalOf(ip) : ip.text);
	return (request, server) => {
		const socket = server?.requestIP(request)?.address ?? undefined;
		const peer = socket === undefined ? undefined : parseIp(socket);
		const ownOf = () => {
			if (socket === undefined || !canonical) return socket;
			return peer === undefined ? canonicalIp(socket) : canonicalOf(peer);
		};
		if (!peerTrusted(trust, peer)) {
			const own = ownOf();
			const refusal = gate(request, peer, own);
			if (refusal === undefined)
				return { ip: own, origin: NONE, refused: false };
			return { ip: own, origin: NONE, refused: true, refusal };
		}
		const { at, origin } = read(request.headers, trust, withOrigin);
		return {
			ip: at === undefined ? ownOf() : shown(at),
			origin,
			refused: false,
		};
	};
}

/**
 * The `proxy` option for an app behind proxies: one definition of the
 * proxies to believe, for the client's address (`ctx.ip`) and the scheme
 * and host it asked for (`originalUrl(ctx)`). Each is read from what the
 * proxies wrote alone, never from what the client did, and only from a
 * connection `trusted` names; a scheme other than `http` or `https`, a
 * host that is no bare `host[:port]`, says nothing, and the request's own
 * URL stands.
 *
 * @example
 * alxia({ proxy: trustProxy({ trusted: ['10.0.0.0/8'] }) });
 * alxia({ proxy: trustProxy({ trusted: ['10.0.0.0/8'], untrusted: 'refuse' }) });
 * alxia({ proxy: trustProxy({ header: 'forwarded', trusted: 1 }) });
 * alxia({ proxy: trustProxy({ trusted: ['10.0.0.0/8'], untrusted: 'refuse-all', allow: ['127.0.0.1'] }) });
 */
export function trustProxy(options: StrictProxyOptions): ProxyTrust;
export function trustProxy(options: TrustProxyOptions): ProxyTrust;
export function trustProxy(
	options: TrustProxyOptions | StrictProxyOptions,
): ProxyTrust {
	const read = answering(
		proxyReader(options, 'trustProxy', true),
		answerOf(options.refusal, options.untrusted, 'trustProxy'),
	);
	if (options.untrusted === 'refuse-all')
		Object.defineProperty(read, REFUSES_ALL, { value: true });
	return read;
}
