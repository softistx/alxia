/**
 * `trustProxy`: what the proxies in front of the app say of a request —
 * the client's address, the scheme and host it asked for — believed only
 * from a connection the one trust definition names.
 */
import { canonicalIp, canonicalOf, type ParsedIp, parseIp } from './ip-address';
import { fromForwarded, fromLists, NONE } from './proxy-readers';
import { answering, answerOf } from './proxy-refusal';
import { type ProxySecret, secretOf } from './proxy-secret';
import type { ProxyRefusalAnswer, ProxyTrust } from './proxy-types';
import { peerTrusted, type TrustedProxies, trustOf } from './trust';
import { gateOf, type ProxyAllow } from './untrusted';

export type { ProxySecret, SecretVerdict } from './proxy-secret';
export type {
	Forwarded,
	ProxyRefusalAnswer,
	ProxyTrust,
	RefusedRequest,
} from './proxy-types';
export type { ProxyAllow, ProxyRefusal } from './untrusted';

/** What every form of `trustProxy`'s options shares. */
export interface ProxyOptionsBase {
	/**
	 * The header the proxies append the client's address to:
	 * `x-forwarded-for` (the default), with the scheme and host from
	 * `X-Forwarded-Proto` and `X-Forwarded-Host`; `forwarded` (RFC 7239),
	 * all three from its `for=`, `proto=` and `host=`; or another one that
	 * lists addresses, with the `X-Forwarded-*` scheme and host.
	 */
	readonly header?: string;
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
 * The proxies in front of the app, and what a request they did not sign
 * gets. `trusted` is a number (how many there are: the client is the entry
 * that many places from the right), or CIDR ranges or a function naming
 * them by address: the headers are read only from a connection of one, and
 * the client is the first entry from the right that is not one.
 *
 * `secret` adds a header only the proxies can set: with it, a request is
 * believed only when the connection is a proxy's (`trusted`) AND the header
 * holds the secret. `untrusted: 'ignore'` (the default) reads no header of
 * any other request; `'refuse'` answers 403 one that carries a forwarding
 * header (or the secret's); a request with none passes. A hop count cannot
 * tell a proxy, so it refuses only with a `secret`. `'refuse-all'`, which
 * refuses every such request, headers or not, takes `StrictProxyOptions`.
 */
export type TrustProxyOptions = ProxyOptionsBase &
	(
		| {
				readonly trusted: Exclude<TrustedProxies, number>;
				readonly secret?: ProxySecret;
				readonly untrusted?: 'ignore' | 'refuse';
				/** `untrusted: 'refuse-all'`'s escape alone: see `StrictProxyOptions`. */
				readonly allow?: undefined;
		  }
		| {
				readonly trusted: number;
				readonly secret?: undefined;
				readonly untrusted?: 'ignore';
				readonly allow?: undefined;
		  }
		| {
				readonly trusted: TrustedProxies;
				readonly secret: ProxySecret;
				readonly untrusted?: 'ignore' | 'refuse';
				readonly allow?: undefined;
		  }
	);

/**
 * `trustProxy` for an app only its proxies may reach: `untrusted:
 * 'refuse-all'` answers 403 every request from a connection the ranges, the
 * function or the secret do not name, forwarding headers or not, but for
 * what `allow` lets through — a health probe's path, a loopback peer —
 * whose headers are not read and whose `ctx.ip` is the connection's. A hop
 * count needs a `secret`: it cannot tell a proxy.
 */
export type StrictProxyOptions = ProxyOptionsBase & {
	readonly untrusted: 'refuse-all';
	/**
	 * What passes from another connection: peers by CIDR range or address,
	 * or a test of the request and the peer's address (`undefined` with no
	 * server). Nothing by default.
	 */
	readonly allow?: ProxyAllow;
} & (
		| {
				readonly trusted: Exclude<TrustedProxies, number>;
				readonly secret?: ProxySecret;
		  }
		| { readonly trusted: TrustedProxies; readonly secret: ProxySecret }
	);

/** Marks a `ProxyTrust` that refuses every connection but the proxies', which `listen` reads. */
export const REFUSES_ALL = Symbol.for('alxia.proxy.refusesAll');

/** The options `proxyReader` reads, whichever of `trustProxy`'s forms gave them. */
type ReaderOptions = ProxyOptionsBase & {
	readonly trusted: TrustedProxies;
	readonly secret?: ProxySecret | undefined;
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
	const secret =
		options.secret === undefined
			? undefined
			: secretOf(options.secret, who, header);
	const gate = gateOf(options, trust, header, secret?.header, who);
	const named = secret === undefined ? {} : { secretHeader: secret.header };
	const read = header === 'forwarded' ? fromForwarded : fromLists(header);
	const shown = (ip: ParsedIp) => (canonical ? canonicalOf(ip) : ip.text);
	return (request, server) => {
		const socket = server?.requestIP(request)?.address ?? undefined;
		const peer = socket === undefined ? undefined : parseIp(socket);
		const ownOf = () => {
			if (socket === undefined || !canonical) return socket;
			return peer === undefined ? canonicalIp(socket) : canonicalOf(peer);
		};
		const believed =
			peerTrusted(trust, peer) &&
			(secret === undefined || secret.judge(request.headers) === 'right');
		if (!believed) {
			const own = ownOf();
			const refusal = gate(request, peer, own);
			if (refusal === undefined)
				return { ip: own, origin: NONE, refused: false, ...named };
			return { ip: own, origin: NONE, refused: true, refusal, ...named };
		}
		const { at, origin } = read(request.headers, trust, withOrigin);
		return {
			ip: at === undefined ? ownOf() : shown(at),
			origin,
			refused: false,
			...named,
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
 * alxia({ proxy: trustProxy({ trusted: 2, secret: { header: 'x-app-proxy-secret', value: env.PROXY_SECRET }, untrusted: 'refuse' }) });
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
