/** An answer the proxy gives itself, as GraphQL-shaped JSON a client can read. */
export class Refusal extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly code: string,
	) {
		super(message);
		this.name = 'Refusal';
	}
}

export function problem(
	status: number,
	message: string,
	code: string,
	extra: Record<string, unknown> = {},
	headers: HeadersInit = {},
): Response {
	return new Response(
		JSON.stringify({
			errors: [{ message, extensions: { code, ...extra } }],
			...extra,
		}),
		{
			status,
			headers: {
				'content-type': 'application/json',
				'cache-control': 'no-store',
				...headers,
			},
		},
	);
}

export const refusalResponse = (refusal: Refusal): Response =>
	problem(refusal.status, refusal.message, refusal.code);

function retryAfterOf(upstream: Response, body: unknown): number | undefined {
	const header = Number(upstream.headers.get('retry-after'));
	if (Number.isFinite(header) && header > 0) return Math.ceil(header);
	const seconds = (value: unknown): number | undefined =>
		typeof value === 'number' && Number.isFinite(value) && value > 0
			? Math.ceil(value)
			: undefined;
	if (typeof body !== 'object' || body === null) return undefined;
	const top = body as { retryAfter?: unknown; errors?: unknown };
	const first = Array.isArray(top.errors)
		? (top.errors[0] as { extensions?: { retryAfter?: unknown } } | undefined)
		: undefined;
	return seconds(top.retryAfter) ?? seconds(first?.extensions?.retryAfter);
}

/** What a non-2xx upstream answer becomes: a 429 with `retryAfter`, a 502 for a 5xx, any other 4xx as it came. */
export async function refusedUpstream(upstream: Response): Promise<Response> {
	const text = await upstream.text().catch(() => '');
	if (upstream.status === 429) {
		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {}
		const retryAfter = retryAfterOf(upstream, body);
		return problem(
			429,
			'Too many requests.',
			'RATE_LIMITED',
			retryAfter === undefined ? {} : { retryAfter },
			retryAfter === undefined ? {} : { 'retry-after': String(retryAfter) },
		);
	}
	if (upstream.status >= 500)
		return problem(502, 'The API is unavailable.', 'UPSTREAM_ERROR');
	return new Response(text, {
		status: upstream.status,
		headers: {
			'content-type':
				upstream.headers.get('content-type') ?? 'application/json',
			'cache-control': 'no-store',
		},
	});
}
