/**
 * Nothing is buffered: each spec holds one side back until the other has
 * seen the first chunk, which a proxy that buffered would never deliver.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { serve, until, upstream } from '../test/upstream';
import { proxy } from './index';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A promise and the function that resolves it. */
function gate(): { opened: Promise<void>; open: () => void } {
	let open = () => {};
	const opened = new Promise<void>((resolve) => {
		open = resolve;
	});
	return { opened, open };
}

describe('the request body', () => {
	test('reaches the upstream chunk by chunk, before the client has sent it all', async () => {
		const firstChunk = gate();
		const up = upstream(async (request) => {
			const reader = (request.body as ReadableStream<Uint8Array>).getReader();
			const first = await reader.read();
			firstChunk.open();
			let rest = '';
			for (
				let chunk = await reader.read();
				!chunk.done;
				chunk = await reader.read()
			) {
				rest += decoder.decode(chunk.value);
			}
			return new Response(`${decoder.decode(first.value)}|${rest}`);
		});
		const url = serve(alxia().use(proxy(up.url)));
		const body = new ReadableStream<Uint8Array>({
			async start(controller) {
				controller.enqueue(encoder.encode('first'));
				// Held until the upstream read the first chunk: a buffering
				// proxy would wait for the end of the body, which never comes.
				await firstChunk.opened;
				controller.enqueue(encoder.encode('second'));
				controller.close();
			},
		});
		const response = await fetch(url, {
			method: 'POST',
			body,
			duplex: 'half',
		} as RequestInit);
		expect(await response.text()).toBe('first|second');
	});
});

describe('a large body', () => {
	test('32 MiB echoed through come back byte for byte', async () => {
		const bytes = new Uint8Array(32 * 1024 * 1024);
		for (let at = 0; at < bytes.length; at += 65_536) {
			crypto.getRandomValues(bytes.subarray(at, at + 65_536));
		}
		const up = upstream((request) => new Response(request.body));
		const url = serve(alxia().use(proxy(up.url)));
		const response = await fetch(url, { method: 'POST', body: bytes });
		const back = new Uint8Array(await response.arrayBuffer());
		expect(back.length).toBe(bytes.length);
		expect(Bun.hash(back)).toBe(Bun.hash(bytes));
	});
});

describe('the response body', () => {
	test('reaches the client chunk by chunk, before the upstream has sent it all', async () => {
		const clientGotFirst = gate();
		const up = upstream(
			() =>
				new Response(
					new ReadableStream<Uint8Array>({
						async start(controller) {
							controller.enqueue(encoder.encode('first'));
							await clientGotFirst.opened;
							controller.enqueue(encoder.encode('second'));
							controller.close();
						},
					}),
				),
		);
		const url = serve(alxia().use(proxy(up.url)));
		const response = await fetch(url);
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		const first = await reader.read();
		expect(decoder.decode(first.value)).toBe('first');
		clientGotFirst.open();
		let rest = '';
		for (
			let chunk = await reader.read();
			!chunk.done;
			chunk = await reader.read()
		) {
			rest += decoder.decode(chunk.value);
		}
		expect(rest).toBe('second');
	});

	test('server-sent events pass through as they are sent, unbuffered', async () => {
		const next = gate();
		let cancelled = false;
		const up = upstream(
			() =>
				new Response(
					new ReadableStream<Uint8Array>({
						async start(controller) {
							controller.enqueue(encoder.encode('event: tick\ndata: 1\n\n'));
							await next.opened;
							controller.enqueue(encoder.encode('event: tick\ndata: 2\n\n'));
						},
						cancel() {
							cancelled = true;
						},
					}),
					{
						headers: {
							'content-type': 'text/event-stream',
							'cache-control': 'no-cache',
						},
					},
				),
		);
		const url = serve(alxia().use(proxy(up.url)));
		const controller = new AbortController();
		const response = await fetch(url, { signal: controller.signal });
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		expect(decoder.decode((await reader.read()).value)).toBe(
			'event: tick\ndata: 1\n\n',
		);
		next.open();
		expect(decoder.decode((await reader.read()).value)).toBe(
			'event: tick\ndata: 2\n\n',
		);
		// The client leaves: the upstream's stream is cancelled behind it.
		controller.abort();
		await until(() => cancelled);
		expect(cancelled).toBe(true);
	});
});
