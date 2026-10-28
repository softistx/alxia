import { afterEach, describe, expect, test } from 'bun:test';
import {
	createSubscriptionProxy,
	type SubscriptionProxyOptions,
} from './index';

const SUB = 'subscription RoomEvents($id: ID!) { roomEvents(id: $id) { id } }';

interface Seen {
	headers: Headers;
	body: Record<string, unknown>;
}

let servers: Array<ReturnType<typeof Bun.serve>> = [];
afterEach(() => {
	for (const s of servers) s.stop(true);
	servers = [];
});

/** A fake API: records what it got, answers with `handler`. */
function upstream(
	handler: (request: Request, seen: Seen[]) => Response | Promise<Response>,
) {
	const seen: Seen[] = [];
	const aborted = { value: false };
	const server = Bun.serve({
		port: 0,
		idleTimeout: 0,
		async fetch(request) {
			seen.push({
				headers: request.headers,
				body: await request.clone().json(),
			});
			request.signal.addEventListener('abort', () => {
				aborted.value = true;
			});
			return handler(request, seen);
		},
	});
	servers.push(server);
	return { url: `http://localhost:${server.port}/graphql`, seen, aborted };
}

function sse(events: string[], { keepOpen = false } = {}): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream({
			start(controller) {
				for (const e of events) controller.enqueue(encoder.encode(e));
				if (!keepOpen) controller.close();
			},
		}),
		{ headers: { 'content-type': 'text/event-stream' } },
	);
}

function proxy(
	endpoint: string,
	extra: Partial<SubscriptionProxyOptions> = {},
) {
	return createSubscriptionProxy({
		endpoint,
		allow: ['RoomEvents'],
		getToken: (request) => request.headers.get('x-session'),
		heartbeatMs: 0,
		...extra,
	});
}

function post(
	body: unknown,
	headers: HeadersInit = { 'x-session': 'tok' },
): Request {
	return new Request('http://app.test/events', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify(body),
	});
}

describe('createSubscriptionProxy', () => {
	test('relays the upstream events and closes when it completes', async () => {
		const api = upstream(() =>
			sse([
				'event: next\ndata: {"data":{"n":1}}\n\n',
				'event: complete\ndata:\n\n',
			]),
		);
		const response = await proxy(api.url).action({
			request: post({
				query: SUB,
				operationName: 'RoomEvents',
				variables: { id: '7' },
			}),
		});
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toStartWith(
			'text/event-stream',
		);
		expect(response.headers.get('cache-control')).toContain('no-store');
		expect(response.headers.get('x-accel-buffering')).toBe('no');
		expect(await response.text()).toBe(
			'event: next\ndata: {"data":{"n":1}}\n\nevent: complete\ndata:\n\n',
		);
		expect(api.seen[0]?.body['variables']).toEqual({ id: '7' });
	});

	test('reassembles an event split across chunks', async () => {
		const api = upstream(() =>
			sse(['event: next\nda', 'ta: {"a":1}\n', '\nevent: complete\ndata:\n\n']),
		);
		const response = await proxy(api.url).action({
			request: post({ query: SUB }),
		});
		expect(await response.text()).toBe(
			'event: next\ndata: {"a":1}\n\nevent: complete\ndata:\n\n',
		);
	});

	test('serves a GET with the operation in the search params', async () => {
		const api = upstream(() => sse(['event: complete\ndata:\n\n']));
		const url = new URL('http://app.test/events');
		url.searchParams.set('query', SUB);
		url.searchParams.set('variables', '{"id":"1"}');
		const response = await proxy(api.url).loader({
			request: new Request(url, { headers: { 'x-session': 'tok' } }),
		});
		expect(response.status).toBe(200);
		await response.text();
		expect(api.seen[0]?.body).toEqual({ query: SUB, variables: { id: '1' } });
	});

	test('refuses an operation that is not allow-listed, without calling upstream', async () => {
		const api = upstream(() => sse([]));
		const p = proxy(api.url);
		const named = await p.action({
			request: post({
				query: 'subscription Other { x }',
				operationName: 'Other',
			}),
		});
		expect(named.status).toBe(403);
		const mutation = await p.action({
			request: post({ query: 'mutation RoomEvents { x }' }),
		});
		expect(mutation.status).toBe(403);
		const shorthand = await p.action({
			request: post({ query: '{ me { id } }' }),
		});
		expect(shorthand.status).toBe(403);
		const smuggled = await p.action({
			request: post({
				query: `${SUB} mutation Evil { drop }`,
				operationName: 'RoomEvents',
			}),
		});
		expect(smuggled.status).toBe(403);
		const anonymous = await p.action({
			request: post({ query: 'subscription { x }' }),
		});
		expect(anonymous.status).toBe(403);
		expect(api.seen).toHaveLength(0);
		const body = (await named.json()) as {
			errors: Array<{ extensions: { code: string } }>;
		};
		expect(body.errors[0]?.extensions.code).toBe('FORBIDDEN');
	});

	test('ignores comments, strings and fragments when reading the document', async () => {
		const api = upstream(() => sse([]));
		const doc = `# mutation Evil { x }\nsubscription RoomEvents($t: String = "query Evil {") { roomEvents { ...F } }\nfragment F on Event { id }`;
		const response = await proxy(api.url).action({
			request: post({ query: doc }),
		});
		expect(response.status).toBe(200);
		await response.text();
		expect(api.seen).toHaveLength(1);
	});

	test('400 for a malformed request or an operationName outside the document', async () => {
		const api = upstream(() => sse([]));
		const p = proxy(api.url);
		const bad = await p.action({
			request: new Request('http://app.test/e', {
				method: 'POST',
				headers: { 'x-session': 't' },
				body: 'nope',
			}),
		});
		expect(bad.status).toBe(400);
		const missing = await p.action({ request: post({}) });
		expect(missing.status).toBe(400);
		const wrongName = await p.action({
			request: post({ query: SUB, operationName: 'Other' }),
		});
		expect(wrongName.status).toBe(400);
		expect(api.seen).toHaveLength(0);
	});

	test('allows a persisted id when listed', async () => {
		const api = upstream(() => sse([]));
		const p = proxy(api.url, { allow: ['abc123'] });
		const ok = await p.action({
			request: post({
				extensions: { persistedQuery: { version: 1, sha256Hash: 'abc123' } },
			}),
		});
		expect(ok.status).toBe(200);
		await ok.text();
		const no = await p.action({
			request: post({
				extensions: { persistedQuery: { version: 1, sha256Hash: 'zzz' } },
			}),
		});
		expect(no.status).toBe(403);
		expect(api.seen).toHaveLength(1);
	});

	test('401 without a session, never calling upstream', async () => {
		const api = upstream(() => sse([]));
		const response = await proxy(api.url).action({
			request: post({ query: SUB }, {}),
		});
		expect(response.status).toBe(401);
		expect(api.seen).toHaveLength(0);
	});

	test('sends the bearer and the configured headers upstream', async () => {
		const api = upstream(() => sse([]));
		const response = await proxy(api.url, {
			headers: (request) => ({
				'x-client': 'bff',
				'x-forwarded-for': request.headers.get('x-forwarded-for'),
				'accept-language': request.headers.get('accept-language'),
				'x-dropped': undefined,
			}),
		}).action({
			request: post(
				{ query: SUB },
				{
					'x-session': 'tok',
					'x-forwarded-for': '1.2.3.4',
					'accept-language': 'fr',
				},
			),
		});
		await response.text();
		const got = api.seen[0]?.headers;
		expect(got?.get('authorization')).toBe('Bearer tok');
		expect(got?.get('x-client')).toBe('bff');
		expect(got?.get('x-forwarded-for')).toBe('1.2.3.4');
		expect(got?.get('accept-language')).toBe('fr');
		expect(got?.get('x-dropped')).toBeNull();
		expect(got?.get('accept')).toBe('text/event-stream');
		expect(got?.get('x-session')).toBeNull();
	});

	test('sends a heartbeat comment while upstream is quiet', async () => {
		const api = upstream(() =>
			sse(['event: next\ndata: {}\n\n'], { keepOpen: true }),
		);
		const response = await proxy(api.url, { heartbeatMs: 20 }).action({
			request: post({ query: SUB }),
		});
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		let text = '';
		const started = Date.now();
		while (!text.includes(':\n\n:\n\n') && Date.now() - started < 2000) {
			const { value } = await reader.read();
			text += new TextDecoder().decode(value);
		}
		expect(text).toContain('event: next\ndata: {}\n\n');
		expect(text).toContain(':\n\n:\n\n');
		await reader.cancel();
	});

	test('aborts upstream when the client leaves', async () => {
		const api = upstream(() =>
			sse(['event: next\ndata: {}\n\n'], { keepOpen: true }),
		);
		const client = new AbortController();
		const request = new Request('http://app.test/events', {
			method: 'POST',
			headers: { 'x-session': 'tok' },
			body: JSON.stringify({ query: SUB }),
			signal: client.signal,
		});
		const response = await proxy(api.url).action({ request });
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		await reader.read();
		await reader.cancel();
		const started = Date.now();
		while (!api.aborted.value && Date.now() - started < 2000)
			await Bun.sleep(10);
		expect(api.aborted.value).toBe(true);
	});

	test('aborts upstream when the request signal aborts', async () => {
		const api = upstream(() =>
			sse(['event: next\ndata: {}\n\n'], { keepOpen: true }),
		);
		const client = new AbortController();
		const response = await proxy(api.url).action({
			request: new Request('http://app.test/events', {
				method: 'POST',
				headers: { 'x-session': 'tok' },
				body: JSON.stringify({ query: SUB }),
				signal: client.signal,
			}),
		});
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		await reader.read();
		client.abort();
		const started = Date.now();
		while (!api.aborted.value && Date.now() - started < 2000)
			await Bun.sleep(10);
		expect(api.aborted.value).toBe(true);
		await reader.cancel().catch(() => {});
	});

	test('passes a 429 through with retryAfter in the header and the body, and does not retry', async () => {
		const api = upstream(
			() =>
				new Response(
					JSON.stringify({
						errors: [{ message: 'slow down', extensions: { retryAfter: 12 } }],
					}),
					{
						status: 429,
						headers: { 'content-type': 'application/json' },
					},
				),
		);
		const response = await proxy(api.url).action({
			request: post({ query: SUB }),
		});
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('12');
		const body = (await response.json()) as {
			retryAfter: number;
			errors: Array<{ extensions: { retryAfter: number } }>;
		};
		expect(body.retryAfter).toBe(12);
		expect(body.errors[0]?.extensions.retryAfter).toBe(12);
		expect(api.seen).toHaveLength(1);
	});

	test('reads retryAfter from the upstream header', async () => {
		const api = upstream(
			() => new Response('', { status: 429, headers: { 'retry-after': '30' } }),
		);
		const response = await proxy(api.url).action({
			request: post({ query: SUB }),
		});
		expect(response.headers.get('retry-after')).toBe('30');
		expect(((await response.json()) as { retryAfter: number }).retryAfter).toBe(
			30,
		);
	});

	test('maps upstream failures: 5xx and unreachable are 502, a 401 passes through', async () => {
		const down = upstream(() => new Response('boom', { status: 503 }));
		expect(
			(await proxy(down.url).action({ request: post({ query: SUB }) })).status,
		).toBe(502);
		const expired = upstream(
			() =>
				new Response('{"errors":[]}', {
					status: 401,
					headers: { 'content-type': 'application/json' },
				}),
		);
		expect(
			(await proxy(expired.url).action({ request: post({ query: SUB }) }))
				.status,
		).toBe(401);
		const gone = proxy('http://localhost:1/graphql');
		expect((await gone.action({ request: post({ query: SUB }) })).status).toBe(
			502,
		);
	});

	test('an upstream stream that breaks ends the client stream with an error event', async () => {
		const api = upstream(
			() =>
				new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(
								new TextEncoder().encode('event: next\ndata: {}\n\n'),
							);
							setTimeout(() => controller.error(new Error('reset')), 20);
						},
					}),
					{ headers: { 'content-type': 'text/event-stream' } },
				),
		);
		const text = await (
			await proxy(api.url).action({ request: post({ query: SUB }) })
		).text();
		expect(text).toContain('UPSTREAM_ERROR');
		expect(text).toEndWith('event: complete\ndata:\n\n');
	});

	test('a loader refuses POST and an action refuses GET', async () => {
		const p = proxy('http://localhost:1/graphql');
		expect((await p.loader({ request: post({}) })).status).toBe(405);
		expect(
			(await p.action({ request: new Request('http://app.test/e') })).status,
		).toBe(405);
	});
});
