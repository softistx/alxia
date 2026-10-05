/** The most a response may weigh: a key set is a few kilobytes. */
const MAX_BYTES = 256 * 1024;

/** The body as text, cancelled once it passes `MAX_BYTES`: a hostile endpoint cannot make the server buffer it. */
async function readLimited(response: Response): Promise<string> {
	const declared = Number(response.headers.get('content-length'));
	if (declared > MAX_BYTES) throw new Error('the response is too large');
	const chunks: Uint8Array[] = [];
	let size = 0;
	const reader = response.body?.getReader();
	for (;;) {
		const part = await reader?.read();
		if (part === undefined || part.done) break;
		size += part.value.byteLength;
		if (size > MAX_BYTES) {
			await reader?.cancel();
			throw new Error('the response is too large');
		}
		chunks.push(part.value);
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}

export interface Fetched {
	readonly body: unknown;
	readonly cacheControl: string | null;
}

/** A JSON document fetched strictly: no redirect, within `timeoutMs`, at most `MAX_BYTES`. */
export async function getJson(url: URL, timeoutMs: number): Promise<Fetched> {
	const response = await fetch(url, {
		headers: { accept: 'application/json' },
		redirect: 'error',
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!response.ok)
		throw new Error(`${url.origin}${url.pathname} answered ${response.status}`);
	const text = await readLimited(response);
	return {
		body: JSON.parse(text),
		cacheControl: response.headers.get('cache-control'),
	};
}
