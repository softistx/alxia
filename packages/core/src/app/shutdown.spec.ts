/**
 * The graceful shutdown, on a real `Bun.serve`: a request in flight
 * finishes while a new connection is refused, a socket closes with 1001,
 * a stream of events ends, the `onStop` hooks run once the drain is
 * over, and `shutdownTimeout` bounds the wait.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from './alxia';
import { shutdownSignal } from './served';

const slowApp = (order: string[], ms = 300) =>
	alxia()
		.onStop(() => {
			order.push('onStop');
		})
		.get('/slow', async ({ reply }) => {
			await Bun.sleep(ms);
			order.push('slow answered');
			return reply(200, 'done');
		})
		.get('/fast', ({ reply }) => reply(200, 'fast'));

describe('stop(): a graceful shutdown', () => {
	test('a slow request finishes during the drain, a new one is refused, then onStop runs', async () => {
		const order: string[] = [];
		const app = slowApp(order);
		const server = app.listen({ port: 0, signals: false });
		const url = server.url.href;
		const slow = fetch(`${url}slow`).then((response) => response.text());
		await Bun.sleep(50);
		const stopped = app.stop();
		const refused = await fetch(`${url}fast`).then(
			() => 'answered',
			(error: { code?: string }) => error.code ?? 'refused',
		);
		expect(refused).toBe('ConnectionRefused');
		expect(await slow).toBe('done');
		await stopped;
		expect(order).toEqual(['slow answered', 'onStop']);
		expect(app.server).toBeUndefined();
	});

	test('a request past shutdownTimeout is cut, and onStop still runs', async () => {
		const order: string[] = [];
		const app = slowApp(order, 2_000);
		const server = app.listen({
			port: 0,
			signals: false,
			shutdownTimeout: 100,
		});
		const slow = fetch(`${server.url.href}slow`).then(
			() => 'answered',
			() => 'cut',
		);
		await Bun.sleep(50);
		const start = performance.now();
		await app.stop();
		expect(performance.now() - start).toBeLessThan(1_000);
		expect(await slow).toBe('cut');
		expect(order).toEqual(['onStop']);
	});

	test('stop() twice is one shutdown: onStop runs once', async () => {
		const order: string[] = [];
		const app = slowApp(order);
		app.listen({ port: 0, signals: false });
		await Promise.all([app.stop(), app.stop()]);
		expect(order).toEqual(['onStop']);
	});
});

describe('stop(): sockets, streams and the signal', () => {
	test('an open socket is closed with 1001, going away', async () => {
		const app = alxia().ws('/socket', { message: () => {} });
		const server = app.listen({ port: 0, signals: false });
		const socket = new WebSocket(
			`${server.url.href.replace('http', 'ws')}socket`,
		);
		await new Promise((resolve) => {
			socket.onopen = resolve;
		});
		const closed = new Promise<number>((resolve) => {
			socket.onclose = (event) => resolve(event.code);
		});
		await app.stop();
		expect(await closed).toBe(1001);
	});

	test('a stream of events ends, so the drain does not wait for it', async () => {
		const app = alxia().get('/events', ({ reply }) =>
			reply(
				200,
				(async function* () {
					yield { n: 1 };
					await new Promise(() => {});
				})(),
			),
		);
		const server = app.listen({ port: 0, signals: false });
		const response = await fetch(`${server.url.href}events`);
		const read = response.text();
		await Bun.sleep(50);
		const start = performance.now();
		await app.stop();
		expect(performance.now() - start).toBeLessThan(2_000);
		expect(await read).toContain('data: {"n":1}');
	});

	test('shutdownSignal aborts as the shutdown starts, and a new listen starts afresh', async () => {
		const signals: AbortSignal[] = [];
		const app = alxia().get('/signal', (ctx) => {
			signals.push(shutdownSignal(ctx));
			return ctx.reply(200);
		});
		const first = app.listen({ port: 0, signals: false });
		await fetch(`${first.url.href}signal`);
		expect(signals[0]?.aborted).toBe(false);
		await app.stop();
		expect(signals[0]?.aborted).toBe(true);
		const second = app.listen({ port: 0, signals: false });
		await fetch(`${second.url.href}signal`);
		expect(signals[1]?.aborted).toBe(false);
		await app.stop();
	});

	test('a shutdownTimeout that is not a number of milliseconds throws', () => {
		expect(() => alxia().listen({ port: 0, shutdownTimeout: -1 })).toThrow(
			'listen(): shutdownTimeout must be a number of milliseconds, 0 or more; got -1',
		);
	});
});
