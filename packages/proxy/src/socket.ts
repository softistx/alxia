/**
 * A socket route relayed to an upstream WebSocket: behind the route's
 * middlewares, core's `upgrade` handler opens the upstream first — a 502
 * or a 504 over HTTP when it cannot — and the `101` names the subprotocol
 * it chose. Then each frame goes across as it came — text as text, binary
 * as binary — with backpressure both ways (`socket-flow.ts`), and a close
 * on either side closes the other with the same code and reason.
 */
import type { SocketHandlers } from '@alxia/core';
import type { ProxyOptions } from './options';
import { type Plan, type ProxyContext, planOf } from './options';
import {
	drained,
	type Frame,
	maxBufferedOf,
	type Relay,
	relay,
	sendable,
	toClient,
	toUpstream,
} from './socket-flow';
import { openUpstream } from './socket-upstream';

export { OVERLOADED_CLOSE } from './socket-flow';

/** What `proxy.ws` takes: the request side of `ProxyOptions`. */
export type SocketProxyOptions<Ctx = unknown> = Omit<
	ProxyOptions<Ctx>,
	'rebase' | 'bodyLimit' | 'headers'
> & {
	readonly headers?: Pick<NonNullable<ProxyOptions<Ctx>['headers']>, 'request'>;
	/**
	 * The most bytes queued for one side, per direction, before a frame for
	 * it closes both with 1013: 1 MiB by default. Keep it above the largest
	 * frame.
	 */
	readonly maxBuffered?: number;
};

/** The handlers `proxy.ws` makes: given to `app.ws(path, ...middlewares, handlers)`. */
export type SocketProxy<Ctx = unknown> = SocketHandlers<
	ProxyContext<Ctx>,
	unknown,
	string | Uint8Array
>;

/**
 * The close code `proxy.ws` sent a client when the upstream could not be
 * reached, 1014, bad gateway.
 *
 * @deprecated The upstream is now opened before the upgrade: one that
 * cannot be reached answers a 502 (a 504 past `timeout`) over HTTP, and no
 * socket opens. Nothing sends this code any more.
 */
export const BAD_GATEWAY_CLOSE = 1014;

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
	const maxBuffered = maxBufferedOf('proxy.ws()', options.maxBuffered);
	// Keyed by the context, which is the socket's `data` once it opens.
	const relays = new WeakMap<object, Relay>();
	return {
		async upgrade(ctx, headers) {
			const upstream = await openUpstream(plan, ctx);
			if (upstream.protocol !== '') {
				headers.set('sec-websocket-protocol', upstream.protocol);
			}
			relays.set(ctx, relay(plan as Plan, ctx, upstream, maxBuffered));
		},
		open(socket) {
			const relay = relays.get(socket.data);
			if (relay === undefined) return;
			relay.settle?.();
			relay.client = socket as NonNullable<Relay['client']>;
			for (const frame of relay.pending.splice(0)) toClient(relay, frame);
			relay.pendingBytes = 0;
			if (relay.ended !== undefined) socket.close(...relay.ended);
		},
		message(socket, message) {
			const relay = relays.get(socket.data);
			if (relay !== undefined) toUpstream(relay, message as Frame);
		},
		drain(socket) {
			const relay = relays.get(socket.data);
			if (relay !== undefined) drained(relay);
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
