/**
 * Whether a body is a stream of events: any async iterable but a
 * `ReadableStream`, which is sent as bytes.
 */
export function isAsyncIterable(
	value: unknown,
): value is AsyncIterable<unknown> {
	return (
		value !== null &&
		typeof value === 'object' &&
		Symbol.asyncIterator in value &&
		!(value instanceof ReadableStream)
	);
}
