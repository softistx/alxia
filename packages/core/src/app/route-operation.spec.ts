import { describe, expect, spyOn, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { defineHook } from './define-hook';
import { defineMiddleware } from './define-middleware';
import { responds, validate } from './validate';

const Pet = z.object({ id: z.number(), name: z.string() });
const Unauthorized = z.object({ error: z.literal('unauthorized') });
const getPet = {
	method: 'GET',
	path: '/pets/:petId',
	schema: {
		params: z.object({ petId: z.coerce.number().int() }),
		response: { 200: Pet, 401: Unauthorized },
	},
} as const;

/** A 401 whose body the operation's 401 refuses. */
const lying = defineMiddleware(({ request, reply }, next) =>
	request.headers.has('x-user')
		? next()
		: reply(401, { error: 'nope' } as never),
);

describe('the implicit responds of route(operation)', () => {
	test('stands after an explicit validate(operation), just before the handler', async () => {
		const order: string[] = [];
		const app = alxia().route(
			getPet,
			validate(getPet),
			({ params }, next) => {
				order.push(typeof params.petId);
				return next();
			},
			({ params, reply }) => reply(200, { id: params.petId, name: 'Rex' }),
		);
		const response = await app.request('/pets/3');
		expect(response.status).toBe(200);
		expect(order).toEqual(['number']);
		expect((await app.request('/pets/x')).status).toBe(400);
	});

	test('gives way to a responds(operation) the route places, which checks the middlewares after it', async () => {
		const error = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const app = alxia().route(getPet, responds(getPet), lying, ({ reply }) =>
				reply(200, { id: 1, name: 'Rex' }),
			);
			expect((await app.request('/pets/1')).status).toBe(500);
			expect(
				(await app.request('/pets/1', { headers: { 'x-user': 'a' } })).status,
			).toBe(200);
			expect(app.routes[0]?.schema.response).toEqual(getPet.schema.response);
		} finally {
			error.mockRestore();
		}
	});

	test('responds(operation) refuses an operation that declares no response', () => {
		expect(() =>
			responds({ method: 'GET', path: '/health' } as never),
		).toThrow('responds(): the operation GET /health declares no response');
	});
});

describe('the forms of 0.3 and the middleware forms', () => {
	const hook = defineHook(() => ({ a: 1 }));
	const mw = defineMiddleware((_ctx, next) => next());

	test('a list of hooks beside middlewares is refused when the route is declared', () => {
		expect(() =>
			alxia().get('/', [hook] as never, mw as never, ({ reply }) =>
				reply(200, 'x'),
			),
		).toThrow(
			'GET /: a list of hooks and middlewares are two forms, never mixed: give the hooks as middlewares, made by defineMiddleware()',
		);
		expect(() =>
			alxia().get('/', [] as never, {} as never, mw as never, ({ reply }) =>
				reply(200, 'x'),
			),
		).toThrow('GET /: a list of hooks and middlewares are two forms');
	});

	test('route(operation, [hooks], middleware, handler) is refused, not cut short', () => {
		expect(() =>
			alxia().route(getPet, [hook] as never, mw as never, (({
				reply,
			}: {
				reply: (status: 200, body: unknown) => never;
			}) => reply(200, { id: 1, name: 'x' })) as never),
		).toThrow(
			'GET /pets/:petId: a list of hooks and middlewares are two forms, never mixed',
		);
	});
});
