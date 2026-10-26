/** What the body limit specs share: a body sent as a client sends it. */
/** A JSON body with its `Content-Length` set, as a client's: Bun's `Request` sets none. */
export const send = (
	target: {
		request: (
			input: string,
			init?: RequestInit,
		) => Response | Promise<Response>;
	},
	body: BodyInit,
) =>
	target.request('/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(typeof body === 'string'
				? { 'content-length': String(new TextEncoder().encode(body).length) }
				: {}),
		},
		body,
		duplex: 'half',
	} as RequestInit);

/** `total` bytes of JSON in 256-byte chunks, with no Content-Length. */
export function chunked(prefix: string, total: number) {
	const bytes = new TextEncoder().encode(prefix + ' '.repeat(total));
	let at = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (at >= bytes.length) return controller.close();
			controller.enqueue(bytes.subarray(at, at + 256));
			at += 256;
		},
	});
}
