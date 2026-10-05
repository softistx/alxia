/**
 * The scheme and host a proxy says the client used, checked: anything but
 * `http` or `https`, or but a bare `host[:port]`, says nothing, and the
 * request's own URL stands.
 */
import { parseIp } from './ip-address';

/** The scheme and host the client asked for, as `URL` spells them: `https:`, `example.com:8443`. */
export interface Origin {
	readonly protocol?: 'http:' | 'https:';
	/** The hostname, lowercase, IPv6 in brackets, and its port when one was given. */
	readonly host?: { readonly hostname: string; readonly port: string };
}

/** `http:` or `https:` for a forwarded `http` or `https`, in any case; `undefined` for anything else. */
export function protocolOf(
	value: string | undefined,
): 'http:' | 'https:' | undefined {
	const scheme = value?.trim().toLowerCase();
	return scheme === 'http' || scheme === 'https' ? `${scheme}:` : undefined;
}

const LABEL = '[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?';
const NAME = new RegExp(`^${LABEL}(?:\\.${LABEL})*$`);
const HOST = /^(\[[0-9a-f:.]+\]|[^[\]:]+)(?::([1-9]\d{0,4}))?$/;

/**
 * A forwarded `host[:port]`, lowercase: a name or an IPv4 address the URL
 * parser keeps as written, or an IPv6 address in brackets, and a port from
 * 1 to 65535. `undefined` for anything else: a path, a query, userinfo, a
 * space, a zone id, an empty value.
 */
export function hostOf(
	value: string | undefined,
): { readonly hostname: string; readonly port: string } | undefined {
	const text = value?.trim().toLowerCase();
	if (text === undefined || text.length > 261) return undefined;
	const match = HOST.exec(text);
	const hostname = match?.[1];
	const port = match?.[2] ?? '';
	if (hostname === undefined || Number(port) > 65535) return undefined;
	if (hostname.startsWith('[')) {
		if (parseIp(hostname) === undefined) return undefined;
		if (!URL.canParse(`http://${hostname}/`)) return undefined;
		return { hostname: new URL(`http://${hostname}/`).hostname, port };
	}
	if (hostname.length > 253 || !NAME.test(hostname)) return undefined;
	// A name the URL parser would rewrite — `0x7f.1`, `1.2.3` — is refused, never rewritten.
	if (!URL.canParse(`http://${hostname}/`)) return undefined;
	return new URL(`http://${hostname}/`).hostname === hostname
		? { hostname, port }
		: undefined;
}
