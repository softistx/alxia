import { describe, expect, spyOn, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';
import { responds, validate } from './validate';

/** A `user` from `x-user`, or a 401. */
const auth = defineMiddleware(({ request, reply }, next) => {
	const id = request.headers.get('x-user');
	if (id === null) return reply(401, { error: 'unauthorized' as const });
	return next({ user: { id } });
});

const Strict = z.object({ id: z.string() });

describe('a socket route, its middlewares and validate', () => {
	test('refuses responds, which has no reply to check there', () => {
		expect(() =>
			alxia().ws('/', responds({ 200: Strict }) as never, {
				message: () => {},
			}),
		).toThrow(
			'WS /: responds() checks replies, and a socket route sends none: check its messages with the `send` option',
		);
	});

	test('runs its middlewares and validate on the upgrade, then opens', async () => {
		const around: number[] = [];
		const app = alxia().ws(
			'/rooms/:room',
			{ send: z.object({ room: z.string(), by: z.string() }) },
			auth,
			async (_ctx, next) => {
				const response = await next();
				around.push(response.status);
				return response;
			},
			validate({ query: z.object({ v: z.literal('1') }) }),
			{
				open: (socket) =>
					socket.send({
						room: socket.data.params.room,
						by: socket.data.user.id,
					}),
				message: () => {},
			},
		);
		const server = app.listen({ port: 0 });
		try {
			const upgrade = { upgrade: 'websocket' };
			const refused = await app.request('/rooms/lobby?v=1', {
				headers: upgrade,
			});
			expect(refused.status).toBe(401);
			const invalid = await app.request('/rooms/lobby?v=2', {
				headers: { ...upgrade, 'x-user': 'ada' },
			});
			expect(invalid.status).toBe(400);
			const url = new URL('/rooms/lobby?v=1', server.url);
			url.protocol = 'ws:';
			// Bun's WebSocket takes headers; the DOM's type does not say so.
			const socket = new WebSocket(url, {
				headers: { 'x-user': 'ada' },
			} as never);
			const received = await new Promise<unknown>((resolve) => {
				socket.onmessage = (event) => resolve(JSON.parse(String(event.data)));
			});
			socket.close();
			expect(received).toEqual({ room: 'lobby', by: 'ada' });
			// The 400 went through it, then the upgrade's stand-in response.
			expect(around).toEqual([400, 200]);
		} finally {
			await server.stop(true);
		}
	});
});

describe('a middleware around a socket route', () => {
	const open = async (app: ReturnType<typeof alxia>) => {
		const server = app.listen({ port: 0 });
		const url = new URL('/', server.url);
		url.protocol = 'ws:';
		const socket = new WebSocket(url);
		const echoed = await new Promise<string>((resolve, reject) => {
			socket.onopen = () => socket.send('ping');
			socket.onmessage = (event) => resolve(String(event.data));
			socket.onerror = () => reject(new Error('no socket'));
		});
		socket.close();
		await server.stop(true);
		return echoed;
	};

	test('that wraps every response of use() is ignored once the socket is open', async () => {
		const error = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const opened: string[] = [];
			const wrapping = defineMiddleware(async (_ctx, next) => {
				const response = await next();
				return new Response(response.body, {
					status: response.status,
					headers: { 'x-wrapped': '1' },
				});
			});
			const app = alxia()
				.use(wrapping)
				.ws('/', {
					open: () => {
						opened.push('open');
					},
					message: (socket, message) => socket.send(`echo ${message}`),
				});
			expect(await open(app as never)).toBe('"echo ping"');
			expect(opened).toEqual(['open']);
			expect(error).not.toHaveBeenCalled();
		} finally {
			error.mockRestore();
		}
	});

	test('that throws after the upgrade is logged, and the socket stays open', async () => {
		const error = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const app = alxia().ws(
				'/',
				async (_ctx, next) => {
					await next();
					throw new Error('after the upgrade');
				},
				{ message: (socket, message) => socket.send(`echo ${message}`) },
			);
			expect(await open(app as never)).toBe('"echo ping"');
			expect(String(error.mock.calls[0]?.[0])).toContain('after the upgrade');
		} finally {
			error.mockRestore();
		}
	});
});
