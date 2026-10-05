import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { serve, until, upstream } from '../test/upstream';
import { proxy } from './index';

/** A port nothing listens on: one a server held, then gave back. */
function closedPort(): URL {
	const server = Bun.serve({ port: 0, fetch: () => new Response() });
	const url = server.url;
	server.stop(true);
	return url;
}

/** An upstream that never answers, and whether the proxy gave up on it. */
function hanging() {
	const state = { started: 0, aborted: 0 };
	const up = upstream(
		(request) =>
			new Promise<Response>(() => {
				state.started++;
				request.signal.addEventListener('abort', () => {
					state.aborted++;
				});
			}),
	);
	return { up, state };
}

describe('an upstream that fails', () => {
	test('a refused connection is a 502, without the upstream address', async () => {
		const response = await alxia().use(proxy(closedPort())).request('/x');
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ error: 'bad_gateway' });
	});

	test('no headers within timeout is a 504', async () => {
		const { up } = hanging();
		const started = performance.now();
		const response = await alxia()
			.use(proxy(up.url, { timeout: 100 }))
			.request('/');
		expect(response.status).toBe(504);
		expect(await response.json()).toEqual({ error: 'gateway_timeout' });
		expect(performance.now() - started).toBeGreaterThanOrEqual(95);
	});

	test("under errors: 'problem', both are problems", async () => {
		const app = alxia({ errors: 'problem' }).use('/down', proxy(closedPort()));
		const down = await app.request('/down');
		expect(down.headers.get('content-type')).toBe('application/problem+json');
		expect(await down.json()).toEqual({
			type: 'about:blank',
			title: 'Bad Gateway',
			status: 502,
			detail: 'The upstream server could not be reached',
			instance: '/down',
		});
		const { up } = hanging();
		const slow = alxia({ errors: 'problem' }).use(
			proxy(up.url, { timeout: 50 }),
		);
		const late = await slow.request('/late');
		expect(late.headers.get('content-type')).toBe('application/problem+json');
		expect(await late.json()).toMatchObject({
			status: 504,
			title: 'Gateway Timeout',
		});
	});

	test('the timeout ends with the headers: a slow body is not cut', async () => {
		const up = upstream(
			() =>
				new Response(
					new ReadableStream({
						async start(controller) {
							controller.enqueue(new TextEncoder().encode('late '));
							await Bun.sleep(150);
							controller.enqueue(new TextEncoder().encode('but whole'));
							controller.close();
						},
					}),
				),
		);
		const response = await alxia()
			.use(proxy(up.url, { timeout: 50 }))
			.request('/');
		expect(await response.text()).toBe('late but whole');
	});

	test('the timeout counts silence: a slow upload that keeps sending is not cut', async () => {
		const up = upstream(async (request) => new Response(await request.text()));
		const url = serve(alxia().use(proxy(up.url, { timeout: 300 })));
		const body = new ReadableStream<Uint8Array>({
			async start(controller) {
				for (let i = 0; i < 5; i++) {
					controller.enqueue(new TextEncoder().encode(String(i)));
					await Bun.sleep(150); // 750 ms in all, more than the timeout
				}
				controller.close();
			},
		});
		const response = await fetch(url, {
			method: 'POST',
			body,
			duplex: 'half',
		} as RequestInit);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('01234');
	});
});

describe('aborting', () => {
	test("the client's abort aborts the upstream request", async () => {
		const { up, state } = hanging();
		const url = serve(alxia().use(proxy(up.url)));
		const controller = new AbortController();
		const sent = fetch(url, { signal: controller.signal }).catch(
			() => 'aborted',
		);
		await until(() => state.started === 1);
		controller.abort();
		expect(await sent).toBe('aborted');
		await until(() => state.aborted === 1);
		expect(state.aborted).toBe(1);
	});

	test('a shutdown lets the request finish within the drain, then aborts it upstream', async () => {
		const { up, state } = hanging();
		const app = alxia().use(proxy(up.url));
		const url = serve(app, { shutdownTimeout: 150 });
		const sent = fetch(url).catch(() => 'cut');
		await until(() => state.started === 1);
		const started = performance.now();
		const stopped = app.stop();
		await Bun.sleep(50);
		expect(state.aborted).toBe(0); // still draining
		await stopped;
		await until(() => state.aborted === 1);
		expect(state.aborted).toBe(1);
		expect(performance.now() - started).toBeGreaterThanOrEqual(145);
		expect(await sent).toBe('cut');
	});

	test('a shutdown ends a stream of server-sent events at once, cleanly', async () => {
		let cancelled = false;
		const up = upstream(
			() =>
				new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode('data: 1\n\n'));
						},
						cancel() {
							cancelled = true;
						},
					}),
					{ headers: { 'content-type': 'text/event-stream' } },
				),
		);
		const app = alxia().use(proxy(up.url));
		const url = serve(app, { shutdownTimeout: 5_000 });
		const response = await fetch(url);
		const text = response.text();
		const started = performance.now();
		await app.stop();
		expect(performance.now() - started).toBeLessThan(1_000);
		expect(await text).toBe('data: 1\n\n');
		await until(() => cancelled);
		expect(cancelled).toBe(true);
	});
});
