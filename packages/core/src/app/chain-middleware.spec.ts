import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';

/** Every rejection nobody handled while a test ran. */
let unhandled: unknown[] = [];
const record = (reason: unknown) => unhandled.push(reason);
beforeEach(() => {
	unhandled = [];
	process.on('unhandledRejection', record);
});
afterEach(() => {
	process.off('unhandledRejection', record);
});

const settled = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('a middleware that calls next() and returns nothing', () => {
	test('answers with the rest of the route, awaited or not, as Koa and Hono do', async () => {
		const ran: string[] = [];
		const app = alxia()
			.get(
				'/awaited',
				(async (_ctx: unknown, next: () => Promise<Response>) => {
					await next();
					ran.push('after');
				}) as never,
				({ reply }) => reply(201, { ok: true }),
			)
			.get(
				'/not-awaited',
				((_ctx: unknown, next: () => Promise<Response>) => {
					next();
				}) as never,
				({ reply }) => reply(202, 'later'),
			);
		const awaited = await app.request('/awaited');
		expect(awaited.status).toBe(201);
		expect(await awaited.json()).toEqual({ ok: true });
		expect(ran).toEqual(['after']);
		const later = await app.request('/not-awaited');
		expect(later.status).toBe(202);
		expect(await later.text()).toBe('later');
	});

	test('passes the rest\'s error on to the route\'s onError hooks', async () => {
		const app = alxia()
			.onError((error, { reply }) => reply(503, String(error)))
			.get(
				'/',
				(async (_ctx: unknown, next: () => Promise<Response>) => {
					await next().catch(() => {});
				}) as never,
				() => {
					throw new Error('down');
				},
			);
		const response = await app.request('/');
		expect(response.status).toBe(503);
		expect(await response.text()).toBe('Error: down');
	});
});

describe('a middleware that returns before the next() it called settled', () => {
	test('sends its reply once the rest has run, and logs the rest\'s error rather than leave it unhandled', async () => {
		const warn = spyOn(console, 'warn').mockImplementation(() => {});
		const error = spyOn(console, 'error').mockImplementation(() => {});
		try {
			let handled = false;
			const app = alxia().get(
				'/',
				((ctx: { reply: (status: 403, body: string) => unknown }, next: () => Promise<Response>) => {
					next();
					return ctx.reply(403, 'forbidden');
				}) as never,
				async () => {
					await Promise.resolve();
					handled = true;
					throw new Error('the handler ran');
				},
			);
			const response = await app.request('/');
			expect(response.status).toBe(403);
			expect(handled).toBe(true);
			await settled();
			expect(unhandled).toEqual([]);
			expect(String(warn.mock.calls[0]?.[0])).toContain(
				'GET /: a middleware returned before the next() it called settled',
			);
			expect(String(error.mock.calls[0]?.[0])).toContain('the handler ran');
		} finally {
			warn.mockRestore();
			error.mockRestore();
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
