import { judge, readSubscriptionRequest } from './operation';

type HeaderValues = Record<string, string | null | undefined> | Headers;

export interface SubscriptionProxyOptions {
	/** The API's GraphQL endpoint, which serves subscriptions over SSE. */
	readonly endpoint: string | URL;
	/**
	 * The operations the browser may start: the names of the allowed
	 * subscriptions, or persisted-query ids. Anything else is refused and never
	 * sent upstream.
	 */
	readonly allow: readonly string[];
	/** The session's token, from the request: `(request) => cookies.token(request)`. `null` is a 401. */
	readonly getToken: (
		request: Request,
	) => string | null | undefined | Promise<string | null | undefined>;
	/** Extra upstream headers (client name, proxy secret, `X-Forwarded-For`, `Accept-Language`), fixed or built per request. A `null` or `undefined` value is left out. */
	readonly headers?:
		| HeaderValues
		| ((request: Request) => HeaderValues | Promise<HeaderValues>);
	/** A comment line sent this often so a proxy or Bun's `idleTimeout` keeps the stream open. 15000 by default; `0` turns it off. */
	readonly heartbeatMs?: number;
	/** The `fetch` used upstream. The global one by default. */
	readonly fetch?: (request: Request) => Promise<Response>;
}

export interface SubscriptionProxy {
	/** A GET: graphql-sse's distinct connections mode with the operation in the search params. */
	loader(args: { request: Request }): Promise<Response>;
	/** A POST: the operation in a JSON body. */
	action(args: { request: Request }): Promise<Response>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function problem(
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

function retryAfterOf(upstream: Response, body: unknown): number | undefined {
	const header = Number(upstream.headers.get('retry-after'));
	if (Number.isFinite(header) && header > 0) return Math.ceil(header);
	const fromBody = (value: unknown): number | undefined =>
		typeof value === 'number' && Number.isFinite(value) && value > 0
			? Math.ceil(value)
			: undefined;
	if (typeof body !== 'object' || body === null) return undefined;
	const top = body as { retryAfter?: unknown; errors?: unknown };
	const first = Array.isArray(top.errors)
		? (top.errors[0] as { extensions?: { retryAfter?: unknown } } | undefined)
		: undefined;
	return fromBody(top.retryAfter) ?? fromBody(first?.extensions?.retryAfter);
}

async function refusedUpstream(upstream: Response): Promise<Response> {
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

const SSE_HEADERS = {
	'content-type': 'text/event-stream; charset=utf-8',
	'cache-control': 'no-store, no-transform',
	'x-accel-buffering': 'no',
};

/** Relays whole events (a heartbeat never lands inside one), until upstream ends or the client leaves. */
function relay(
	upstream: Response,
	abort: AbortController,
	heartbeatMs: number,
): Response {
	const reader = (upstream.body as ReadableStream<Uint8Array>).getReader();
	let timer: ReturnType<typeof setInterval> | undefined;
	let closed = false;
	const stop = (): void => {
		closed = true;
		if (timer !== undefined) clearInterval(timer);
		timer = undefined;
	};
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (text: string): void => {
				if (!closed) controller.enqueue(encoder.encode(text));
			};
			const end = (): void => {
				if (closed) return;
				stop();
				controller.close();
			};
			if (heartbeatMs > 0)
				timer = setInterval(() => send(':\n\n'), heartbeatMs);
			void (async () => {
				let buffer = '';
				try {
					for (;;) {
						const { done, value } = await reader.read();
						if (done) break;
						buffer += decoder
							.decode(value, { stream: true })
							.replace(/\r\n?/g, '\n');
						let cut = buffer.indexOf('\n\n');
						while (cut !== -1) {
							send(`${buffer.slice(0, cut)}\n\n`);
							buffer = buffer.slice(cut + 2);
							cut = buffer.indexOf('\n\n');
						}
					}
					if (buffer.trim() !== '') send(`${buffer}\n\n`);
				} catch {
					if (!closed && !abort.signal.aborted) {
						send(
							'event: next\ndata: {"errors":[{"message":"The API stream failed.","extensions":{"code":"UPSTREAM_ERROR"}}]}\n\n',
						);
						send('event: complete\ndata:\n\n');
					}
				}
				end();
			})();
		},
		cancel() {
			stop();
			abort.abort();
			void reader.cancel().catch(() => {});
		},
	});
	return new Response(stream, { status: 200, headers: SSE_HEADERS });
}

/**
 * A resource route that exposes one GraphQL subscription to the browser
 * without giving it the API's token or an open pass-through. See the
 * subscription guide.
 */
export function createSubscriptionProxy(
	options: SubscriptionProxyOptions,
): SubscriptionProxy {
	const endpoint = new URL(options.endpoint);
	const allow = new Set(options.allow);
	const heartbeatMs = options.heartbeatMs ?? 15000;
	const upstreamFetch = options.fetch ?? ((request: Request) => fetch(request));

	async function handle(request: Request): Promise<Response> {
		const token = await options.getToken(request);
		if (token === null || token === undefined || token === '')
			return problem(401, 'Sign in to continue.', 'UNAUTHENTICATED');
		let asked: Awaited<ReturnType<typeof readSubscriptionRequest>>;
		try {
			asked = await readSubscriptionRequest(request);
		} catch (error) {
			return problem(400, (error as Error).message, 'BAD_REQUEST');
		}
		const verdict = judge(asked, allow);
		if (!verdict.ok)
			return problem(
				verdict.status,
				verdict.message,
				verdict.status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST',
			);

		const extra =
			typeof options.headers === 'function'
				? await options.headers(request)
				: options.headers;
		const headers = new Headers();
		for (const [name, value] of extra instanceof Headers
			? extra.entries()
			: Object.entries(extra ?? {}))
			if (value !== null && value !== undefined) headers.set(name, value);
		headers.set('content-type', 'application/json');
		headers.set('accept', 'text/event-stream');
		headers.set('authorization', `Bearer ${token}`);

		const abort = new AbortController();
		request.signal.addEventListener('abort', () => abort.abort(), {
			once: true,
		});
		let upstream: Response;
		try {
			upstream = await upstreamFetch(
				new Request(endpoint, {
					method: 'POST',
					headers,
					body: JSON.stringify(asked),
					signal: abort.signal,
				}),
			);
		} catch {
			return problem(502, 'The API is unreachable.', 'UPSTREAM_ERROR');
		}
		if (
			!upstream.ok ||
			upstream.body === null ||
			!(upstream.headers.get('content-type') ?? '').startsWith(
				'text/event-stream',
			)
		) {
			if (upstream.ok) {
				abort.abort();
				return problem(
					502,
					'The API did not answer with an event stream.',
					'UPSTREAM_ERROR',
				);
			}
			const refused = await refusedUpstream(upstream);
			abort.abort();
			return refused;
		}
		return relay(upstream, abort, heartbeatMs);
	}

	return {
		loader: ({ request }) =>
			request.method === 'GET'
				? handle(request)
				: Promise.resolve(
						problem(
							405,
							'Use GET.',
							'METHOD_NOT_ALLOWED',
							{},
							{ allow: 'GET' },
						),
					),
		action: ({ request }) =>
			request.method === 'POST'
				? handle(request)
				: Promise.resolve(
						problem(
							405,
							'Use POST.',
							'METHOD_NOT_ALLOWED',
							{},
							{ allow: 'POST' },
						),
					),
	};
}
