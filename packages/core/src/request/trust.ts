/**
 * Which proxies to believe, and where the client stands among the entries
 * of a header they append to: what `forwardedIp` and `trustProxy` share.
 */
import { canonicalOf, type ParsedIp, parseCidr } from './ip-address';

/** Which proxies to believe: a number of hops, CIDR ranges or addresses, or a test of an address. */
export type TrustedProxies =
	| number
	| string
	| readonly string[]
	| ((address: string) => boolean);

/** The proxies, as a request reads them: a count, or a test of an address. */
export type Trust =
	| { readonly hops: number }
	| { readonly isProxy: (address: ParsedIp) => boolean };

/**
 * Where the client stands in a header's entries, as the trusted proxies
 * wrote them: `at`, the index of its entry (`-1`, none: the connection's
 * peer is the client, or no entry names it), and `hops`, how many proxies
 * appended to the header, the entries right of the client's.
 */
export interface ClientAt {
	readonly at: number;
	readonly hops: number;
}

/**
 * `trusted` checked and compiled once; `who` names the caller in what it
 * throws. A function is given the address as `ctx.ip` would show it: its
 * canonical text, or, with `canonical` false, as written.
 */
export function trustOf(
	trusted: TrustedProxies,
	who: string,
	canonical = true,
): Trust {
	if (typeof trusted === 'number') {
		if (!Number.isInteger(trusted) || trusted < 1)
			throw new Error(`${who}: trusted hops must be an integer of 1 or more`);
		return { hops: trusted };
	}
	if (typeof trusted === 'function')
		return {
			isProxy: (address) =>
				trusted(canonical ? canonicalOf(address) : address.text),
		};
	const ranges = (typeof trusted === 'string' ? [trusted] : trusted).map(
		(range) => parseCidr(range, who),
	);
	return { isProxy: (address) => ranges.some((inRange) => inRange(address)) };
}

/**
 * Whether the connection's peer is a proxy to believe: always under a
 * hop count, which cannot tell; under ranges or a test, only a peer they
 * name — never one of unknown address.
 */
export function peerTrusted(trust: Trust, peer: ParsedIp | undefined): boolean {
	if ('hops' in trust) return true;
	return peer !== undefined && trust.isProxy(peer);
}

/**
 * Where the client stands among `entries`, from a trusted peer. A count is
 * the entry that many places from the right; ranges or a test walk from
 * the right past the proxies they name, and stop at the first entry that
 * is not one, or is no address, or is the leftmost.
 */
export function clientAt(
	trust: Trust,
	entries: readonly (ParsedIp | undefined)[],
): ClientAt {
	if ('hops' in trust)
		return { at: entries.length - trust.hops, hops: trust.hops };
	for (let at = entries.length - 1; at >= 0; at--) {
		const entry = entries[at];
		if (entry === undefined || !trust.isProxy(entry) || at === 0)
			return { at, hops: entries.length - at };
	}
	return { at: -1, hops: 1 };
}
