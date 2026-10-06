/**
 * The request body as the upstream reads it: streamed chunk by chunk as
 * the upstream pulls it, never buffered, counted against the proxy's
 * `bodyLimit`, and watched, so that the error that cut it — a
 * `ContentTooLargeError` of the proxy's or of the route's `bodyLimit` —
 * answers the request rather than a 502.
 */
import { ContentTooLargeError } from '@alxia/core';

/** A body on its way upstream, and the error it failed with, once it has. */
export interface WatchedBody {
	readonly stream: ReadableStream<Uint8Array>;
	readonly failure: () => unknown;
	/**
	 * Whether the upstream has asked for a chunk, or cancelled the body,
	 * yet: nothing is read before it asks, so a body it never touched is
	 * still whole, and can go to another upstream.
	 */
	readonly started: () => boolean;
}

/**
 * `source`, pulled as the upstream reads, failing past `limit` bytes; a
 * declared `Content-Length` past it fails before a byte is read.
 */
export function watchBody(
	source: ReadableStream<Uint8Array>,
	limit: number | undefined,
	declared: string | null,
	/** Called on every chunk read: the upload is progressing. */
	onChunk: () => void = () => {},
): WatchedBody {
	let failure: unknown;
	if (limit !== undefined && Number(declared ?? Number.NaN) > limit) {
		source.cancel().catch(() => {});
		throw new ContentTooLargeError(limit);
	}
	const reader = source.getReader();
	let count = 0;
	let started = false;
	const stream = new ReadableStream<Uint8Array>(
		{
			async pull(controller) {
				started = true;
				try {
					const { done, value } = await reader.read();
					if (done) {
						controller.close();
						return;
					}
					onChunk();
					count += value.byteLength;
					if (limit !== undefined && count > limit) {
						throw new ContentTooLargeError(limit);
					}
					controller.enqueue(value);
				} catch (error) {
					failure = error;
					reader.cancel(error).catch(() => {});
					controller.error(error);
				}
			},
			cancel(reason) {
				started = true;
				return reader.cancel(reason);
			},
		},
		// No chunk read ahead: the first pull is the upstream's own.
		{ highWaterMark: 0 },
	);
	return { stream, failure: () => failure, started: () => started };
}
