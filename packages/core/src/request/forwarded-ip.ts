import type { TrustedProxies } from './trust';
import { proxyReader } from './trust-proxy';

export type { TrustedProxies } from './trust';

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

/**
 * The `ip` option for an app behind proxies: the client's address from a
 * header the proxies append to, which only the entries they wrote can be
 * believed in. What stands left of those, what the client wrote, is never
 * read: `trusted: 1` takes the last entry, the one the single
 * proxy appended; `trusted: ['10.0.0.0/8']` the first entry from the right
 * that is not in the range. Without the header, from a connection no
 * trusted range holds, with fewer entries than hops, or when the entry
 * chosen is no address, the connection's address. `trustProxy`, the
 * `proxy` option, reads the same address, and the scheme and host the
 * client asked for besides.
 *
 * @example
 * alxia({ ip: forwardedIp({ trusted: 1 }) });
 * alxia({ ip: forwardedIp({ header: 'forwarded', trusted: ['10.0.0.0/8'] }) });
 */
export function forwardedIp(
	options: ForwardedIpOptions,
): (
	request: Request,
	server: Bun.Server<unknown> | undefined,
) => string | undefined {
	const read = proxyReader(
		{
			trusted: options.trusted,
			...(options.header === undefined ? {} : { header: options.header }),
		},
		'forwardedIp',
		false,
	);
	return (request, server) => read(request, server).ip;
}
