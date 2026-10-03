import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia, eventStream } from '@alxia/core';
import { z } from 'zod';
import { client } from './client';
import { openSocket } from './ws/socket';

const Tick = z.object({ n: z.number(), at: z.date() });

const app = alxia()
	.get(
		'/ticks',
		{
			query: z.object({ count: z.coerce.number().int().max(10) }),
			response: { 200: eventStream(Tick) },
		},
		({ query, reply }) =>
			reply(
				200,
				(async function* () {
					for (let n = 1; n <= query.count; n++) {
						yield { n, at: new Date(0) };
					}
				})(),
			),
	)
	.get(
		'/me',
		{ cookies: z.object({ session: z.string() }) },
		({ cookies, reply }) => reply(200, cookies.session),
	)
	.ws(
		'/whoami',
		{
			headers: z.object({ 'x-user': z.string() }),
			cookies: z.object({ session: z.string(), theme: z.string().optional() }),
			send: z.object({
				user: z.string(),
				session: z.string(),
				theme: z.string().optional(),
			}),
		},
		{
			open: (socket) =>
				socket.send({
					user: socket.data.headers['x-user'],
					session: socket.data.cookies.session,
					theme: socket.data.cookies.theme,
				}),
			message: () => {},
		},
	)
	.ws(
		'/echo/:room',
		{
			message: z.object({ text: z.string() }),
			send: z.object({ room: z.string(), text: z.string() }),
		},
		{
			message: (socket, message) =>
				socket.send({ room: socket.data.params.room, text: message.text }),
		},
	);

describe('server-sent events', () => {
	test('the data is an async iterable of the events, as they cross the wire', async () => {
		const result = await client(app).get('/ticks', { query: { count: 3 } });
		if (result.status !== 200) throw new Error(`got ${result.status}`);
		expectTypeOf(result.data).toEqualTypeOf<
			AsyncIterable<{ n: number; at: string }>
		>();
		const ticks: number[] = [];
		for await (const tick of result.data) ticks.push(tick.n);
		expect(ticks).toEqual([1, 2, 3]);
	});
});

describe('named server-sent events', () => {
	const Push = eventStream({
		state: z.object({
			changed: z.record(z.string(), z.string()),
			at: z.date(),
		}),
		ping: z.object({ interval: z.number() }),
	});
	const push = alxia().get('/push', { response: { 200: Push } }, ({ reply }) =>
		reply(
			200,
			(async function* () {
				yield Push.event('ping', { interval: 30 });
				yield Push.event(
					'state',
					{ changed: { Email: 's1' }, at: new Date(0) },
					{ id: 's1', retry: 1000 },
				);
			})(),
		),
	);

	test('the data is a union of the events, discriminated by event', async () => {
		const result = await client(push).get('/push');
		if (result.status !== 200) throw new Error(`got ${result.status}`);
		const read: unknown[] = [];
		for await (const item of result.data) {
			// @ts-expect-error: `interval` is a ping's alone, until `event` says which
			item.data.interval;
			if (item.event === 'ping') {
				expectTypeOf(item.data).toEqualTypeOf<{ interval: number }>();
			} else {
				expectTypeOf(item.event).toEqualTypeOf<'state'>();
				expectTypeOf(item.data).toEqualTypeOf<{
					changed: Record<string, string>;
					at: string;
				}>();
				expectTypeOf(item.id).toEqualTypeOf<string | undefined>();
			}
			read.push(item);
		}
		expect(read).toEqual([
			{ event: 'ping', data: { interval: 30 } },
			{
				event: 'state',
				data: { changed: { Email: 's1' }, at: '1970-01-01T00:00:00.000Z' },
				id: 's1',
			},
		]);
	});

	test('through listen, the events arrive the same', async () => {
		const server = push.listen({ port: 0 });
		try {
			const result = await client<typeof push>(server.url).get('/push');
			if (result.status !== 200) throw new Error(`got ${result.status}`);
			const events: string[] = [];
			for await (const item of result.data) events.push(item.event);
			expect(events).toEqual(['ping', 'state']);
		} finally {
			await push.stop(true);
		}
	});
});

describe('leaving early', () => {
	test('a break out of an event stream ends it quietly', async () => {
		const endless = alxia().get('/forever', ({ reply }) =>
			reply(
				200,
				(async function* () {
					for (let n = 0; ; n++) {
						yield n;
						await Bun.sleep(1);
					}
				})(),
			),
		);
		const original = console.error;
		const logged: unknown[] = [];
		console.error = (...args: unknown[]) => logged.push(args);
		try {
			const result = await client(endless).get('/forever');
			for await (const n of result.data as AsyncIterable<number>) {
				if (n === 2) break;
			}
			await Bun.sleep(50);
		} finally {
			console.error = original;
		}
		expect(logged).toEqual([]);
	});

	test('an aborted call rejects in process, as fetch does', async () => {
		const slow = alxia().get('/slow', async ({ reply }) => {
			await Bun.sleep(200);
			return reply(200, 'late');
		});
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 10);
		await expect(
			client(slow).get('/slow', { signal: controller.signal }),
		).rejects.toThrow(expect.objectContaining({ name: 'AbortError' }));
	});
});

describe('cookies', () => {
	test('typed cookies are sent as the cookie header', async () => {
		const result = await client(app).get('/me', {
			cookies: { session: 'abc' },
		});
		expect(result.data).toBe('abc');
	});
});

describe('websockets', () => {
	test('a typed socket sends and receives JSON', async () => {
		const server = app.listen({ port: 0 });
		try {
			const api = client<typeof app>(server.url);
			const socket = api.ws('/echo/:room', { params: { room: 'lobby' } });
			socket.send({ text: 'hi' });
			const iterator = socket[Symbol.asyncIterator]();
			const first = await iterator.next();
			expectTypeOf<Parameters<typeof socket.send>[0]>().toEqualTypeOf<{
				text: string;
			}>();
			expect(first.value).toEqual({ room: 'lobby', text: 'hi' });
			socket.close();
		} finally {
			await app.stop(true);
		}
	});

	test('its typed headers and cookies go with the upgrade', async () => {
		const server = app.listen({ port: 0 });
		try {
			const socket = client<typeof app>(server.url, {
				headers: { cookie: 'theme=dark' },
			}).ws('/whoami', {
				headers: { 'x-user': 'ada' },
				cookies: { session: 'abc' },
			});
			const first = await socket[Symbol.asyncIterator]().next();
			expect(first.value).toEqual({
				user: 'ada',
				session: 'abc',
				theme: 'dark',
			});
			socket.close();
		} finally {
			await app.stop(true);
		}
	});

	test("outside Bun, the call's own headers are refused, the client's left out", () => {
		const url = new URL('ws://127.0.0.1:9/x');
		const own = new Headers({ 'x-user': 'ada' });
		expect(() => openSocket(url, { merged: own, own }, false)).toThrow(
			"ws(/x): outside Bun, a WebSocket cannot send headers or cookies; a browser sends its own cookies for the socket's host, and anything else goes in the query",
		);
		const socket = openSocket(
			url,
			{ merged: new Headers({ authorization: 'x' }), own: new Headers() },
			false,
		);
		expect(socket.raw).toBeInstanceOf(WebSocket);
		socket.close();
	});

	test('in process, a socket is refused: it needs a server', () => {
		expect(() =>
			client(app).ws('/echo/:room', { params: { room: 'a' } }),
		).toThrow('needs a server');
	});
});
