import { describe, expect, spyOn, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { container, ScopeDisposedError, token } from '@nxgt/di';
import {
	Greeting,
	Principal,
	services,
	slotsFromHeader,
} from '../test/services';
import { di } from './di';

function setup() {
	const events: string[] = [];
	const slots = slotsFromHeader();
	const deps = di(services(events), { slots });
	return { deps, slots, events };
}

describe('di', () => {
	test('gives the routes after it the request Scope, as scope', async () => {
		const { deps } = setup();
		const app = alxia()
			.use(deps)
			.get('/', async ({ scope, reply }) =>
				reply(200, await scope.resolve(Greeting)),
			);

		const res = await app.request('/', { headers: { 'x-user': 'ada' } });

		expect(await res.text()).toBe('hello ada');
	});

	test('creates no Scope, and calls no slots, on a request that resolves nothing', async () => {
		const { deps, slots, events } = setup();
		const app = alxia()
			.use(deps)
			.get('/health', ({ reply }) => reply(200, 'ok'));

		await app.request('/health');
		await app.request('/missing');

		expect(slots).not.toHaveBeenCalled();
		expect(events).toEqual([]);
	});

	test('calls slots once per request, however many resolves', async () => {
		const { deps, slots } = setup();
		const app = alxia()
			.use(deps)
			.get('/', async ({ scope, reply }) => {
				await Promise.all([scope.resolve(Greeting), scope.resolve(Principal)]);
				await scope.resolve(Greeting);
				return reply(200, 'ok');
			});

		await app.request('/');
		await app.request('/');

		expect(slots).toHaveBeenCalledTimes(2);
	});

	test('computes the Slots from what an earlier middleware added', async () => {
		const deps = di(services(), {
			slots: async ({ user }: { user: { id: string } }) => ({
				principal: user,
			}),
		});
		const app = alxia()
			.use((_ctx, next) => next({ user: { id: 'from-auth' } }))
			.use(deps)
			.get('/', async ({ scope, reply }) =>
				reply(200, await scope.resolve(Greeting)),
			);

		expect(await (await app.request('/')).text()).toBe('hello from-auth');
	});

	test('disposes of the Scope once the route has replied', async () => {
		const { deps, events } = setup();
		const app = alxia()
			.use(deps)
			.get('/', async ({ scope, reply }) => {
				await scope.resolve(Greeting);
				events.push('handled');
				return reply(200, 'ok');
			});

		await app.request('/');

		expect(events).toEqual(['created', 'handled', 'disposed']);
	});

	test('disposes of the Scope when the route throws, which is still answered', async () => {
		const { deps, events } = setup();
		const app = alxia()
			.use(deps)
			.get('/', async ({ scope }) => {
				await scope.resolve(Greeting);
				throw new Error('refused');
			});

		const logged = spyOn(console, 'error').mockImplementation(() => {});
		const res = await app.request('/').finally(() => logged.mockRestore());

		expect(res.status).toBe(500);
		expect(events).toEqual(['created', 'disposed']);
	});

	test('keeps resolve bound when destructured', async () => {
		const { deps } = setup();
		const app = alxia()
			.use(deps)
			.get('/', async ({ scope: { resolve }, reply }) =>
				reply(200, await resolve(Greeting)),
			);

		expect(await (await app.request('/')).text()).toBe('hello anonymous');
	});

	test('rejects a resolve made after the request ended', async () => {
		const { deps } = setup();
		let late: (() => Promise<unknown>) | undefined;
		const app = alxia()
			.use(deps)
			.get('/', ({ scope, reply }) => {
				late = () => scope.resolve(Greeting);
				return reply(200, 'ok');
			});

		await app.request('/');

		await expect(late?.()).rejects.toBeInstanceOf(ScopeDisposedError);
	});

	test('given twice to one route, makes one Scope, owned by the first', async () => {
		const { deps, slots, events } = setup();
		const seen: unknown[] = [];
		const app = alxia()
			.use(deps)
			.use((ctx, next) => {
				seen.push(ctx.scope);
				return next();
			})
			.use(deps)
			.get('/', async ({ scope, reply }) => {
				seen.push(scope);
				return reply(200, await scope.resolve(Greeting));
			});

		await app.request('/');

		expect(seen[0]).toBe(seen[1]);
		expect(slots).toHaveBeenCalledTimes(1);
		expect(events).toEqual(['created', 'disposed']);
	});

	test('under another di, gives its Scope back once the inner one is disposed of', async () => {
		const { deps } = setup();
		const Inner = token<string>()('inner');
		const inner = di(
			container().provide(Inner, () => 'inner', { lifetime: 'scoped' }),
		);
		let after: unknown;
		const app = alxia()
			.use(deps)
			.use(async (ctx, next) => {
				const response = await next();
				after = await ctx.scope.resolve(Greeting).catch((e: Error) => e);
				return response;
			})
			.use(inner)
			.get('/', async ({ scope, reply }) =>
				reply(200, await scope.resolve(Inner)),
			);

		expect(await (await app.request('/')).text()).toBe('inner');
		expect(after).toBe('hello anonymous');
	});
});
