import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { send, toRequest } from './node';

let handle: (request: Request) => Promise<Response>;
let server: Server;
let base: string;

beforeAll(async () => {
	server = createServer((req, res) => {
		void handle(toRequest(req, res)).then((response) => send(res, response));
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
	server.close();
});

describe('node:http to Request and back', () => {
	test('the method, URL, headers and body arrive as sent', async () => {
		handle = async (request) =>
			Response.json({
				method: request.method,
				url: request.url,
				custom: request.headers.get('x-custom'),
				body: await request.text(),
			});
		const response = await fetch(`${base}/echo?q=1`, {
			method: 'POST',
			headers: { 'x-custom': 'yes' },
			body: 'hello',
		});
		expect(await response.json()).toEqual({
			method: 'POST',
			url: `${base}/echo?q=1`,
			custom: 'yes',
			body: 'hello',
		});
	});

	test('a GET has no body', async () => {
		handle = async (request) => new Response(String(request.body === null));
		expect(await (await fetch(`${base}/`)).text()).toBe('true');
	});

	test('the status, headers and every Set-Cookie go back', async () => {
		handle = async () => {
			const headers = new Headers({ 'x-reply': 'ok' });
			headers.append('set-cookie', 'a=1; Path=/');
			headers.append('set-cookie', 'b=2; Path=/');
			return new Response('made', { status: 201, headers });
		};
		const response = await fetch(`${base}/`);
		expect(response.status).toBe(201);
		expect(response.headers.get('x-reply')).toBe('ok');
		expect(response.headers.getSetCookie()).toEqual([
			'a=1; Path=/',
			'b=2; Path=/',
		]);
		expect(await response.text()).toBe('made');
	});

	test('a body with none is ended at once', async () => {
		handle = async () => new Response(null, { status: 204 });
		const response = await fetch(`${base}/`);
		expect(response.status).toBe(204);
		expect(await response.text()).toBe('');
	});

	test('a streamed body is sent chunk by chunk', async () => {
		handle = async () =>
			new Response(
				new ReadableStream<Uint8Array>({
					async start(controller) {
						controller.enqueue(new TextEncoder().encode('first'));
						await Bun.sleep(300);
						controller.enqueue(new TextEncoder().encode('second'));
						controller.close();
					},
				}),
			);
		const started = performance.now();
		const response = await fetch(`${base}/`);
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		const first = await reader.read();
		const at = performance.now() - started;
		expect(new TextDecoder().decode(first.value)).toBe('first');
		expect(at).toBeLessThan(250);
		let rest = '';
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			rest += new TextDecoder().decode(value);
		}
		expect(rest).toBe('second');
	});

	test('the request is aborted when the client goes away', async () => {
		const aborted = Promise.withResolvers<boolean>();
		handle = async (request) => {
			request.signal.addEventListener('abort', () => aborted.resolve(true));
			return new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode('open'));
					},
				}),
			);
		};
		const client = new AbortController();
		const response = await fetch(`${base}/`, { signal: client.signal });
		await (response.body as ReadableStream<Uint8Array>).getReader().read();
		client.abort();
		expect(await aborted.promise).toBe(true);
	});
});
