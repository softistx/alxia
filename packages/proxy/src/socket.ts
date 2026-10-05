/**
 * A socket route relayed to an upstream WebSocket: behind the route's
 * middlewares, core's `upgrade` handler opens the upstream first — a 502
 * or a 504 over HTTP when it cannot — and the `101` names the subprotocol
 * it chose. Then each frame goes across as it came — text as text, binary
 * as binary — and a close on either side closes the other with the same
 * code and reason.
 */
import type { Socket, SocketHandlers } from '@alxia/core';
import type { ProxyOptions } from './options';
import { type Plan, type ProxyContext, planOf } from './options';
import { openUpstream } from './socket-upstream';
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

/** The frames the upstream may send before the client's socket opens; past them, a close with 1013. */
const PENDING = 1024;

/**
 * The close code `proxy.ws` sent a client when the upstream could not be
 * reached, 1014, bad gateway.
 *
 * @deprecated The upstream is now opened before the upgrade: one that
 * cannot be reached answers a 502 (a 504 past `timeout`) over HTTP, and no
 * socket opens. Nothing sends this code any more.
 */
export const BAD_GATEWAY_CLOSE = 1014;

/** A frame as the upstream socket sends it. */
type Frame = string | Uint8Array<ArrayBuffer>;

type ClientSocket = Socket<ProxyContext<unknown>, unknown>;

interface Relay {
	readonly upstream: WebSocket;
	/** The client's socket, once open. */
	client?: ClientSocket;
	/** What the upstream sent before the client's socket opened. */
	readonly pending: Frame[];
	/** How the upstream closed, when it did before the client's socket opened. */
	ended?: readonly [code: number, reason: string];
	/** Undoes what watches the client between the upgrade and its socket's open. */
	settle?: (() => void) | undefined;
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
	// Keyed by the context, which is the socket's `data` once it opens.
	const relays = new WeakMap<object, Relay>();
	return {
		async upgrade(ctx, headers) {
			const upstream = await openUpstream(plan, ctx);
			if (upstream.protocol !== '') {
				headers.set('sec-websocket-protocol', upstream.protocol);
			}
			relays.set(ctx, relay(plan as Plan, ctx, upstream));
		},
		open(socket) {
			const relay = relays.get(socket.data);
			if (relay === undefined) return;
			relay.settle?.();
			relay.client = socket as ClientSocket;
			for (const frame of relay.pending.splice(0)) socket.raw.send(frame);
			if (relay.ended !== undefined) socket.close(...relay.ended);
		},
		message(socket, message) {
			const upstream = relays.get(socket.data)?.upstream;
			if (upstream?.readyState === WebSocket.OPEN) {
				upstream.send(message as Frame);
			}
		},
		close(socket, code, reason) {
			const relay = relays.get(socket.data);
			relays.delete(socket.data);
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

/**
 * The relay of an open `upstream` to the client's socket, which opens
 * next: what the upstream sends is queued until then, and the upstream is
 * closed if the client goes away first, or if its socket never opens
 * within `timeout`.
 */
function relay(plan: Plan, ctx: ProxyContext, upstream: WebSocket): Relay {
	const relay: Relay = { upstream, pending: [] };
	const { signal } = ctx.request;
	const gone = () => upstream.close(1001, 'client gone');
	const orphan = setTimeout(gone, plan.timeout);
	signal.addEventListener('abort', gone, { once: true });
	relay.settle = () => {
		clearTimeout(orphan);
		signal.removeEventListener('abort', gone);
		relay.settle = undefined;
	};
	upstream.addEventListener('message', (event) => {
		const { data } = event as MessageEvent<string | ArrayBuffer>;
		const frame = typeof data === 'string' ? data : new Uint8Array(data);
		if (relay.client !== undefined) relay.client.raw.send(frame);
		else if (relay.pending.length < PENDING) relay.pending.push(frame);
		else upstream.close(1013, 'client not open yet');
	});
	upstream.addEventListener('close', (event) => {
		relay.settle?.();
		const close = [sendable(event.code), event.reason] as const;
		const { client } = relay;
		if (client === undefined) relay.ended = close;
		else if (client.raw.readyState === WebSocket.OPEN) client.close(...close);
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
