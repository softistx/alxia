/**
 * The upstream side of a socket route: its WebSocket opened before the
 * client is upgraded, with the subprotocols the client offered and the
 * request's headers but the handshake's own, bounded by `timeout`. One that
 * cannot be reached is a 502, one too slow a 504, and a client gone during
 * the connect closes it. What it sends from its open on is held until the
 * relay takes over, so no frame falls between the two.
 */
import { badGateway, gatewayTimeout } from './failures';
import { applyEdit, requestHeaders } from './headers';
import type { Plan, ProxyContext } from './options';
import type { Frame } from './socket-flow';
import { frameOf } from './socket-relay';
import { upstreamUrl } from './upstream-url';

/** Headers the upgrade carries for the client's handshake alone. */
const HANDSHAKE = [
	'sec-websocket-key',
	'sec-websocket-version',
	'sec-websocket-extensions',
	'sec-websocket-accept',
	'sec-websocket-protocol',
];

/** An upstream socket, open. */
export interface OpenUpstream {
	readonly socket: WebSocket;
	/** The frames it sent since its open, until `release`. */
	readonly early: readonly Frame[];
	/** Stops holding its frames: the relay listens from here. */
	release(): void;
}

/**
 * Opens the upstream socket for the upgrade request `ctx`, and resolves to
 * it once open. Rejects with the 502 when it closes before opening, the
 * 504 past `timeout`, or the client's abort reason when the client goes
 * away first; the upstream is closed in each case.
 */
export function openUpstream<Ctx>(
	plan: Plan<Ctx>,
	ctx: ProxyContext<Ctx>,
): Promise<OpenUpstream> {
	const url = upstreamUrl(plan as Plan, ctx.url);
	url.protocol =
		url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
	const { signal } = ctx.request;
	if (signal.aborted) return Promise.reject(signal.reason);
	const headers = requestHeaders(plan as Plan, ctx, ctx.request);
	for (const name of HANDSHAKE) headers.delete(name);
	applyEdit(headers, plan.headers.request, ctx);
	const offered = ctx.request.headers.get('sec-websocket-protocol');
	// Bun's WebSocket takes headers and protocols in one object; the DOM's type does not say so.
	const upstream = new WebSocket(url.href, {
		headers: Object.fromEntries(headers),
		...(offered === null
			? {}
			: { protocols: offered.split(',').map((p) => p.trim()) }),
	} as unknown as string[]);
	upstream.binaryType = 'arraybuffer';
	const early: Frame[] = [];
	const hold = (event: MessageEvent) => early.push(frameOf(event));
	upstream.addEventListener('message', hold);
	const release = () => upstream.removeEventListener('message', hold);
	return new Promise((resolve, reject) => {
		const settle = (error?: unknown) => {
			clearTimeout(late);
			signal.removeEventListener('abort', gone);
			upstream.removeEventListener('open', opened);
			upstream.removeEventListener('close', refused);
			if (error === undefined) {
				return resolve({ socket: upstream, early, release });
			}
			release();
			upstream.close();
			reject(error);
		};
		const opened = () => settle();
		const refused = (event: CloseEvent) =>
			settle(badGateway(url, `closed with ${event.code} before opening`));
		const gone = () => settle(signal.reason);
		const late = setTimeout(
			() => settle(gatewayTimeout(url, plan.timeout)),
			plan.timeout,
		);
		signal.addEventListener('abort', gone, { once: true });
		upstream.addEventListener('open', opened, { once: true });
		upstream.addEventListener('close', refused, { once: true });
	});
}
