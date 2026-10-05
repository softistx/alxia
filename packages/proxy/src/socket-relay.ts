/**
 * One relay's state, from the upstream's open to the client's: what the
 * upstream sends meanwhile is queued, within a count and `maxBuffered`
 * bytes, and the upstream is closed if the client never comes.
 */
import type { Socket } from '@alxia/core';
import type { Plan, ProxyContext } from './options';
import { OVERLOADED_CLOSE, sendable } from './socket-close';
import { type Frame, sizeOf, toClient } from './socket-flow';
import type { OpenUpstream } from './socket-upstream';

/**
 * The frames the upstream may send before the client's socket opens — a
 * count; `maxBuffered` bounds their bytes. Past either, a close with 1013.
 */
const PENDING = 1024;

export interface Relay {
	readonly upstream: WebSocket;
	readonly maxBuffered: number;
	/** The client's socket, once open. */
	client?: Socket<ProxyContext<unknown>, unknown>;
	/** Whether the relay paused the upstream's reads, until the client drains. */
	paused: boolean;
	/** What the upstream sent before the client's socket opened. */
	readonly pending: Frame[];
	/** The bytes in `pending`. */
	pendingBytes: number;
	/** How the client's socket is closed as it opens, when the upstream closed first. */
	ended?: readonly [code: number, reason: string];
	/** Undoes what watches the client between the upgrade and its socket's open. */
	settle?: (() => void) | undefined;
}

/**
 * The relay of an open upstream to the client's socket, which opens next:
 * the frames the upstream sent from its open on are queued until then, and
 * the upstream is closed if the client goes away first, or if its socket
 * never opens within `timeout`.
 */
export function relay(
	plan: Plan,
	ctx: ProxyContext,
	opened: OpenUpstream,
	maxBuffered: number,
): Relay {
	const { socket: upstream } = opened;
	const relay: Relay = {
		upstream,
		maxBuffered,
		paused: false,
		pending: [],
		pendingBytes: 0,
	};
	const { signal } = ctx.request;
	const gone = () => upstream.close(1001, 'client gone');
	const orphan = setTimeout(gone, plan.timeout);
	signal.addEventListener('abort', gone, { once: true });
	relay.settle = () => {
		clearTimeout(orphan);
		signal.removeEventListener('abort', gone);
		relay.settle = undefined;
	};
	// Synchronous from here: no frame comes between the hand-over and the listener.
	opened.release();
	upstream.addEventListener('message', (event) => {
		const frame = frameOf(event as MessageEvent);
		if (relay.client !== undefined) toClient(relay, frame);
		else queue(relay, frame);
	});
	for (const frame of opened.early) queue(relay, frame);
	upstream.addEventListener('close', (event) => {
		relay.settle?.();
		const close = [sendable(event.code), event.reason] as const;
		const { client } = relay;
		if (client === undefined) relay.ended ??= close;
		else if (client.raw.readyState === WebSocket.OPEN) client.close(...close);
	});
	return relay;
}

/** A message of the upstream socket as the frame it relays. */
export function frameOf(event: MessageEvent): Frame {
	const data = event.data as string | ArrayBuffer;
	return typeof data === 'string' ? data : new Uint8Array(data);
}

/** Keeps `frame` for the client's open, within the count and the cap. */
function queue(relay: Relay, frame: Frame): void {
	if (relay.ended !== undefined) return;
	relay.pendingBytes += sizeOf(frame);
	if (
		relay.pending.length < PENDING &&
		relay.pendingBytes <= relay.maxBuffered
	) {
		relay.pending.push(frame);
	} else {
		relay.ended = [OVERLOADED_CLOSE, 'client not open yet'];
		relay.upstream.close(...relay.ended);
	}
}
