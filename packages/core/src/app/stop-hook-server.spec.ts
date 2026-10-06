/**
 * What an `onStop` hook is given: the server that stopped, or `undefined`
 * on a `stop()` of an app that never listened, which runs the hooks too. A
 * hook a fork shares with its base tells by it which app stopped.
 */
import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from './alxia';
import type { StopHook } from './definition';

describe('onStop: the server that stopped', () => {
	test('a stop after listen gives the server onStart was given', async () => {
		let started: Bun.Server<unknown> | undefined;
		const stopped: unknown[] = [];
		const app = alxia()
			.onStart((server) => {
				started = server;
			})
			.onStop((server) => {
				stopped.push(server);
			});
		app.listen({ port: 0, signals: false });
		await app.stop();
		expect(started).toBeDefined();
		expect(stopped).toEqual([started]);
	});

	test('a stop before listen gives undefined', async () => {
		const stopped: unknown[] = [];
		await alxia()
			.onStop((server) => {
				stopped.push(server);
			})
			.stop();
		expect(stopped).toEqual([undefined]);
	});

	test("an unstarted fork's stop gives undefined; its serving sibling's gives its server", async () => {
		const stopped: unknown[] = [];
		const base = alxia()
			.onStop((server) => {
				stopped.push(server);
			})
			.get('/', ({ reply }) => reply(200, 'ok'));
		const serving = base.fork();
		const idle = base.fork();
		const server = serving.listen({ port: 0, signals: false });

		await idle.stop();
		expect(stopped).toEqual([undefined]);
		expect(await (await fetch(server.url)).text()).toBe('ok');

		await serving.stop();
		expect(stopped).toEqual([undefined, server]);
	});

	test('a hook that takes no argument still compiles', async () => {
		let ran = 0;
		const none: StopHook = () => {
			ran++;
		};
		await alxia()
			.onStop(none)
			.onStop(() => {
				ran++;
			})
			.onStop(async () => {})
			.stop();
		expect(ran).toBe(2);
		alxia().onStop((server) => {
			expectTypeOf(server).toEqualTypeOf<Bun.Server<unknown> | undefined>();
		});
		const _refused = () =>
			// @ts-expect-error the server may be undefined: a stop before listen has none
			alxia().onStop((server: Bun.Server<unknown>) => void server.url);
		expect(_refused).toBeFunction();
	});
});
