import { describe, expect, test } from 'bun:test';
import { alxia, type BaseContext, defineMiddleware } from '@alxia/core';

/** `ctx.server`: the `Bun.Server` that took the request, or none without one. */
function makeApp() {
	return alxia()
		.ws('/news', {
			open: (socket) => socket.subscribe('news'),
			message: () => {},
		})
		.get('/serving', ({ server, reply }) =>
			reply(200, { url: server?.url.href ?? null }),
		)
		.post('/news', async ({ server, request, reply }) => {
			const said = await request.text();
			// Bun's own publish: the bytes as given, to every subscriber.
			const sent = server?.publish('news', JSON.stringify({ said })) ?? null;
			return reply(200, { sent });
		});
}

describe('ctx.server', () => {
	test('under listen, it is the server listen started', async () => {
		const app = makeApp();
		const server = app.listen({ port: 0, hostname: '127.0.0.1' });
		try {
			const response = await fetch(new URL('/serving', server.url));
			expect(await response.json()).toEqual({ url: server.url.href });
			expect(app.server).toBe(server);
		} finally {
			await app.stop(true);
		}
	});

	test('under app.fetch(request, server), it is the server given, the same object', async () => {
		let seen: unknown;
		const app = alxia().get('/', ({ server, reply }) => {
			seen = server;
			return reply(204);
		});
		const given = Bun.serve({
			port: 0,
			hostname: '127.0.0.1',
			fetch: (request, bun) => app.fetch(request, bun),
		});
		try {
			await fetch(given.url);
			expect(seen).toBe(given);
		} finally {
			await given.stop(true);
		}
	});

	test('under app.request and app.fetch(request) alone, it is undefined', async () => {
		const app = makeApp();
		const viaRequest = await app.request('/serving');
		expect(await viaRequest.json()).toEqual({ url: null });
		const viaFetch = await app.fetch(new Request('http://localhost/serving'));
		expect(await viaFetch.json()).toEqual({ url: null });
	});

	test('a use() middleware reads it too, on a request no route matches', async () => {
		const seen: unknown[] = [];
		const app = alxia().use(({ server }, next) => {
			seen.push(server);
			return next();
		});
		const server = app.listen({ port: 0, hostname: '127.0.0.1' });
		try {
			expect((await fetch(new URL('/missing', server.url))).status).toBe(404);
			await app.request('/missing');
			expect(seen).toEqual([server, undefined]);
		} finally {
			await app.stop(true);
		}
	});

	test("its publish reaches a socket route's subscribers", async () => {
		const app = makeApp();
		const server = app.listen({ port: 0, hostname: '127.0.0.1' });
		try {
			const url = new URL('/news', server.url);
			url.protocol = 'ws:';
			const socket = new WebSocket(url);
			const received = new Promise<unknown>((resolve) => {
				socket.onmessage = (event) => resolve(JSON.parse(String(event.data)));
			});
			await new Promise((resolve) => {
				socket.onopen = resolve;
			});
			// `open` subscribes once the socket is open: wait for it.
			while (server.subscriberCount('news') === 0) await Bun.sleep(5);
			const response = await fetch(new URL('/news', server.url), {
				method: 'POST',
				body: 'hello',
			});
			const { sent } = (await response.json()) as { sent: number };
			expect(sent).toBeGreaterThan(0);
			expect(await received).toEqual({ said: 'hello' });
			socket.close();
		} finally {
			await app.stop(true);
		}
	});

	test('it is typed Bun.Server<unknown> | undefined, everywhere a context is', () => {
		const typed = () => {
			const read = (ctx: BaseContext) => {
				const server: Bun.Server<unknown> | undefined = ctx.server;
				// @ts-expect-error: undefined without a server, so not a Server alone
				const bare: Bun.Server<unknown> = ctx.server;
				// @ts-expect-error: read-only, as the rest of the request
				ctx.server = undefined;
				return { server, bare };
			};
			const shared = defineMiddleware(({ server }, next) =>
				next({ port: server?.port }),
			);
			alxia()
				.use(shared)
				.get('/', ({ server, port, reply }) =>
					reply(200, { url: server?.url.href ?? null, port: port ?? null }),
				);
			return read;
		};
		expect(typed).toBeFunction();
	});
});
