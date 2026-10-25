/** The render's abort timer: one per response, cleared when the response is over. */
export interface Deadline {
	readonly signal: AbortSignal;
	/** Stops the timer. Calling it again does nothing. */
	readonly clear: () => void;
}

/** A signal aborted after `ms`, with the means to stop the timer. */
export function deadline(ms: number): Deadline {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/**
 * The same bytes in a new stream that calls `done` when the body ends,
 * fails or is cancelled (the client went away), so no timer outlives the
 * response. React's `allReady` is not carried over: await it first.
 */
export function untilDone(
	body: ReadableStream<Uint8Array>,
	done: () => void,
): ReadableStream<Uint8Array> {
	const reader = body.getReader();
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const chunk = await reader.read();
				if (chunk.done) {
					done();
					controller.close();
				} else {
					controller.enqueue(chunk.value);
				}
			} catch (error) {
				done();
				controller.error(error);
			}
		},
		async cancel(reason) {
			done();
			await reader.cancel(reason);
		},
	});
}
