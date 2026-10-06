/**
 * How `trustProxy` reads the client's address, the scheme and the host out
 * of a request's forwarding headers: `Forwarded` (RFC 7239), or a list of
 * addresses with the `X-Forwarded-*` scheme and host.
 */
import { elementsOf, listOf } from './forwarded-header';
import { type ParsedIp, parseIp } from './ip-address';
import { hostOf, type Origin, protocolOf } from './origin';
import { type ClientAt, clientAt, type Trust } from './trust';

/** An origin the proxies said nothing of. */
export const NONE: Origin = {};

export type Reader = (
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
export const fromForwarded: Reader = (headers, trust, withOrigin) => {
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
export function fromLists(header: string): Reader {
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
