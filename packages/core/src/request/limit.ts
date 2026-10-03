import { ContentTooLargeError } from '../errors/errors';

/**
 * The request with its body bounded to `limit` bytes, for every reader:
 * the body parsers, a hook, a handler reading `request.body` as a stream.
 * A `Content-Length` over the limit fails the first read without reading a
 * byte; otherwise the bytes are counted as they arrive, and the read fails
 * with a `ContentTooLargeError` once they pass the limit, so a chunked
 * upload is never buffered whole. A request without a body, or whose body
 * a global hook has already read, is returned as it is.
 */
export function limitBody(request: Request, limit: number): Request {
	const source = request.body;
	if (source === null || request.bodyUsed || source.locked) return request;
	const declared = Number(request.headers.get('content-length') ?? Number.NaN);
	let body: ReadableStream<Uint8Array>;
	if (declared > limit) {
		source.cancel().catch(() => {});
		body = new ReadableStream({
			start: (controller) => controller.error(new ContentTooLargeError(limit)),
		});
	} else {
		let count = 0;
		body = source.pipeThrough(
			new TransformStream<Uint8Array, Uint8Array>({
				transform(chunk, controller) {
					count += chunk.byteLength;
					if (count > limit) {
						controller.error(new ContentTooLargeError(limit));
					} else controller.enqueue(chunk);
				},
			}),
		);
	}
	return new Request(request, { body, duplex: 'half' } as RequestInit);
}

/** Whether `limit` is a byte count a route can be given. */
export function checkLimit(limit: number, where: string): number {
	if (!Number.isSafeInteger(limit) || limit < 0) {
		throw new TypeError(
			`${where}: bodyLimit must be a whole number of bytes, 0 or more; got ${limit}`,
		);
	}
	return limit;
}
