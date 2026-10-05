/**
 * Any `(ctx, next)` function is a middleware: written inline or kept in a
 * const, with no `defineMiddleware` around it, it runs wherever a
 * middleware is given — `use`, a route's middlewares, a socket's upgrade
 * and `route(operation)` — and what it passes `next` reaches what follows.
 */
import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import type { BaseContext, NextFunction } from './types';

/** A plain function, no mark on it: `x` for what follows. */
const addsX = (_ctx: BaseContext, next: NextFunction) => next({ x: 1 });

const getThing = {
	method: 'GET',
	path: '/things/:id',
	schema: {
		params: z.object({ id: z.coerce.number() }),
		response: { 200: z.object({ id: z.number(), x: z.number() }) },
	},
} as const;

describe('a plain (ctx, next) => next({ x: 1 }) function', () => {
	test('given to use(), adds x to the routes after it', async () => {
		const app = alxia()
			.use(addsX)
			.get('/', ({ x, reply }) => {
				expectTypeOf(x).toEqualTypeOf<number>();
				return reply(200, { x });
			});
		expect(await (await app.request('/')).json()).toEqual({ x: 1 });
	});

	test("among a route's middlewares, inline or kept in a const", async () => {
		const app = alxia().get(
			'/',
			addsX,
			({ x }, next) => next({ y: x + 1 }),
			({ x, y, reply }) => reply(200, { x, y }),
		);
		expect(await (await app.request('/')).json()).toEqual({ x: 1, y: 2 });
	});

	test("among route(operation)'s middlewares", async () => {
		const app = alxia().route(getThing, addsX, ({ params, x, reply }) =>
			reply(200, { id: params.id, x }),
		);
		const response = await app.request('/things/7');
		expect(await response.json()).toEqual({ id: 7, x: 1 });
	});

	test("on a socket's upgrade, what it adds on the socket's data", async () => {
		const app = alxia().ws('/live', addsX, {
			open: (socket) => socket.send({ x: socket.data.x }),
			message: () => {},
		});
		const server = app.listen({ port: 0 });
		try {
			const url = new URL('/live', server.url);
			url.protocol = 'ws:';
			const socket = new WebSocket(url);
			const received = await new Promise<string>((resolve) => {
				socket.onmessage = (event) => resolve(String(event.data));
			});
			socket.close();
			expect(JSON.parse(received)).toEqual({ x: 1 });
		} finally {
			await server.stop(true);
		}
	});
});
