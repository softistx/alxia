import { describe, expect, expectTypeOf, test } from 'bun:test';
import type { StandardSchemaV1 } from '../schema/standard-schema';
import { type AnyAlxia, alxia, type Plugin } from './alxia';
import { settle } from './boundary';
import { validate } from './validate';

/** A schema written by hand: the core needs no validator library. */
function positive(): StandardSchemaV1<unknown, number> {
	return {
		'~standard': {
			version: 1,
			vendor: 'hand',
			validate: (value) => {
				const number = Number(value);
				return Number.isFinite(number) && number > 0
					? { value: number }
					: { issues: [{ message: 'Expected a positive number' }] };
			},
		},
	};
}

describe('any Standard Schema', () => {
	test('a hand-written schema validates and types the route', async () => {
		const app = alxia().get(
			'/items',
			validate({ query: { '~standard': objectOf({ page: positive() }) } }),
			({ query, reply }) => {
				expectTypeOf(query).toEqualTypeOf<{ page: number }>();
				return reply(200, query.page);
			},
		);
		expect(await (await app.request('/items?page=2')).json()).toBe(2);
		expect((await app.request('/items?page=-1')).status).toBe(400);
	});
});

function objectOf<
	Shape extends Record<string, StandardSchemaV1<unknown, unknown>>,
>(
	shape: Shape,
): StandardSchemaV1<
	unknown,
	{
		[Key in keyof Shape]: NonNullable<
			Shape[Key]['~standard']['types']
		>['output'];
	}
>['~standard'] {
	return {
		version: 1,
		vendor: 'hand',
		validate: async (value) => {
			const input = (value ?? {}) as Record<string, unknown>;
			const output: Record<string, unknown> = {};
			const issues = [];
			for (const [key, schema] of Object.entries(shape)) {
				const result = await schema['~standard'].validate(input[key]);
				if (result.issues) {
					issues.push(
						...result.issues.map((issue) => ({ ...issue, path: [key] })),
					);
				} else output[key] = result.value;
			}
			return issues.length > 0 ? { issues } : { value: output as never };
		},
	};
}

describe('middlewares on every response', () => {
	test('one awaiting next() sees the length of a binary body; one set by the handler wins', async () => {
		const seen: (string | null)[] = [];
		const app = alxia()
			.use(async (_ctx, next) => {
				const response = await next();
				seen.push(response.headers.get('content-length'));
				return response;
			})
			.get('/view', ({ reply }) =>
				reply(200, new Uint8Array(2000).subarray(10, 20)),
			)
			.get('/blob', ({ reply }) => reply(200, new Blob(['abc'])))
			.get('/own', ({ reply }) =>
				reply(200, new Blob(['abc']), { headers: { 'content-length': '3' } }),
			);
		for (const path of ['/view', '/blob', '/own']) await app.request(path);
		expect(seen).toEqual(['10', '3', '3']);
	});

	test('one answers before routing, one settling next() sees every response', async () => {
		const seen: number[] = [];
		const app = alxia()
			.use(async (ctx, next) => {
				const response = await settle(ctx, next());
				seen.push(response.status);
				const headers = new Headers(response.headers);
				headers.set('x-powered-by', 'alxia');
				return new Response(response.body, {
					status: response.status,
					headers,
				});
			})
			.use(({ request }, next) =>
				request.method === 'OPTIONS'
					? new Response(null, { status: 204 })
					: next(),
			)
			.get('/', ({ reply }) => reply(200, 'home'));
		expect((await app.request('/', { method: 'OPTIONS' })).status).toBe(204);
		const home = await app.request('/');
		expect(home.headers.get('x-powered-by')).toBe('alxia');
		expect((await app.request('/nope')).status).toBe(404);
		expect(seen).toEqual([204, 200, 404]);
	});

	test('a function plugin adds middlewares and keeps the app type', async () => {
		const poweredBy =
			(name: string): Plugin =>
			(app) =>
				app.use(async (_ctx, next) => {
					const response = await next();
					response.headers.set('x-powered-by', name);
					return response;
				}) as typeof app;
		const app = alxia()
			.plugin(poweredBy('alxia'))
			.get('/a', ({ reply }) => reply(200, 'a'));
		expect((await app.request('/a')).headers.get('x-powered-by')).toBe('alxia');
	});
});

describe('lifecycle hooks', () => {
	test('onStart and onStop run with listen and stop', async () => {
		const events: string[] = [];
		const app = alxia()
			.onStart(() => {
				events.push('start');
			})
			.onStop(() => {
				events.push('stop');
			})
			.get('/', ({ reply }) => reply(200));
		app.listen({ port: 0 });
		await Bun.sleep(0);
		expect(app.server).toBeDefined();
		await app.stop(true);
		expect(events).toEqual(['start', 'stop']);
		expect(app.server).toBeUndefined();
	});
});

describe('group', () => {
	const app = alxia()
		.decorate({ role: 'guest' as string })
		.group('/admin', (admin) =>
			admin
				.derive(({ request, reply }) =>
					request.headers.get('x-admin') === 'yes'
						? { role: 'admin' }
						: reply(403, { error: 'forbidden' as const }),
				)
				.get('/stats', ({ role, reply }) => reply(200, { role })),
		)
		.get('/public', ({ role, reply }) => reply(200, { role }));

	test("a group's middlewares guard only its routes", async () => {
		expect((await app.request('/admin/stats')).status).toBe(403);
		const admin = await app.request('/admin/stats', {
			headers: { 'x-admin': 'yes' },
		});
		expect(await admin.json()).toEqual({ role: 'admin' });
		expect(await (await app.request('/public')).json()).toEqual({
			role: 'guest',
		});
	});
});

describe('plugins typed as functions', () => {
	test('Plugin is assignable from a generic function', () => {
		const identity: Plugin = <App extends AnyAlxia>(app: App) => app;
		expect(typeof identity).toBe('function');
	});
});
