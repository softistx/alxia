import { describe, expect, mock, spyOn, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { container, token } from '@nxgt/di';
import { Greeting, services } from '../test/services';
import { di } from './di';

const Fragile = token<string>()('fragile');
const fragile = () =>
	container().provide(Fragile, () => 'value', {
		lifetime: 'scoped',
		dispose: () => {
			throw new Error('cannot close');
		},
	});

describe('di, when disposal fails', () => {
	test('hands the error to onDisposeError and keeps the reply', async () => {
		const onDisposeError = mock(() => {});
		const app = alxia()
			.use(di(fragile(), { onDisposeError }))
			.get('/', async ({ scope, reply }) =>
				reply(200, await scope.resolve(Fragile)),
			);

		const res = await app.request('/');

		expect(await res.text()).toBe('value');
		expect(onDisposeError).toHaveBeenCalledTimes(1);
	});

	test("keeps the route's error over the disposal's", async () => {
		const app = alxia()
			.use(di(fragile(), { onDisposeError: () => {} }))
			.use(async (_ctx, next) => {
				try {
					return await next();
				} catch (error) {
					return new Response((error as Error).message, { status: 500 });
				}
			})
			.get('/', async ({ scope }) => {
				await scope.resolve(Fragile);
				throw new Error('route');
			});

		expect(await (await app.request('/')).text()).toBe('route');
	});

	test('ignores an onDisposeError that throws', async () => {
		const app = alxia()
			.use(
				di(fragile(), {
					onDisposeError: () => {
						throw new Error('logger down');
					},
				}),
			)
			.get('/', async ({ scope, reply }) =>
				reply(200, await scope.resolve(Fragile)),
			);

		expect((await app.request('/')).status).toBe(200);
	});

	test('logs with console.error by default, naming the request', async () => {
		const logged = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const app = alxia()
				.use(di(fragile()))
				.get('/orders', async ({ scope, reply }) =>
					reply(200, await scope.resolve(Fragile)),
				);

			await app.request('/orders');

			expect(logged).toHaveBeenCalledTimes(1);
			expect(String(logged.mock.calls[0]?.[0])).toContain('GET /orders');
		} finally {
			logged.mockRestore();
		}
	});
});

describe('di, when the Scope cannot be made', () => {
	test('rejects every resolve with the slots error, and disposes of nothing', async () => {
		const onDisposeError = mock(() => {});
		const deps = di(services(), {
			slots: () => {
				throw new Error('no user');
			},
			onDisposeError,
		});
		const errors: string[] = [];
		const app = alxia()
			.use(deps)
			.get('/', async ({ scope, reply }) => {
				for (const _ of [1, 2]) {
					await scope.resolve(Greeting).catch((e: Error) => {
						errors.push(e.message);
					});
				}
				return reply(200, 'ok');
			});

		await app.request('/');

		expect(errors).toEqual(['no user', 'no user']);
		expect(onDisposeError).not.toHaveBeenCalled();
	});
});
