/** The most one event may weigh before the stream is cut, in characters. */
export const MAX_EVENT = 1024 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const SSE_HEADERS = {
	'content-type': 'text/event-stream; charset=utf-8',
	'cache-control': 'no-store, no-transform',
	'x-accel-buffering': 'no',
};

const FAILED =
	'event: next\ndata: {"errors":[{"message":"The API stream failed.","extensions":{"code":"UPSTREAM_ERROR"}}]}\n\nevent: complete\ndata:\n\n';

/**
 * Relays whole events (a heartbeat never lands inside one) until the upstream
 * ends or the client leaves. The stream is pulled: upstream is read only when
 * the client has taken what was queued, so a slow client holds the upstream
 * back instead of growing a buffer, and a heartbeat is skipped while one is
 * waiting.
 */
export function relay(
	upstream: Response,
	abort: AbortController,
	heartbeatMs: number,
): Response {
	const reader = (upstream.body as ReadableStream<Uint8Array>).getReader();
	let timer: ReturnType<typeof setInterval> | undefined;
	let buffer = '';
	const stop = (): void => {
		if (timer !== undefined) clearInterval(timer);
		timer = undefined;
	};
	const stream = new ReadableStream<Uint8Array>(
		{
			start(controller) {
				if (heartbeatMs > 0)
					timer = setInterval(() => {
						if ((controller.desiredSize ?? 0) > 0)
							controller.enqueue(encoder.encode(':\n\n'));
					}, heartbeatMs);
			},
			async pull(controller) {
				try {
					for (;;) {
						const { done, value } = await reader.read();
						if (done) {
							stop();
							if (buffer.trim() !== '')
								controller.enqueue(encoder.encode(`${buffer}\n\n`));
							controller.close();
							return;
						}
						buffer += decoder
							.decode(value, { stream: true })
							.replace(/\r\n?/g, '\n');
						const cut = buffer.lastIndexOf('\n\n');
						if (cut !== -1) {
							controller.enqueue(encoder.encode(buffer.slice(0, cut + 2)));
							buffer = buffer.slice(cut + 2);
							return;
						}
						if (buffer.length > MAX_EVENT) throw new Error('event too large');
					}
				} catch {
					stop();
					if (abort.signal.aborted) return;
					abort.abort();
					controller.enqueue(encoder.encode(FAILED));
					controller.close();
				}
			},
			cancel() {
				stop();
				abort.abort();
				void reader.cancel().catch(() => {});
			},
		},
		{ highWaterMark: 1 },
	);
	return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
