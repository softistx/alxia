/**
 * A socket route relayed to an upstream WebSocket: core's `ws()` upgrades
 * the client, behind the route's middlewares, then each frame goes across
 * as it came — text as text, binary as binary — and a close on either side
 * closes the other with the same code and reason.
 */
import type { Socket, SocketHandlers } from '@alxia/core';
import { applyEdit, requestHeaders } from './headers';
import type { ProxyOptions } from './options';
import { type Plan, type ProxyContext, planOf } from './options';
import { upstreamUrl } from './upstream-url';

/** What `proxy.ws` takes: the request side of `ProxyOptions`. */
export type SocketProxyOptions<Ctx = unknown> = Omit<
	ProxyOptions<Ctx>,
	'rebase' | 'bodyLimit' | 'headers'
> & {
	readonly headers?: Pick<NonNullable<ProxyOptions<Ctx>['headers']>, 'request'>;
};

/** The handlers `proxy.ws` makes: given to `app.ws(path, ...middlewares, handlers)`. */
export type SocketProxy<Ctx = unknown> = SocketHandlers<
	ProxyContext<Ctx>,
	unknown,
	string | Uint8Array
>;

/** The frames a client may send before the upstream opens; past them, a close with 1013. */
const PENDING = 1024;

/** The close code a client gets when the upstream cannot be reached: 1014, bad gateway. */
export const BAD_GATEWAY_CLOSE = 1014;

/** Headers the upgrade carries for the client's handshake alone. */
const HANDSHAKE = [
	'sec-websocket-key',
	'sec-websocket-version',
	'sec-websocket-extensions',
	'sec-websocket-accept',
	'sec-websocket-protocol',
];

/** A frame as the upstream socket sends it. */
type Frame = string | Uint8Array<ArrayBuffer>;

interface Relay {
	readonly upstream: WebSocket;
	/** What the client sent before the upstream opened. */
	readonly pending: Frame[];
}

/** The relay handlers for `target`, checked once. */
export function socketProxy<Ctx>(
	target: string | URL,
	options: SocketProxyOptions<Ctx> = {},
): SocketProxy<Ctx> {
	const plan = planOf<Ctx>('proxy.ws()', target, options, [
		'ws:',
		'wss:',
		'http:',
		'https:',
	]);
	const relays = new WeakMap<object, Relay>();
	return {
		open(socket) {
			const relay = connect(plan, socket);
			relays.set(socket.raw, relay);
		},
		message(socket, message) {
			const relay = relays.get(socket.raw);
			if (relay === undefined) return;
			if (relay.upstream.readyState === WebSocket.OPEN) {
				relay.upstream.send(message as Frame);
			} else if (relay.pending.length < PENDING) {
				relay.pending.push(message as Frame);
			} else socket.close(1013, 'upstream not open yet');
		},
		close(socket, code, reason) {
			const relay = relays.get(socket.raw);
			relays.delete(socket.raw);
			if (relay === undefined) return;
			const { upstream } = relay;
			if (
				upstream.readyState === WebSocket.OPEN ||
				upstream.readyState === WebSocket.CONNECTING
			) {
				upstream.close(sendable(code), reason);
			}
		},
	};
}

/** Opens the upstream socket for `socket`, and relays what it sends back. */
function connect<Ctx>(
	plan: Plan<Ctx>,
	socket: Socket<ProxyContext<Ctx>, unknown>,
): Relay {
	const ctx = socket.data;
	const url = upstreamUrl(plan as Plan, ctx.url);
	url.protocol =
		url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
	const headers = requestHeaders(plan as Plan, ctx, ctx.request);
	for (const name of HANDSHAKE) headers.delete(name);
	applyEdit(headers, plan.headers.request, ctx);
	const protocols = ctx.request.headers.get('sec-websocket-protocol');
	const upstream = new WebSocket(url.href, {
		headers: Object.fromEntries(headers),
		...(protocols === null
			? {}
			: { protocols: protocols.split(',').map((p) => p.trim()) }),
	} as unknown as string[]);
	upstream.binaryType = 'arraybuffer';
	const relay: Relay = { upstream, pending: [] };
	let opened = false;
	// An upstream that takes the connection and never completes the
	// handshake: closed past `timeout`, which the client sees as 1014.
	const late = setTimeout(() => upstream.close(), plan.timeout);
	upstream.addEventListener('open', () => {
		opened = true;
		clearTimeout(late);
		for (const message of relay.pending.splice(0)) upstream.send(message);
	});
	upstream.addEventListener('message', (event) => {
		const { data } = event as MessageEvent<string | ArrayBuffer>;
		socket.raw.send(typeof data === 'string' ? data : new Uint8Array(data));
	});
	upstream.addEventListener('close', (event) => {
		clearTimeout(late);
		const code = opened ? sendable(event.code) : BAD_GATEWAY_CLOSE;
		const reason = opened ? event.reason : 'bad gateway';
		if (socket.raw.readyState === WebSocket.OPEN) socket.close(code, reason);
	});
	return relay;
}

/**
 * A close code a peer may send: 1000-1003, 1007-1014 and 3000-4999. 1005
 * (no code) closes with 1000; any other — 1006 and 1015, reserved for what
 * a socket reports, or one no peer may send — with 1011.
 */
function sendable(code: number): number {
	if (code === 1005) return 1000;
	const valid =
		(code >= 1000 && code <= 1003) ||
		(code >= 1007 && code <= 1014) ||
		(code >= 3000 && code <= 4999);
	return valid ? code : 1011;
}
