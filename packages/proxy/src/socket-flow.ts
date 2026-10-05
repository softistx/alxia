/**
 * The flow between a relay's two sockets, with backpressure both ways.
 *
 * Toward the client, Bun's `ServerWebSocket.send` answers -1 when the frame
 * was queued behind what the client has not read yet: the upstream socket
 * is paused — Bun stops reading it, so the upstream feels TCP backpressure
 * — until the client's `drain` finds its queue back under half the cap.
 * Toward the upstream, Bun's server socket cannot be paused (no `pause` in
 * Bun 1.4), so what the client sends is queued in the upstream socket's
 * `bufferedAmount`, up to the cap.
 *
 * Either way, a frame for a side whose queue already holds more than
 * `maxBuffered` bytes — or one Bun dropped — closes both sides with 1013
 * (try again later) rather than queue it: memory stays bounded by the cap
 * and one frame, per direction.
 */
import type { Socket } from '@alxia/core';
import type { Plan, ProxyContext } from './options';

/** The default `maxBuffered`: 1 MiB per direction. */
export const MAX_BUFFERED = 1024 * 1024;

/** The close code of a relay past its cap: 1013, try again later. */
export const OVERLOADED_CLOSE = 1013;

/**
 * The frames the upstream may send before the client's socket opens — a
 * count; `maxBuffered` bounds their bytes. Past either, a close with 1013.
 */
const PENDING = 1024;

/** A frame as the upstream socket sends it. */
export type Frame = string | Uint8Array<ArrayBuffer>;

type ClientSocket = Socket<ProxyContext<unknown>, unknown>;

export interface Relay {
	readonly upstream: WebSocket;
	readonly maxBuffered: number;
	/** The client's socket, once open. */
	client?: ClientSocket;
	/** What the upstream sent before the client's socket opened. */
	readonly pending: Frame[];
	/** The bytes in `pending`. */
	pendingBytes: number;
	/** How the upstream closed, when it did before the client's socket opened. */
	ended?: readonly [code: number, reason: string];
	/** Undoes what watches the client between the upgrade and its socket's open. */
	settle?: (() => void) | undefined;
}

/**
 * Bun's client socket pauses its reads (Bun 1.4); the DOM's type does not
 * say so. On a Bun without them, the cap alone holds.
 */
interface Pausable {
	pause?(): boolean;
	resume?(): boolean;
	readonly isPaused?: boolean;
}

/**
 * The relay of an open `upstream` to the client's socket, which opens
 * next: what the upstream sends is queued until then, and the upstream is
 * closed if the client goes away first, or if its socket never opens
 * within `timeout`.
 */
export function relay(
	plan: Plan,
	ctx: ProxyContext,
	upstream: WebSocket,
	maxBuffered: number,
): Relay {
	const relay: Relay = { upstream, maxBuffered, pending: [], pendingBytes: 0 };
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
		if (relay.client !== undefined) toClient(relay, frame);
		else queue(relay, frame);
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

/** Keeps `frame` for the client's open, within the count and the cap. */
function queue(relay: Relay, frame: Frame): void {
	relay.pendingBytes += sizeOf(frame);
	if (
		relay.pending.length < PENDING &&
		relay.pendingBytes <= relay.maxBuffered
	) {
		relay.pending.push(frame);
	} else {
		relay.upstream.close(OVERLOADED_CLOSE, 'client not open yet');
	}
}

/** Sends `frame` to the client, pausing the upstream when the client is behind. */
export function toClient(relay: Relay, frame: Frame): void {
	const { client, upstream } = relay;
	if (client === undefined || client.raw.readyState !== WebSocket.OPEN) return;
	// -1: queued behind what the client has not read; 0: dropped, past Bun's own `backpressureLimit`.
	const sent =
		client.raw.getBufferedAmount() > relay.maxBuffered
			? 0
			: client.raw.send(frame);
	if (sent === 0) overloaded(relay, 'client too slow');
	else if (sent === -1) (upstream as Pausable).pause?.();
}

/** The client read what was queued for it: the upstream is read again once the queue is back under half the cap. */
export function drained(relay: Relay): void {
	const { client, upstream } = relay;
	const pausable = upstream as Pausable;
	if (client === undefined || pausable.isPaused !== true) return;
	if (client.raw.getBufferedAmount() <= relay.maxBuffered / 2) {
		pausable.resume?.();
	}
}

/** Sends `frame` to the upstream, unless its queue is already past the cap. */
export function toUpstream(relay: Relay, frame: Frame): void {
	const { upstream } = relay;
	if (upstream.readyState !== WebSocket.OPEN) return;
	if (upstream.bufferedAmount > relay.maxBuffered) {
		overloaded(relay, 'upstream too slow');
	} else {
		upstream.send(frame);
	}
}

/** Closes both sides with 1013: one of them reads slower than the other sends. */
function overloaded(relay: Relay, reason: string): void {
	const { client, upstream } = relay;
	if (client !== undefined && client.raw.readyState === WebSocket.OPEN) {
		client.close(OVERLOADED_CLOSE, reason);
	}
	if (
		upstream.readyState === WebSocket.OPEN ||
		upstream.readyState === WebSocket.CONNECTING
	) {
		upstream.close(OVERLOADED_CLOSE, reason);
	}
}

/** The bytes of `frame` on the wire, its text as UTF-8. */
function sizeOf(frame: Frame): number {
	return typeof frame === 'string'
		? Buffer.byteLength(frame)
		: frame.byteLength;
}

/** Checks `maxBuffered` once, where the relay is declared. */
export function maxBufferedOf(
	where: string,
	value: number | undefined,
): number {
	const max = value ?? MAX_BUFFERED;
	if (!(Number.isSafeInteger(max) && max > 0)) {
		throw new TypeError(
			`${where}: maxBuffered must be a whole number of bytes above 0; got ${String(value)}`,
		);
	}
	return max;
}

/**
 * A close code a peer may send: 1000-1003, 1007-1014 and 3000-4999. 1005
 * (no code) closes with 1000; any other — 1006 and 1015, reserved for what
 * a socket reports, or one no peer may send — with 1011.
 */
export function sendable(code: number): number {
	if (code === 1005) return 1000;
	const valid =
		(code >= 1000 && code <= 1003) ||
		(code >= 1007 && code <= 1014) ||
		(code >= 3000 && code <= 4999);
	return valid ? code : 1011;
}
