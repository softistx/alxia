/**
 * `deps.lifecycle`: the Container disposed of when the last app that
 * started stops, so forks of one base share it safely. `onStop` is given
 * the server that stopped, or `undefined` for an app that never listened.
 */
import { describe, expect, mock, spyOn, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { ContainerDisposedError, container, token } from '@nxgt/di';
import { di } from './di';

const Pool = token<{ query(): string }>()('pool');

function setup() {
	const closed = mock(() => {});
	const deps = di(
		container().provide(Pool, () => ({ query: () => 'row' }), {
			dispose: closed,
		}),
	);
	const base = alxia()
		.plugin(deps.lifecycle)
		.use(deps)
		.get('/', async ({ scope, reply }) =>
			reply(200, (await scope.resolve(Pool)).query()),
		);
	return { closed, base };
}

describe('deps.lifecycle', () => {
	test('disposes of the Container when the app stops', async () => {
		const { closed, base } = setup();
		const server = base.listen({ port: 0, signals: false });
		expect(await (await fetch(server.url)).text()).toBe('row');

		await base.stop();

		expect(closed).toHaveBeenCalledTimes(1);
	});

	test('a stop before listen disposes of nothing', async () => {
		const { closed, base } = setup();

		await base.stop();
		expect(closed).not.toHaveBeenCalled();

		const server = base.listen({ port: 0, signals: false });
		expect(await (await fetch(server.url)).text()).toBe('row');
		await base.stop();
		expect(closed).toHaveBeenCalledTimes(1);
	});

	test('an unstarted fork stopped while another serves leaves the Container to it', async () => {
		const { closed, base } = setup();
		const serving = base.fork();
		const idle = base.fork();
		const server = serving.listen({ port: 0, signals: false });
		await fetch(server.url);

		await idle.stop();

		expect(closed).not.toHaveBeenCalled();
		expect(await (await fetch(server.url)).text()).toBe('row');
		await serving.stop();
		expect(closed).toHaveBeenCalledTimes(1);
	});

	for (const order of ['a then b', 'b then a'] as const) {
		test(`two forks both started, stopped ${order}: disposed of by the second stop`, async () => {
			const { closed, base } = setup();
			const a = base.fork();
			const b = base.fork();
			const urls = [
				a.listen({ port: 0, signals: false }).url,
				b.listen({ port: 0, signals: false }).url,
			];
			await Promise.all(urls.map((url) => fetch(url)));
			const [first, second, left] =
				order === 'a then b' ? [a, b, urls[1]] : [b, a, urls[0]];

			await first.stop();

			expect(closed).not.toHaveBeenCalled();
			expect(await (await fetch(left as URL)).text()).toBe('row');
			await second.stop();
			expect(closed).toHaveBeenCalledTimes(1);
		});
	}

	test('a restart: the first stop disposes of the Container, which stays disposed', async () => {
		const { closed, base } = setup();
		const first = base.listen({ port: 0, signals: false });
		expect(await (await fetch(first.url)).text()).toBe('row');
		await base.stop();
		expect(closed).toHaveBeenCalledTimes(1);

		const logged = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const second = base.listen({ port: 0, signals: false });
			expect((await fetch(second.url)).status).toBe(500);
			expect(logged.mock.calls.flat()).toContainEqual(
				expect.any(ContainerDisposedError),
			);
			await base.stop();
		} finally {
			logged.mockRestore();
		}
		expect(closed).toHaveBeenCalledTimes(1);
	});

	test('without it, the Container is left to the application', async () => {
		const closed = mock(() => {});
		const deps = di(
			container().provide(Pool, () => ({ query: () => 'row' }), {
				dispose: closed,
			}),
		);
		const app = alxia()
			.use(deps)
			.get('/', async ({ scope, reply }) =>
				reply(200, (await scope.resolve(Pool)).query()),
			);
		const server = app.listen({ port: 0, signals: false });
		await fetch(server.url);

		await app.stop();

		expect(closed).not.toHaveBeenCalled();
	});
});
