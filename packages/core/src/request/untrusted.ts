/**
 * What `trustProxy` does with a request from a connection that is no
 * trusted proxy: read none of its headers (`'ignore'`), refuse it when it
 * carries one (`'refuse'`), or refuse it whatever it carries
 * (`'refuse-all'`), but for what `allow` lets through.
 */
import { type ParsedIp, parseCidr } from './ip-address';
import type { Trust } from './trust';

/** What a request from a connection that is no trusted proxy gets. */
export type Untrusted = 'ignore' | 'refuse' | 'refuse-all';

/**
 * What `untrusted: 'refuse-all'` lets through from a connection that is no
 * trusted proxy, its forwarding headers unread: peers by CIDR range or
 * address (`'127.0.0.1'`, `'10.0.0.0/8'`), or a test of the request and the
 * peer's address, as `ctx.ip` would show it (`undefined` with no server).
 */
export type ProxyAllow =
	| string
	| readonly string[]
	| ((request: Request, peer: string | undefined) => boolean);

/** Why a request is refused: forwarding headers from an untrusted connection, or the connection itself. */
export type ProxyRefusal = 'headers' | 'peer';

/** The headers a request from an untrusted connection is refused for carrying. */
const FORWARDING = [
	'forwarded',
	'x-forwarded-for',
	'x-forwarded-host',
	'x-forwarded-proto',
];

/** What the gate is given: the options it reads. */
export interface GateOptions {
	readonly untrusted?: unknown;
	readonly allow?: unknown;
}

/** A request from an untrusted connection, judged: why it is refused, or `undefined` when it passes. */
export type Gate = (
	request: Request,
	peer: ParsedIp | undefined,
	shown: string | undefined,
) => ProxyRefusal | undefined;

function untrustedOf(
	options: GateOptions,
	trust: Trust,
	who: string,
): Untrusted {
	const untrusted = options.untrusted ?? 'ignore';
	if (
		untrusted !== 'ignore' &&
		untrusted !== 'refuse' &&
		untrusted !== 'refuse-all'
	)
		throw new TypeError(
			`${who}: untrusted must be 'ignore', 'refuse' or 'refuse-all', not ${JSON.stringify(untrusted)}`,
		);
	if (untrusted !== 'ignore' && 'hops' in trust)
		throw new TypeError(
			`${who}: untrusted: '${untrusted}' needs the proxies named by address (CIDR ranges or a function), not a hop count`,
		);
	return untrusted;
}

/** `allow`, checked and compiled once: under `'refuse-all'` alone. */
function allowOf(
	options: GateOptions,
	untrusted: Untrusted,
	who: string,
): (
	request: Request,
	peer: ParsedIp | undefined,
	shown: string | undefined,
) => boolean {
	const { allow } = options;
	if (allow === undefined) return () => false;
	if (untrusted !== 'refuse-all')
		throw new TypeError(
			`${who}: allow is for untrusted: 'refuse-all' alone; under '${untrusted}' a request with no forwarding header passes already`,
		);
	if (typeof allow === 'function') {
		const test = allow as (
			request: Request,
			peer: string | undefined,
		) => unknown;
		// A test that throws lets nothing through: refusing fails closed.
		return (request, _, shown) => {
			try {
				return test(request, shown) === true;
			} catch {
				return false;
			}
		};
	}
	const list = typeof allow === 'string' ? [allow] : allow;
	if (!Array.isArray(list) || list.some((range) => typeof range !== 'string'))
		throw new TypeError(
			`${who}: allow must be CIDR ranges or a function (request, peer) => boolean`,
		);
	const ranges = list.map((range: string) => parseCidr(range, who));
	return (_, peer) =>
		peer !== undefined && ranges.some((inRange) => inRange(peer));
}

/** `untrusted` and `allow` checked once; what they make of a request from an untrusted connection. */
export function gateOf(
	options: GateOptions,
	trust: Trust,
	header: string,
	who: string,
): Gate {
	const untrusted = untrustedOf(options, trust, who);
	const allowed = allowOf(options, untrusted, who);
	if (untrusted === 'ignore') return () => undefined;
	if (untrusted === 'refuse-all')
		return (request, peer, shown) =>
			allowed(request, peer, shown) ? undefined : 'peer';
	const refusing = [...FORWARDING, header];
	return (request) =>
		refusing.some((name) => request.headers.has(name)) ? 'headers' : undefined;
}
