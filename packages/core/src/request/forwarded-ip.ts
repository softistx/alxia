import { type ParsedIp, parseCidr, parseIp } from './ip-address';

/** Which proxies to believe: a number of hops, CIDR ranges or addresses, or a test of an address. */
export type TrustedProxies =
	| number
	| string
	| readonly string[]
	| ((address: string) => boolean);

export interface ForwardedIpOptions {
	/** The header the proxy appends to: `x-forwarded-for` (the default), `forwarded` (RFC 7239), or another one that lists addresses. */
	readonly header?: string;
	/**
	 * The proxies in front of the app. A number is how many there are: the
	 * client is the entry that many places from the right. CIDR ranges or a
	 * function name the proxies by address: the header is read only from a
	 * connection of one, and the client is the first entry from the right
	 * that is not one.
	 */
	readonly trusted: TrustedProxies;
}

type Server = Bun.Server<unknown> | undefined;

/** The addresses a header lists, left to right; `undefined` for an entry that is no address. */
function entriesOf(value: string, header: string): (ParsedIp | undefined)[] {
	if (header !== 'forwarded') return value.split(',').map(parseIp);
	return value.split(',').map((element) => {
		for (const pair of element.split(';')) {
			const at = pair.indexOf('=');
			if (at < 0 || pair.slice(0, at).trim().toLowerCase() !== 'for') continue;
			return parseIp(
				pair
					.slice(at + 1)
					.trim()
					.replace(/^"(.*)"$/, '$1'),
			);
		}
		return undefined;
	});
}

function testOf(
	trusted: string | readonly string[] | ((a: string) => boolean),
) {
	if (typeof trusted === 'function')
		return (address: ParsedIp) => trusted(address.text);
	const ranges = (typeof trusted === 'string' ? [trusted] : trusted).map(
		parseCidr,
	);
	return (address: ParsedIp) => ranges.some((inRange) => inRange(address));
}

/** The client among the entries, or `undefined` when they do not name it. */
function readerOf(trusted: TrustedProxies) {
	if (typeof trusted === 'number')
		return (entries: readonly (ParsedIp | undefined)[]) =>
			entries[entries.length - trusted];
	const isProxy = testOf(trusted);
	return (
		entries: readonly (ParsedIp | undefined)[],
		peer: ParsedIp | undefined,
	) => {
		if (peer === undefined || !isProxy(peer)) return undefined;
		for (let at = entries.length - 1; at >= 0; at--) {
			const entry = entries[at];
			if (entry === undefined || !isProxy(entry) || at === 0) return entry;
		}
		return peer;
	};
}

/**
 * The `ip` option for an app behind proxies: the client's address from a
 * header the proxies append to, which only the entries they wrote can be
 * believed in. The leftmost entry is what the client wrote, so it is never
 * the one read: `trusted: 1` takes the last entry, the one the single
 * proxy appended; `trusted: ['10.0.0.0/8']` the first entry from the right
 * that is not in the range. Without the header, from a connection no
 * trusted range holds, with fewer entries than hops, or when the entry
 * chosen is no address, the connection's address.
 *
 * @example
 * alxia({ ip: forwardedIp({ trusted: 1 }) });
 * alxia({ ip: forwardedIp({ header: 'forwarded', trusted: ['10.0.0.0/8'] }) });
 */
export function forwardedIp(
	options: ForwardedIpOptions,
): (request: Request, server: Server) => string | undefined {
	const { trusted } = options;
	const header = (options.header ?? 'x-forwarded-for').toLowerCase();
	if (
		typeof trusted === 'number' &&
		(!Number.isInteger(trusted) || trusted < 1)
	)
		throw new Error(
			'forwardedIp: trusted hops must be an integer of 1 or more',
		);
	const read = readerOf(trusted);
	return (request, server) => {
		const socket = server?.requestIP(request)?.address;
		const value = request.headers.get(header);
		if (value === null) return socket;
		const peer = socket === undefined ? undefined : parseIp(socket);
		return read(entriesOf(value, header), peer)?.text ?? socket;
	};
}
