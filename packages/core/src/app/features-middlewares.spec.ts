/**
 * A middleware given to `use` runs around the rest: what 0.3's `around`
 * and `wrap` did, the first declared outermost, for the routes after it.
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { settle } from './boundary';
import { validate } from './validate';

/** Runs `run` with `console.error` silenced. */
async function quietly(run: () => Promise<void>) {
	const original = console.error;
	console.error = () => {};
	try {
		await run();
	} finally {
		console.error = original;
	}
}

describe('a middleware around every request', () => {
	const seen: string[] = [];
	const app = alxia()
		.use(async (ctx, next) => {
			seen.push('outer:in');
			const response = await settle(ctx, next());
			seen.push(
				`outer:out ${ctx.route} ${response.status} ${ctx.error instanceof Error}`,
			);
			return response;
		})
		.use(async (_ctx, next) => {
			seen.push('inner:in');
			const response = await next();
			response.headers.set('x-wrapped', 'yes');
			return response;
		})
		.use((_ctx, next) => {
			seen.push('last');
			return next();
		})
		.get('/users/:id', ({ reply }) => reply(200))
		.get('/boom', () => {
			throw new Error('boom');
		});

	test('the first declared outermost, reading the route', async () => {
		seen.length = 0;
		const response = await app.request('/users/1');
		expect(response.headers.get('x-wrapped')).toBe('yes');
		expect(seen).toEqual([
			'outer:in',
			'inner:in',
			'last',
			'outer:out /users/:id 200 false',
		]);
	});

	test('settling next(), it sees the 500 and its error, and the 404', async () => {
		await quietly(async () => {
			seen.length = 0;
			expect((await app.request('/boom')).status).toBe(500);
			expect(seen.at(-1)).toBe('outer:out /boom 500 true');
			seen.length = 0;
			expect((await app.request('/nope')).status).toBe(404);
			expect(seen.at(-1)).toBe('outer:out undefined 404 false');
		});
	});

	test('keeps its async context through the handler', async () => {
		const { AsyncLocalStorage } = await import('node:async_hooks');
		const storage = new AsyncLocalStorage<string>();
		const kept = alxia()
			.use((_ctx, next) => storage.run('request-1', next))
			.get('/', async ({ reply }) => {
				await Bun.sleep(1);
				return reply(200, storage.getStore() ?? 'lost');
			});
		expect(await (await kept.request('/')).text()).toBe('request-1');
	});
});

describe('a middleware awaiting next(), then the routes after it', () => {
	const order: string[] = [];
	const app = alxia()
		.get('/before', ({ reply }) => reply(200, 'before'))
		.use(async ({ request, reply }, next) => {
			order.push('wrap:in');
			if (request.headers.get('x-busy') === 'yes') {
				return reply(409, { error: 'busy' as const });
			}
			try {
				const response = await next();
				order.push(`wrap:out ${response.status}`);
				response.headers.set('x-wrapped', 'yes');
				return response;
			} catch (error) {
				order.push('wrap:caught');
				throw error;
			}
		})
		.derive(({ pathParams }) => {
			order.push(`derive ${pathParams['id'] ?? '-'}`);
			return { seen: true };
		})
		.get(
			'/items/:id',
			validate({ params: z.object({ id: z.coerce.number() }) }),
			({ params, seen, reply }) => {
				order.push('handler');
				return reply(200, { id: params.id, seen });
			},
		)
		.get('/fail', () => {
			throw new Error('fail');
		});

	test('runs around the middlewares after it, validation and the handler', async () => {
		order.length = 0;
		const response = await app.request('/items/7');
		expect(await response.json()).toEqual({ id: 7, seen: true });
		expect(response.headers.get('x-wrapped')).toBe('yes');
		expect(order).toEqual(['wrap:in', 'derive 7', 'handler', 'wrap:out 200']);
	});

	test('a refusal reaches it as an error, then the default 400', async () => {
		order.length = 0;
		expect((await app.request('/items/x')).status).toBe(400);
		expect(order).toEqual(['wrap:in', 'derive x', 'wrap:caught']);
	});

	test('only for the routes after it', async () => {
		order.length = 0;
		const before = await app.request('/before', {
			headers: { 'x-busy': 'yes' },
		});
		expect(before.status).toBe(200);
		expect(order).toEqual([]);
		const busy = await app.request('/items/1', {
			headers: { 'x-busy': 'yes' },
		});
		expect(busy.status).toBe(409);
	});

	test("the handler's error reaches it, then the 500", async () => {
		await quietly(async () => {
			order.length = 0;
			expect((await app.request('/fail')).status).toBe(500);
			expect(order).toEqual(['wrap:in', 'derive -', 'wrap:caught']);
		});
	});
});
