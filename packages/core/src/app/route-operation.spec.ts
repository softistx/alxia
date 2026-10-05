import { describe, expect, spyOn, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
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
		} finally {
			error.mockRestore();
		}
	});

	test('responds(operation) refuses an operation that declares no response', () => {
		expect(() => responds({ method: 'GET', path: '/health' } as never)).toThrow(
			'responds(): the operation GET /health declares no response',
		);
	});
});

describe('a list of middlewares after the path, the form of 0.3', () => {
	const mw = defineMiddleware((_ctx, next) => next());
	const list =
		'a route takes its middlewares after the path, not in a list: drop the brackets';

	test('is refused when a route is declared, with or without middlewares after it', () => {
		const untyped = alxia().get as (...args: unknown[]) => unknown;
		const ok = ({ reply }: { reply: (status: 200, body: string) => never }) =>
			reply(200, 'x');
		expect(() => untyped('/', [mw], ok)).toThrow(`GET /: ${list}`);
		expect(() => untyped('/', [], {}, mw, ok)).toThrow(`GET /: ${list}`);
	});

	test('is refused by route(operation) and ws as well', () => {
		const route = alxia().route as (...args: unknown[]) => unknown;
		expect(() =>
			route(getPet, [mw], mw, ({ reply }: { reply: (s: 200) => never }) =>
				reply(200),
			),
		).toThrow(`GET /pets/:petId: ${list}`);
		const ws = alxia().ws as (...args: unknown[]) => unknown;
		expect(() => ws('/live', [mw], { message: () => {} })).toThrow(
			`WS /live: ${list}`,
		);
	});
});

describe('app.routes, of route(operation)', () => {
	test('holds the route options alone: the schemas stay in its chain', async () => {
		const operation = {
			...getPet,
			schema: { ...getPet.schema, detail: { operationId: 'getPet' } },
		} as const;
		const app = alxia().route(operation, ({ params, reply }) =>
			reply(200, { id: params.petId, name: 'Rex' }),
		);
		expect(app.routes[0]?.schema).toEqual({
			detail: { operationId: 'getPet' },
		});
		expect((await app.request('/pets/x')).status).toBe(400);
	});
});
