import { describe, expect, mock, spyOn, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { container, token } from '@nxgt/di';
import {
	Config,
	Greeting,
	Principal,
	services,
	slotsFromHeader,
} from '../test/services';
import { di } from './di';
import { ScopeNotMountedError } from './errors';

const deps = di(services(), { slots: slotsFromHeader() });

describe('expose', () => {
	test('adds each value to the context under its key', async () => {
		const app = alxia()
			.use(deps)
			.use(deps.expose({ config: Config, me: Principal, greeting: Greeting }))
			.get('/', ({ config, me, greeting, reply }) =>
				reply(200, { region: config.region, me: me.id, greeting }),
			);

		const res = await app.request('/', { headers: { 'x-user': 'ada' } });

		expect(await res.json()).toEqual({
			region: 'eu',
			me: 'ada',
			greeting: 'hello ada',
		});
	});

	test('resolves in the request Scope, so the route shares its values', async () => {
		const made = mock(() => ({}));
		const Thing = token<object>()('thing');
		const own = di(container().provide(Thing, made, { lifetime: 'scoped' }));
		const app = alxia()
			.use(own)
			.get('/', own.expose({ thing: Thing }), async ({ thing, scope, reply }) =>
				reply(200, { same: thing === (await scope.resolve(Thing)) }),
			);

		expect(await (await app.request('/')).json()).toEqual({ same: true });
		expect(made).toHaveBeenCalledTimes(1);
	});

	test('in a group, resolves on its routes alone', async () => {
		const made = mock(() => 'x');
		const Lazy = token<string>()('lazy');
		const own = di(container().provide(Lazy, made, { lifetime: 'scoped' }));
		const app = alxia()
			.use(own)
			.group('/orders', (g) =>
				g
					.use(own.expose({ lazy: Lazy }))
					.get('/', ({ lazy, reply }) => reply(200, lazy)),
			)
			.get('/health', ({ reply }) => reply(200, 'ok'));

		await app.request('/health');
		expect(made).not.toHaveBeenCalled();
		expect(await (await app.request('/orders')).text()).toBe('x');
	});

	test('throws ScopeNotMountedError with no Scope on the context, past the types', async () => {
		let caught: unknown;
		const app = alxia()
			.use(async (_ctx, next) => {
				try {
					return await next();
				} catch (error) {
					caught = error;
					return new Response(null, { status: 500 });
				}
			})
			.use(deps.expose({ greeting: Greeting }) as never)
			.get('/', ({ reply }) => reply(200, 'unreachable'));

		await app.request('/');

		expect(caught).toBeInstanceOf(ScopeNotMountedError);
		expect(caught).toMatchObject({
			code: 'DI_SCOPE_NOT_MOUNTED',
			keys: ['greeting'],
		});
	});

	test('a factory that throws is answered 500, and the Scope still disposed of', async () => {
		const disposed = mock(() => {});
		const Kept = token<string>()('kept');
		const Broken = token<string>()('broken');
		const own = di(
			container()
				.provide(Kept, () => 'kept', { lifetime: 'scoped', dispose: disposed })
				.provide(
					Broken,
					() => {
						throw new Error('broken factory');
					},
					{ lifetime: 'scoped' },
				),
		);
		const app = alxia()
			.use(own)
			.get('/', own.expose({ kept: Kept, broken: Broken }), ({ reply }) =>
				reply(200, 'unreachable'),
			);

		const logged = spyOn(console, 'error').mockImplementation(() => {});
		const res = await app.request('/').finally(() => logged.mockRestore());

		expect(res.status).toBe(500);
		expect(disposed).toHaveBeenCalledTimes(1);
	});
});
