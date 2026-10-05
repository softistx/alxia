/**
 * The headers on each side of the proxy: the hop-by-hop ones stripped
 * (RFC 9110 §7.6.1), the forwarding ones set, `Host` chosen, then the
 * app's own edits.
 */
import type { HeaderEdit, Plan, ProxyContext } from './options';

/** Headers that describe one connection, never forwarded. */
const HOP_BY_HOP = [
	'connection',
	'keep-alive',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
];

/**
 * Removes the hop-by-hop headers from `headers`: the fixed list, every
 * `proxy-*` header, and every header the `Connection` header names.
 */
export function stripHopByHop(headers: Headers): void {
	const named = headers.get('connection');
	if (named !== null) {
		for (const name of named.split(',')) {
			const trimmed = name.trim();
			if (trimmed !== '') headers.delete(trimmed);
		}
	}
	for (const name of HOP_BY_HOP) headers.delete(name);
	const proxied: string[] = [];
	headers.forEach((_, name) => {
		if (name.startsWith('proxy-')) proxied.push(name);
	});
	for (const name of proxied) headers.delete(name);
}

/** The headers the upstream receives for `ctx`'s request. */
export function requestHeaders(
	plan: Plan,
	ctx: ProxyContext,
	request: Request,
): Headers {
	const headers = new Headers(request.headers);
	stripHopByHop(headers);
	const host = request.headers.get('host') ?? ctx.url.host;
	const proto = ctx.url.protocol.slice(0, -1);
	const client = clientOf(ctx);
	if (plan.xForwarded) {
		if (client !== undefined) {
			const prior = headers.get('x-forwarded-for');
			headers.set(
				'x-forwarded-for',
				prior === null || prior.trim() === '' ? client : `${prior}, ${client}`,
			);
		}
		if (!(plan.trustForwarded && headers.has('x-forwarded-proto'))) {
			headers.set('x-forwarded-proto', proto);
		}
		if (!(plan.trustForwarded && headers.has('x-forwarded-host'))) {
			headers.set('x-forwarded-host', host);
		}
	}
	if (plan.forwarded) {
		const element = forwardedElement(client, host, proto);
		const prior = headers.get('forwarded');
		headers.set('forwarded', prior === null ? element : `${prior}, ${element}`);
	}
	headers.set('host', plan.preserveHost ? host : plan.target.host);
	return headers;
}

/** The address of the peer that sent the request: the socket's, else the app's `ip`. */
function clientOf(ctx: ProxyContext): string | undefined {
	try {
		const address = ctx.server?.requestIP(ctx.request)?.address;
		if (address) return unmapped(address);
	} catch {
		// A request the server did not receive itself: read the app's `ip`.
	}
	return ctx.ip === undefined ? undefined : unmapped(ctx.ip);
}

/** An IPv4 address mapped into IPv6 (`::ffff:10.0.0.1`), as IPv4. */
function unmapped(address: string): string {
	return address.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
}

/** One RFC 7239 element: `for`, `host` and `proto`, quoted where the grammar asks. */
function forwardedElement(
	client: string | undefined,
	host: string,
	proto: string,
): string {
	const parts: string[] = [];
	if (client !== undefined) {
		parts.push(`for=${client.includes(':') ? `"[${client}]"` : client}`);
	}
	parts.push(`host=${quoted(host)}`, `proto=${proto}`);
	return parts.join(';');
}

function quoted(value: string): string {
	return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value)
		? value
		: `"${value.replace(/["\\]/g, '\\$&')}"`;
}

/** Applies `edit` to `headers`: header by header, or through the function. */
export function applyEdit<Ctx>(
	headers: Headers,
	edit: HeaderEdit<Ctx> | undefined,
	ctx: ProxyContext<Ctx>,
): void {
	if (edit === undefined) return;
	if (typeof edit === 'function') {
		edit(headers, ctx);
		return;
	}
	for (const [name, rule] of Object.entries(edit)) {
		const value = typeof rule === 'function' ? rule(ctx) : rule;
		if (value === undefined) continue;
		if (value === null) headers.delete(name);
		else headers.set(name, value);
	}
}
