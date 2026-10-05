/**
 * One server per app at a time, and one shutdown per server: `listen` on
 * an app that listens throws, a second `stop()` runs no `onStop` hook
 * again, and `stopTimeout` bounds the hooks.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from './alxia';

describe('listen() and stop(), once each', () => {
	test('listen on an app that listens throws, naming its URL; after stop, it listens again', async () => {
		const app = alxia().get('/', ({ reply }) => reply(200, 'ok'));
		const server = app.listen({ port: 0, signals: false });
		expect(() => app.listen({ port: 0, signals: false })).toThrow(
			`listen(): the app already listens on ${server.url.href}; stop() it first`,
		);
		await app.stop();
		const again = app.listen({ port: 0, signals: false });
		expect(await (await fetch(again.url)).text()).toBe('ok');
		await app.stop();
	});

	test('stop() after stop() runs the onStop hooks once per listen', async () => {
		let ran = 0;
		const app = alxia().onStop(() => {
			ran++;
		});
		app.listen({ port: 0, signals: false });
		await app.stop();
		await app.stop();
		expect(ran).toBe(1);
		app.listen({ port: 0, signals: false });
		await app.stop();
		expect(ran).toBe(2);
	});

	test('an onStop hook that never settles fails the stop past stopTimeout, naming it', async () => {
		let after = false;
		const app = alxia()
			.onStop(function closePool() {
				return new Promise<void>(() => {});
			})
			.onStop(() => {
				after = true;
			});
		app.listen({ port: 0, signals: false, stopTimeout: 100 });
		const start = performance.now();
		await expect(app.stop()).rejects.toThrow(
			'onStop hook closePool (1 of 2) did not finish within 100 ms; 1 after it not run',
		);
		expect(performance.now() - start).toBeLessThan(1_000);
		expect(after).toBe(false);
	});

	test('a stopTimeout that is not a number of milliseconds throws', () => {
		expect(() =>
			alxia().listen({ port: 0, signals: false, stopTimeout: Number.NaN }),
		).toThrow(
			'listen(): stopTimeout must be a number of milliseconds, 0 or more; got NaN',
		);
	});
});
