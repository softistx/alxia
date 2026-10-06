/**
 * `deps.lifecycle`: the Container disposed of when the last app serving it
 * stops, so two forks of one base share it safely.
 */
import { describe, expect, mock, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { container, token } from '@nxgt/di';
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

	test('two forks: stopping one leaves the Container to the other', async () => {
		const { closed, base } = setup();
		const a = base.fork();
		const b = base.fork();
		a.listen({ port: 0, signals: false });
		const server = b.listen({ port: 0, signals: false });

		await a.stop();

		expect(closed).not.toHaveBeenCalled();
		expect(await (await fetch(server.url)).text()).toBe('row');
		await b.stop();
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
