/**
 * `trustProxy`: what the proxies in front of the app say of a request —
 * the client's address, the scheme and host it asked for — believed only
 * from a connection the one trust definition names.
 */
import { elementsOf, listOf } from './forwarded-header';
import { type ParsedIp, parseIp } from './ip-address';
import { hostOf, type Origin, protocolOf } from './origin';
import {
	type ClientAt,
	clientAt,
	peerTrusted,
	type Trust,
	type TrustedProxies,
	trustOf,
} from './trust';

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
	 */
	readonly untrusted?: 'ignore' | 'refuse';
}

/** What the proxies say of a request, believed. */
export interface Forwarded {
	/** The client's address; the connection's when the proxies do not name it. */
	readonly ip: string | undefined;
	/** The scheme and host the client asked for, each when a trusted proxy said it and it is valid. */
	readonly origin: Origin;
	/** Whether the request is answered 403: forwarding headers from an untrusted connection, under `untrusted: 'refuse'`. */
	readonly refused: boolean;
}

/** The `proxy` option: what the proxies say of a request, from its connection. */
export type ProxyTrust = (
	request: Request,
	server: Bun.Server<unknown> | undefined,
) => Forwarded;

/** The headers a request from an untrusted connection is refused for carrying. */
const FORWARDING = [
	'forwarded',
	'x-forwarded-for',
	'x-forwarded-host',
	'x-forwarded-proto',
];

const NONE: Origin = {};

type Reader = (
	headers: Headers,
	trust: Trust,
	withOrigin: boolean,
) => { readonly at: ParsedIp | undefined; readonly origin: Origin };

/** The entry `hops` places from the right, or the leftmost when there are fewer: what the outermost proxy wrote. */
function written<T>(entries: readonly T[], client: ClientAt): T | undefined {
	return entries[Math.max(0, entries.length - client.hops)];
}

/**
 * Whether the entries show the request came through the proxies: under a
 * hop count, which checks no connection, only when the entry it names is
 * an address — fewer entries than hops, or one no proxy would write, is a
 * request that may have bypassed them, whose scheme and host are then not
 * read, as its address is not. Ranges and a function checked the peer.
 */
function passed(
	trust: Trust,
	entries: readonly (ParsedIp | undefined)[],
	client: ClientAt,
): boolean {
	return !('hops' in trust) || entries[client.at] !== undefined;
}

function originOf(proto: string | undefined, host: string | undefined) {
	const protocol = protocolOf(proto);
	const name = hostOf(host);
	return {
		...(protocol === undefined ? {} : { protocol }),
		...(name === undefined ? {} : { host: name }),
	};
}

/** `Forwarded`: one element per hop, its `for`, `proto` and `host` together. */
const fromForwarded: Reader = (headers, trust, withOrigin) => {
	const elements = elementsOf(headers.get('forwarded'));
	const entries = elements.map((element) =>
		element.for === undefined ? undefined : parseIp(element.for),
	);
	const client = clientAt(trust, entries);
	if (!withOrigin || !passed(trust, entries, client))
		return { at: entries[client.at], origin: NONE };
	const params = written(elements, client)?.params;
	return {
		at: entries[client.at],
		origin: originOf(params?.get('proto'), params?.get('host')),
	};
};

/** `X-Forwarded-For`, or another list of addresses, and `X-Forwarded-Proto` and `X-Forwarded-Host`. */
function fromLists(header: string): Reader {
	return (headers, trust, withOrigin) => {
		const entries = listOf(headers.get(header)).map(parseIp);
		const client = clientAt(trust, entries);
		if (!withOrigin || !passed(trust, entries, client))
			return { at: entries[client.at], origin: NONE };
		const proto = written(listOf(headers.get('x-forwarded-proto')), client);
		const host = written(listOf(headers.get('x-forwarded-host')), client);
		return { at: entries[client.at], origin: originOf(proto, host) };
	};
}

/** `trustProxy`, or, with `withOrigin` false, the reading `forwardedIp` makes of the address alone. */
export function proxyReader(
	options: TrustProxyOptions,
	who: string,
	withOrigin: boolean,
): ProxyTrust {
	const trust = trustOf(options.trusted, who);
	const header = (options.header ?? 'x-forwarded-for').toLowerCase();
	const untrusted = options.untrusted ?? 'ignore';
	if (untrusted !== 'ignore' && untrusted !== 'refuse')
		throw new TypeError(
			`${who}: untrusted must be 'ignore' or 'refuse', not ${JSON.stringify(untrusted)}`,
		);
	if (untrusted === 'refuse' && 'hops' in trust)
		throw new TypeError(
			`${who}: untrusted: 'refuse' needs the proxies named by address (CIDR ranges or a function), not a hop count`,
		);
	const refusing = untrusted === 'refuse' ? [...FORWARDING, header] : [];
	const read = header === 'forwarded' ? fromForwarded : fromLists(header);
	return (request, server) => {
		const socket = server?.requestIP(request)?.address ?? undefined;
		const peer = socket === undefined ? undefined : parseIp(socket);
		if (!peerTrusted(trust, peer)) {
			const refused = refusing.some((name) => request.headers.has(name));
			return { ip: socket, origin: NONE, refused };
		}
		const { at, origin } = read(request.headers, trust, withOrigin);
		return { ip: at?.text ?? socket, origin, refused: false };
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
 */
export function trustProxy(options: TrustProxyOptions): ProxyTrust {
	return proxyReader(options, 'trustProxy', true);
}
