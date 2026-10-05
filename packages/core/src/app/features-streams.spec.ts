/** Responses that stay open: server-sent events and websockets. */
import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { eventStream } from '../sse/event-stream';
import { alxia } from './alxia';
import { responds } from './validate';

describe('server-sent events', () => {
	const Tick = z.object({ n: z.number() });
	const app = alxia()
		.get('/ticks', responds({ 200: eventStream(Tick) }), ({ reply }) =>
			reply(
				200,
				(async function* () {
					yield { n: 1 };
					yield { n: 2 };
				})(),
			),
		)
		.get('/free', ({ reply }) =>
			reply(
				200,
				(async function* () {
					yield 'a';
				})(),
			),
		);

	test('each value is an event of JSON', async () => {
		const response = await app.request('/ticks');
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		expect(await response.text()).toBe('data: {"n":1}\n\ndata: {"n":2}\n\n');
	});

	test('an event its schema refuses ends the stream', async () => {
		const original = console.error;
		console.error = () => {};
		try {
			const broken = alxia().get(
				'/broken',
				responds({ 200: eventStream(Tick) }),
				({ reply }) =>
					reply(
						200,
						(async function* () {
							yield { n: 1 };
							yield JSON.parse('{"n":"x"}');
						})(),
					),
			);
			const response = await broken.request('/broken');
			await expect(response.text()).rejects.toThrow();
		} finally {
			console.error = original;
		}
	});
});

describe('websockets', () => {
	const Chat = z.object({ text: z.string().min(1) });
	const app = alxia()
		.derive(({ request }) => ({
			user: new URL(request.url).searchParams.get('user') ?? 'anonymous',
		}))
		.ws(
			'/rooms/:room',
			{ message: Chat, send: z.object({ from: z.string(), text: z.string() }) },
			{
				open(socket) {
					expectTypeOf(socket.data.params.room).toBeString();
					socket.subscribe(socket.data.params.room);
				},
				async message(socket, chat) {
					expectTypeOf(chat).toEqualTypeOf<{ text: string }>();
					await socket.send({ from: socket.data.user, text: chat.text });
				},
			},
		);

	test('messages are validated, replies sent as JSON', async () => {
		const server = app.listen({ port: 0 });
		try {
			const url = new URL('/rooms/lobby?user=ada', server.url);
			url.protocol = 'ws:';
			const socket = new WebSocket(url);
			const received: unknown[] = [];
			const done = new Promise<void>((resolve) => {
				socket.onmessage = (event) => {
					received.push(JSON.parse(String(event.data)));
					if (received.length === 2) resolve();
				};
			});
			await new Promise((resolve) => {
				socket.onopen = resolve;
			});
			socket.send(JSON.stringify({ text: '' }));
			socket.send(JSON.stringify({ text: 'hello' }));
			await done;
			socket.close();
			expect(received[0]).toMatchObject({ error: 'validation' });
			expect(received[1]).toEqual({ from: 'ada', text: 'hello' });
		} finally {
			await app.stop(true);
		}
	});

	test('Bun.serve opens them with fetch and websocket, as listen does', async () => {
		const server = Bun.serve({
			port: 0,
			fetch: app.fetch,
			websocket: app.websocket,
		});
		try {
			const url = new URL('/rooms/lobby?user=grace', server.url);
			url.protocol = 'ws:';
			const socket = new WebSocket(url);
			const received = new Promise<unknown>((resolve) => {
				socket.onmessage = (event) => resolve(JSON.parse(String(event.data)));
			});
			await new Promise((resolve) => {
				socket.onopen = resolve;
			});
			socket.send(JSON.stringify({ text: 'hi' }));
			expect(await received).toEqual({ from: 'grace', text: 'hi' });
			socket.close();
		} finally {
			await server.stop(true);
		}
	});

	test('without a server, or without an upgrade, a socket route is a 426', async () => {
		const response = await app.request('/rooms/lobby');
		expect(response.status).toBe(426);
	});
});
