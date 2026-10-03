import type { CachedResponse } from './store';

/** A kept response, or a 304 to a client that has it. */
export function respond(
	request: Request,
	cached: CachedResponse,
	state: string | undefined,
): Response {
	const headers = new Headers(cached.headers as [string, string][]);
	if (state !== undefined) {
		headers.set('x-cache', state);
		headers.set(
			'age',
			String(Math.max(0, Math.floor((Date.now() - cached.storedAt) / 1000))),
		);
	}
	const etag = headers.get('etag');
	const match = request.headers.get('if-none-match');
	if (etag !== null && match !== null) {
		const weak = (tag: string) => tag.trim().replace(/^W\//, '');
		if (
			match
				.split(',')
				.some((tag) => tag.trim() === '*' || weak(tag) === weak(etag))
		) {
			return new Response(null, { status: 304, headers });
		}
	}
	return new Response(
		cached.status === 204 ? null : (cached.body as Uint8Array<ArrayBuffer>),
		{
			status: cached.status,
			headers,
		},
	);
}
