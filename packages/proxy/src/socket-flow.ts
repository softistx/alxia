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
 * and one frame, per direction. The slow side, which reads nothing, may
 * never take the close frame queued behind the rest: past a grace, its
 * connection is cut, so what Bun buffered for it is freed.
 */
import { OVERLOADED_CLOSE } from './socket-close';
import type { Relay } from './socket-relay';

/** The default `maxBuffered`: 1 MiB per direction. */
export const MAX_BUFFERED = 1024 * 1024;

/** Milliseconds a side closed for being slow has to take its close frame, before its connection is cut. */
const CLOSE_GRACE = 1_000;

/** A frame as the upstream socket sends it. */
export type Frame = string | Uint8Array<ArrayBuffer>;

/**
 * What Bun's client socket adds to the DOM's (Bun 1.4): reads it can
 * pause, and a cut. On a Bun without `pause`, the cap alone holds.
 */
interface BunWebSocket {
	pause?(): boolean;
	resume?(): boolean;
	terminate?(): void;
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
	else if (sent === -1 && !relay.paused) {
		relay.paused = (upstream as BunWebSocket).pause?.() === true;
	}
}

/** The client read what was queued for it: the upstream is read again once the queue is back under half the cap. */
export function drained(relay: Relay): void {
	const { client, upstream } = relay;
	if (client === undefined || !relay.paused) return;
	if (client.raw.getBufferedAmount() <= relay.maxBuffered / 2) {
		relay.paused = false;
		(upstream as BunWebSocket).resume?.();
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

/**
 * Closes both sides with 1013, one of them reading slower than the other
 * sends, and cuts the slow one past the grace.
 */
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
	const cut =
		reason === 'client too slow'
			? () => client?.raw.terminate()
			: () => (upstream as BunWebSocket).terminate?.();
	setTimeout(cut, CLOSE_GRACE).unref();
}

/** The bytes of `frame` on the wire, its text as UTF-8. */
export function sizeOf(frame: Frame): number {
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
