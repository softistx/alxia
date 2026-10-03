import type { Transform } from 'node:stream';
import {
	constants,
	createBrotliCompress,
	createDeflate,
	createGzip,
	createZstdCompress,
} from 'node:zlib';
import type { Encoding } from './compress';

/**
 * zlib's default, 11, is meant for compressing once ahead of time: on a
 * response compressed per request it costs many times gzip's CPU for a few
 * percent. 4 is still smaller than gzip's default, at about its speed.
 */
export const BROTLI_QUALITY = 4;

type Codec = Transform & {
	flush(kind: number, callback: () => void): void;
};

/** A `node:zlib` stream for `encoding`, and the flush that empties it. */
function codec(encoding: Encoding): { codec: Codec; kind: number } {
	switch (encoding) {
		case 'zstd':
			return { codec: createZstdCompress(), kind: constants.ZSTD_e_flush };
		case 'br':
			return {
				codec: createBrotliCompress({
					params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
				}),
				kind: constants.BROTLI_OPERATION_FLUSH,
			};
		case 'gzip':
			return { codec: createGzip(), kind: constants.Z_SYNC_FLUSH };
		case 'deflate':
			return { codec: createDeflate(), kind: constants.Z_SYNC_FLUSH };
	}
}

/** Until the codec can take more, or is gone. */
function drained(zlib: Codec): Promise<void> {
	if (zlib.destroyed) return Promise.resolve();
	return new Promise((resolve) => {
		const done = () => {
			zlib.off('drain', done);
			zlib.off('close', done);
			resolve();
		};
		zlib.once('drain', done);
		zlib.once('close', done);
	});
}

/**
 * `source` compressed as `encoding`, flushed after the chunks of each turn
 * of the event loop: what the source has yielded leaves at once, decodable,
 * instead of waiting in the codec for a block to fill or the stream to end.
 * The chunks a source yields in one turn — a renderer writing its shell —
 * share one flush, which costs less ratio than one each.
 *
 * A source that fails errors the result; a reader that cancels cancels the
 * source. Either way the codec is destroyed.
 */
export function flushing(
	source: ReadableStream<Uint8Array>,
	encoding: Encoding,
): ReadableStream<Uint8Array> {
	const { codec: zlib, kind } = codec(encoding);
	const reader = source.getReader();
	// Set once the result is closed, errored or cancelled: what the codec
	// emits after that has nowhere to go.
	let settled = false;
	let ending = false;
	let scheduled = false;
	const gone = new Promise<void>((resolve) => zlib.once('close', resolve));
	const flush = () => {
		scheduled = false;
		if (!ending && !settled) zlib.flush(kind, () => {});
	};
	return new ReadableStream<Uint8Array>(
		{
			start(controller) {
				zlib.on('data', (chunk: Uint8Array) => {
					if (!settled) controller.enqueue(chunk);
				});
				zlib.once('end', () => {
					if (settled) return;
					settled = true;
					controller.close();
				});
				zlib.once('error', (error) => {
					if (!settled) {
						settled = true;
						controller.error(error);
					}
					reader.cancel(error).catch(() => {});
				});
			},
			// Reads on while the reader wants more: a pull that enqueued nothing
			// is not called again until the codec's bytes arrive, a turn later,
			// which would flush each chunk on its own.
			async pull(controller) {
				while (!settled && (controller.desiredSize ?? 0) > 0) {
					let next: Awaited<ReturnType<typeof reader.read>>;
					try {
						next = await reader.read();
					} catch (error) {
						if (!settled) {
							settled = true;
							controller.error(error);
						}
						zlib.destroy();
						return;
					}
					if (settled) return;
					if (next.done) {
						ending = true;
						zlib.end();
						// No pull until the codec is done: the last bytes close it.
						return gone;
					}
					if (!scheduled) {
						scheduled = true;
						setImmediate(flush);
					}
					if (!zlib.write(next.value)) await drained(zlib);
				}
			},
			cancel(reason) {
				settled = true;
				zlib.destroy();
				return reader.cancel(reason).catch(() => {});
			},
		},
		// Once about 64 KiB of compressed bytes wait for the reader, the
		// source is read no further; what the codec still holds may add as
		// much again.
		new ByteLengthQueuingStrategy({ highWaterMark: 64 * 1024 }),
	);
}
