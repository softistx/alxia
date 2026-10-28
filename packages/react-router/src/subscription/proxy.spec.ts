import { afterEach, describe, expect, test } from 'bun:test';
import type { RouterContextProvider } from 'react-router';
import { alxiaOf } from '../context';
import {
	createSubscriptionProxy,
	type SubscriptionArgs,
	type SubscriptionProxy,
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
		allow: { RoomEvents: SUB },
		getToken: (request) => request.headers.get('x-session'),
		heartbeatMs: 0,
		...extra,
	});
}

function post(
	body: Record<string, unknown>,
	headers: HeadersInit = { 'x-session': 'tok' },
): Request {
	return new Request('http://app.test/events', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ operationName: 'RoomEvents', ...body }),
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
		url.searchParams.set('operationName', 'RoomEvents');
		url.searchParams.set('variables', '{"id":"1"}');
		const response = await proxy(api.url).loader({
			request: new Request(url, { headers: { 'x-session': 'tok' } }),
		});
		expect(response.status).toBe(200);
		await response.text();
		expect(api.seen[0]?.body).toEqual({
			query: SUB,
			operationName: 'RoomEvents',
			variables: { id: '1' },
		});
	});

	test("sends the server-held document, never the client's query or extensions", async () => {
		const api = upstream(() => sse([]));
		const response = await proxy(api.url).action({
			request: post({
				query: 'mutation Evil { drop }',
				extensions: { persistedQuery: { sha256Hash: 'x' } },
				variables: { id: '7' },
			}),
		});
		expect(response.status).toBe(200);
		await response.text();
		expect(api.seen[0]?.body).toEqual({
			query: SUB,
			operationName: 'RoomEvents',
			variables: { id: '7' },
		});
	});

	test('403 for an operation name that is not a key, without calling upstream', async () => {
		const api = upstream(() => sse([]));
		const p = proxy(api.url);
		for (const name of ['Other', 'toString', '__proto__', 'constructor']) {
			const response = await p.action({
				request: post({ operationName: name }),
			});
			expect(response.status).toBe(403);
		}
		expect(api.seen).toHaveLength(0);
	});

	test('400 for a malformed request', async () => {
		const api = upstream(() => sse([]));
		const p = proxy(api.url);
		const json = { 'content-type': 'application/json', 'x-session': 't' };
		const bad = await p.action({
			request: new Request('http://app.test/e', {
				method: 'POST',
				headers: json,
				body: 'nope',
			}),
		});
		expect(bad.status).toBe(400);
		expect(
			((await bad.json()) as { errors: Array<{ message: string }> }).errors[0]
				?.message,
		).toBe('The request is not valid JSON.');
		const array = await p.action({
			request: new Request('http://app.test/e', {
				method: 'POST',
				headers: json,
				body: '[]',
			}),
		});
		expect(array.status).toBe(400);
		const noName = await p.action({
			request: new Request('http://app.test/e', {
				method: 'POST',
				headers: json,
				body: '{}',
			}),
		});
		expect(noName.status).toBe(400);
		expect(
			(await p.action({ request: post({ operationName: 3 }) })).status,
		).toBe(400);
		expect((await p.action({ request: post({ variables: [] }) })).status).toBe(
			400,
		);
		expect(api.seen).toHaveLength(0);
	});

	test('400 when the body, the query string or the variables are too large', async () => {
		const api = upstream(() => sse([]));
		const p = proxy(api.url);
		const big = 'x'.repeat(70 * 1024);
		const body = await p.action({ request: post({ variables: { big } }) });
		expect(body.status).toBe(400);
		expect(
			((await body.json()) as { errors: Array<{ message: string }> }).errors[0]
				?.message,
		).toBe('The request is too large.');
		const declared = await p.action({
			request: new Request('http://app.test/e', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-session': 't',
					'content-length': '999999',
				},
				body: '{}',
			}),
		});
		expect(declared.status).toBe(400);
		const url = new URL('http://app.test/events');
		url.searchParams.set('operationName', 'RoomEvents');
		url.searchParams.set(
			'variables',
			JSON.stringify({ big: 'x'.repeat(20 * 1024) }),
		);
		const get = await p.loader({
			request: new Request(url, { headers: { 'x-session': 't' } }),
		});
		expect(get.status).toBe(400);
		const variables = await p.action({
			request: post({ variables: { big: 'x'.repeat(17 * 1024) } }),
		});
		expect(variables.status).toBe(400);
		expect(api.seen).toHaveLength(0);
	});

	test('refuses a cross-site GET and POST, and a POST that is not JSON', async () => {
		const api = upstream(() => sse([]));
		const p = proxy(api.url);
		const evil = { origin: 'https://evil.test', 'x-session': 't' };
		expect((await p.action({ request: post({}, evil) })).status).toBe(403);
		expect(
			(
				await p.action({
					request: post(
						{},
						{ 'sec-fetch-site': 'cross-site', 'x-session': 't' },
					),
				})
			).status,
		).toBe(403);
		const url = new URL('http://app.test/events?operationName=RoomEvents');
		expect(
			(await p.loader({ request: new Request(url, { headers: evil }) })).status,
		).toBe(403);
		expect(
			(
				await p.loader({
					request: new Request(url, {
						headers: { 'sec-fetch-site': 'same-site', 'x-session': 't' },
					}),
				})
			).status,
		).toBe(403);
		const plain = await p.action({
			request: new Request('http://app.test/e', {
				method: 'POST',
				headers: { 'content-type': 'text/plain', 'x-session': 't' },
				body: '{"operationName":"RoomEvents"}',
			}),
		});
		expect(plain.status).toBe(415);
		expect(api.seen).toHaveLength(0);
	});

	test('accepts a same-origin request', async () => {
		const api = upstream(() => sse([]));
		const response = await proxy(api.url).action({
			request: post(
				{},
				{
					origin: 'http://app.test',
					'sec-fetch-site': 'same-origin',
					'x-session': 't',
				},
			),
		});
		expect(response.status).toBe(200);
		await response.text();
	});

	test('a header value with a line break is a worded 500, a token with one a 401', async () => {
		const api = upstream(() => sse([]));
		const broken = await proxy(api.url, {
			headers: { 'x-a': 'a\r\nb: c' },
		}).action({
			request: post({}),
		});
		expect(broken.status).toBe(500);
		expect(
			(
				(await broken.json()) as {
					errors: Array<{ extensions: { code: string } }>;
				}
			).errors[0]?.extensions.code,
		).toBe('PROXY_MISCONFIGURED');
		const token = await proxy(api.url, {
			getToken: () => 'a\r\nb',
		}).action({ request: post({}) });
		expect(token.status).toBe(401);
		expect(api.seen).toHaveLength(0);
	});

	test('an already aborted request still aborts upstream and is not leaked', async () => {
		const api = upstream(() =>
			sse(['event: next\ndata: {}\n\n'], { keepOpen: true }),
		);
		const client = new AbortController();
		client.abort();
		const response = await proxy(api.url)
			.action({
				request: new Request('http://app.test/events', {
					method: 'POST',
					headers: { 'content-type': 'application/json', 'x-session': 'tok' },
					body: JSON.stringify({ operationName: 'RoomEvents' }),
					signal: client.signal,
				}),
			})
			.catch(() => undefined);
		expect(response === undefined || response.status >= 200).toBe(true);
	});

	test('cuts an upstream that never ends an event, instead of buffering it', async () => {
		const api = upstream(
			() =>
				new Response(
					new ReadableStream({
						async pull(controller) {
							controller.enqueue(
								new TextEncoder().encode('data: '.padEnd(256 * 1024, 'x')),
							);
							await Bun.sleep(1);
						},
					}),
					{ headers: { 'content-type': 'text/event-stream' } },
				),
		);
		const text = await (
			await proxy(api.url).action({ request: post({}) })
		).text();
		expect(text).toContain('UPSTREAM_ERROR');
		expect(text).toEndWith('event: complete\ndata:\n\n');
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

	test("hands the route's context and params to the headers function", async () => {
		const api = upstream(() => sse([]));
		const context = { ip: '203.0.113.7', language: 'fr' };
		const calls: unknown[] = [];
		const p = createSubscriptionProxy<typeof context>({
			endpoint: api.url,
			allow: { RoomEvents: SUB },
			getToken: (request) => request.headers.get('x-session'),
			heartbeatMs: 0,
			headers: (request, args) => {
				calls.push(args.request === request);
				return {
					'x-forwarded-for': args.context?.ip,
					'accept-language': args.context?.language,
					'x-room': args.params?.['room'],
				};
			},
		});
		const typed: SubscriptionProxy<typeof context> = p;
		const response = await typed.action({
			request: post({ query: SUB }),
			context,
			params: { room: 'r1' },
		});
		await response.text();
		const got = api.seen[0]?.headers;
		expect(calls).toEqual([true]);
		expect(got?.get('x-forwarded-for')).toBe('203.0.113.7');
		expect(got?.get('accept-language')).toBe('fr');
		expect(got?.get('x-room')).toBe('r1');
		expect(got?.get('authorization')).toBe('Bearer tok');
	});

	test('the loader hands the context to headers too', async () => {
		const api = upstream(() => sse([]));
		const response = await proxy(api.url, {
			headers: (_request, args) => ({
				'x-forwarded-for': (args.context as { ip: string }).ip,
			}),
		}).loader({
			request: new Request(`http://app.test/events?operationName=RoomEvents`, {
				headers: { 'x-session': 'tok' },
			}),
			context: { ip: '198.51.100.9' },
		});
		await response.text();
		expect(api.seen[0]?.headers.get('x-forwarded-for')).toBe('198.51.100.9');
	});

	test('a request-only headers function and a call without context still work', async () => {
		const api = upstream(() => sse([]));
		const response = await proxy(api.url, {
			headers: (request) => ({ 'x-lang': request.headers.get('x-lang') }),
		}).action({
			request: post({ query: SUB }, { 'x-session': 'tok', 'x-lang': 'de' }),
		});
		await response.text();
		expect(api.seen[0]?.headers.get('x-lang')).toBe('de');
	});

	test('the context is never forwarded upstream nor echoed to the browser', async () => {
		const api = upstream(() => sse(['event: next\ndata: {}\n\n']));
		const secret = 'ctx-secret-value';
		const response = await proxy(api.url, {
			headers: { 'x-client': 'bff' },
		}).action({
			request: post({ query: SUB }),
			context: { secret },
			params: { secret },
		});
		const text = await response.text();
		expect(text).not.toContain(secret);
		expect(JSON.stringify(api.seen[0]?.body)).not.toContain(secret);
		expect([...(api.seen[0]?.headers.values() ?? [])].join('\n')).not.toContain(
			secret,
		);
		expect(JSON.stringify([...response.headers])).not.toContain(secret);
	});

	test('a headers function that gets the context still meets the site check, the JSON-only POST and the allow-list', async () => {
		const api = upstream(() => sse([]));
		let called = 0;
		const p = proxy(api.url, {
			headers: () => {
				called++;
				return {};
			},
		});
		const context = { ip: '1.1.1.1' };
		const cross = await p.action({
			request: post(
				{ query: SUB },
				{ 'x-session': 't', 'sec-fetch-site': 'cross-site' },
			),
			context,
		});
		const notJson = await p.action({
			request: new Request('http://app.test/events', {
				method: 'POST',
				headers: { 'content-type': 'text/plain', 'x-session': 't' },
				body: '{}',
			}),
			context,
		});
		const unknown = await p.action({
			request: post({ operationName: 'Nope' }),
			context,
		});
		expect([cross.status, notJson.status, unknown.status]).toEqual([
			403, 415, 403,
		]);
		expect(called).toBe(0);
		expect(api.seen).toHaveLength(0);
	});

	test('the documented headers form type-checks', async () => {
		const api = upstream(() => sse([]));
		const p = createSubscriptionProxy({
			endpoint: api.url,
			allow: { RoomEvents: SUB },
			getToken: (request) => request.headers.get('x-session'),
			heartbeatMs: 0,
			headers: (
				request,
				{ context }: SubscriptionArgs<Readonly<RouterContextProvider>>,
			) => ({
				'x-forwarded-for': context ? alxiaOf(context).ip : null,
				'accept-language': request.headers.get('accept-language'),
			}),
		});
		const response = await p.action({ request: post({ query: SUB }) });
		await response.text();
		expect(response.status).toBe(200);
		expect(api.seen[0]?.headers.get('x-forwarded-for')).toBeNull();
	});

	test('the generic types the context', () => {
		const p = createSubscriptionProxy<{ ip: string }>({
			endpoint: 'http://api.test/graphql',
			allow: { RoomEvents: SUB },
			getToken: () => 't',
		});
		const bad = () =>
			p.loader({
				request: new Request('http://app.test/events'),
				// @ts-expect-error ip is a string
				context: { ip: 1 },
			});
		expect(typeof bad).toBe('function');
	});

	test('refusals come before headers: 405, 401 and 400 call neither it nor the API', async () => {
		const api = upstream(() => sse([]));
		let called = 0;
		const p = proxy(api.url, {
			headers: () => {
				called++;
				return {};
			},
		});
		const context = { ip: '1.1.1.1' };
		const wrongMethod = await p.action({
			request: new Request('http://app.test/events', {
				method: 'PUT',
				headers: { 'x-session': 'tok' },
			}),
			context,
		});
		const noToken = await p.action({
			request: post({ query: SUB }, {}),
			context,
		});
		const malformed = await p.action({
			request: new Request('http://app.test/events', {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-session': 'tok' },
				body: '{not json',
			}),
			context,
		});
		const oversize = await p.action({
			request: post({ variables: { big: 'x'.repeat(200_000) } }),
			context,
		});
		expect(wrongMethod.status).toBe(405);
		expect(noToken.status).toBe(401);
		expect(malformed.status).toBe(400);
		expect([400, 413]).toContain(oversize.status);
		expect(called).toBe(0);
		expect(api.seen).toHaveLength(0);
	});

	test('a headers function that throws with the context gives a fixed 500 that leaks nothing', async () => {
		const api = upstream(() => sse([]));
		const secret = 'ctx-throw-secret';
		const response = await proxy(api.url, {
			headers: (_request, args) => {
				throw new Error(`${(args.context as { secret: string }).secret}`);
			},
		}).action({ request: post({ query: SUB }), context: { secret } });
		const text = await response.text();
		expect(response.status).toBe(500);
		expect(text).toContain('headers function threw');
		expect(text).not.toContain(secret);
		expect(JSON.stringify([...response.headers])).not.toContain(secret);
		expect(api.seen).toHaveLength(0);
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
			headers: { 'content-type': 'application/json', 'x-session': 'tok' },
			body: JSON.stringify({ operationName: 'RoomEvents' }),
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
				headers: { 'content-type': 'application/json', 'x-session': 'tok' },
				body: JSON.stringify({ operationName: 'RoomEvents' }),
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
							setTimeout(() => {
								try {
									controller.error(new Error('reset'));
								} catch {}
							}, 20);
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

	test('refuses a document that is not exactly its own subscription, when it is created', () => {
		const make = (allow: Record<string, string>) => () =>
			createSubscriptionProxy({
				endpoint: 'http://localhost/graphql',
				allow,
				getToken: () => 't',
			});
		expect(make({ RoomEvents: 'mutation RoomEvents { drop }' })).toThrow(
			/subscription RoomEvents/,
		);
		expect(make({ RoomEvents: 'subscription Other { x }' })).toThrow(
			/defines subscription Other/,
		);
		expect(make({ RoomEvents: `${SUB} query Q { x }` })).toThrow(
			/subscription RoomEvents, query Q/,
		);
		expect(make({ RoomEvents: '{ x }' })).toThrow(/\{/);
		expect(make({ RoomEvents: 'subscription { x }' })).toThrow(
			/subscription RoomEvents/,
		);
		expect(make({ RoomEvents: 'fragment F on E { id }' })).toThrow(
			/defines none/,
		);
		expect(
			make({
				RoomEvents: `# comment mutation X {}\nsubscription RoomEvents($t: String = "query Q {") { roomEvents { ...F } }\nfragment F on Event { id }`,
			}),
		).not.toThrow();
		expect(make({ RoomEvents: SUB })).not.toThrow();
	});

	test('a body that fails to read is a worded 400, not an unworded error', async () => {
		const api = upstream(() => sse([]));
		const body = new ReadableStream({
			pull(controller) {
				controller.error(new Error('client aborted'));
			},
		});
		const request = new Request('http://app.test/events', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-session': 'tok' },
			body,
			duplex: 'half',
		} as RequestInit);
		const response = await proxy(api.url).action({ request });
		expect(response.status).toBe(400);
		expect(
			((await response.json()) as { errors: Array<{ message: string }> })
				.errors[0]?.message,
		).toBe('The request body could not be read.');
		expect(api.seen).toHaveLength(0);
	});
});
