// Kept twice: `telemetry/src/body.ts` is the same file. Change both together.
/** How a streamed body ended: sent whole, left by its client, or failed. */
export type Outcome = 'completed' | 'aborted' | 'errored';

/**
 * Whether `response` is sent as it is, with nothing left to time: no body,
 * or a body whose length is known. Bun sends those without JavaScript (a
 * string, a buffer, a file), so they are not wrapped. The header is read
 * first: it does not make Bun build the body's stream.
 */
export function settled(response: Response): boolean {
	return response.headers.has('content-length') || response.body === null;
}

/**
 * `body`, passed through chunk by chunk, calling `end` once when it has
 * been read to its end, cancelled by its reader (the client left: Bun
 * cancels the body), or failed, with the failure. A cancel goes on to
 * `body`, so an event stream releases its generator. One chunk is read per
 * pull, never ahead.
 */
export function watched(
	body: ReadableStream<Uint8Array>,
	end: (outcome: Outcome, error?: unknown) => void,
): ReadableStream<Uint8Array> {
	const reader = body.getReader();
	let ended = false;
	const finish = (outcome: Outcome, error?: unknown) => {
		if (ended) return;
		ended = true;
		end(outcome, error);
	};
	return new ReadableStream<Uint8Array>(
		{
			async pull(controller) {
				let next: Awaited<ReturnType<typeof reader.read>>;
				try {
					next = await reader.read();
				} catch (error) {
					finish('errored', error);
					controller.error(error);
					return;
				}
				if (next.done) {
					finish('completed');
					controller.close();
				} else controller.enqueue(next.value);
			},
			cancel(reason) {
				finish('aborted');
				return reader.cancel(reason);
			},
		},
		{ highWaterMark: 0 },
	);
}
