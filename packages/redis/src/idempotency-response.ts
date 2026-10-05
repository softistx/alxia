import { z } from 'zod';

/**
 * What `idempotency()` keeps under a key: the response, as the route
 * answered it. The `schema` of a wired `defineIdempotency` that
 * `idempotency(handle.idempotency.orders)` is given:
 *
 * ```ts
 * export const orders = defineIdempotency({ name: 'orders', key: (id: string) => id, ttl: 86_400, schema: idempotencyResult });
 * ```
 */
export const idempotencyResult = z.object({
	status: z.number().int(),
	headers: z.array(z.tuple([z.string(), z.string()])),
	body: z.string(),
});
export type IdempotencyResult = z.infer<typeof idempotencyResult>;

/** Headers a replay never repeats: a session cookie belongs to one response. */
const UNSTORED_HEADERS = new Set(['set-cookie', 'date', 'content-length']);

/** A response that is answered and not kept: a 5xx, a stream. */
export class Unstored extends Error {
	readonly response: Response;
	constructor(response: Response) {
		super('unstored');
		this.response = response;
	}
}

/** What a key is bound to: the method, the path and query, the body. */
export async function fingerprintOf(
	request: Request,
	url: URL,
): Promise<Uint8Array> {
	const body = new Uint8Array(await request.clone().arrayBuffer());
	const head = new TextEncoder().encode(
		`${request.method} ${url.pathname}${url.search}\n`,
	);
	const fingerprint = new Uint8Array(head.length + body.length);
	fingerprint.set(head);
	fingerprint.set(body, head.length);
	return fingerprint;
}

export async function store(response: Response): Promise<IdempotencyResult> {
	if (
		response.status >= 500 ||
		response.headers.get('content-type')?.startsWith('text/event-stream')
	) {
		throw new Unstored(response);
	}
	const headers: [string, string][] = [];
	for (const [name, value] of response.headers) {
		if (!UNSTORED_HEADERS.has(name)) headers.push([name, value]);
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	return {
		status: response.status,
		headers,
		body: Buffer.from(bytes).toString('base64'),
	};
}

export function restore(
	stored: IdempotencyResult,
	replayed: boolean,
): Response {
	const headers = new Headers(stored.headers);
	if (replayed) headers.set('idempotent-replayed', 'true');
	const body = Buffer.from(stored.body, 'base64');
	return new Response(
		stored.status === 204 || stored.status === 304 ? null : body,
		{ status: stored.status, headers },
	);
}
