import { describe, expect, expectTypeOf, spyOn, test } from 'bun:test';
import { z } from 'zod';
import { type AnyAlxia, alxia, type RoutesOf } from './alxia';
import { defineMiddleware } from './define-middleware';
import { validate } from './validate';

const Pet = z.object({ id: z.number(), name: z.string() });
const Unauthorized = z.object({ error: z.literal('unauthorized') });
const updatePet = {
	method: 'PATCH',
	path: '/pets/:petId',
	schema: {
		params: z.object({ petId: z.coerce.number().int() }),
		body: z.object({ name: z.string().min(1) }),
		response: { 200: Pet, 401: Unauthorized },
		detail: { operationId: 'updatePet' },
	},
} as const;

const auth = defineMiddleware(({ request, reply }, next) => {
	const user = request.headers.get('x-user');
	return user === null
		? reply(401, { error: 'unauthorized' as const })
		: next({ user });
});

const patch = (app: AnyAlxia, body: unknown, user?: string) =>
	app.request('/pets/1', {
		method: 'PATCH',
		headers: {
			'content-type': 'application/json',
			...(user === undefined ? {} : { 'x-user': user }),
		},
		body: JSON.stringify(body),
	});

describe('route(operation, ...middlewares, handler)', () => {
	test("validates the operation's request just before the handler", async () => {
		const seen: unknown[] = [];
		const app = alxia().route(
			updatePet,
			auth,
			({ params, body }, next) => {
				seen.push(params, body);
				return next();
			},
			({ user, params, body, reply }) => {
				const id: number = params.petId; // validated, a number
				const by: string = user;
				return reply(200, {
					id,
					name: `${body.name}${by === 'ada' ? '' : '?'}`,
				});
			},
		);
		// auth stands before the validation: a stranger's bad body is a 401
		expect((await patch(app, { name: '' })).status).toBe(401);
		expect((await patch(app, { name: '' }, 'ada')).status).toBe(400);
		const ok = await patch(app, { name: 'Rex' }, 'ada');
		expect(await ok.json()).toEqual({ id: 1, name: 'Rex' });
		// the middleware before it read the request as it arrived
		expect(seen.at(-2)).toEqual({ petId: '1' });
		expect(seen.at(-1)).toBeUndefined();
	});

	test('a validate(operation) among the middlewares stands where it is given, once', async () => {
		const validations: string[] = [];
		const counted = z.object({ name: z.string().min(1) }).transform((body) => {
			validations.push(body.name);
			return body;
		});
		const operation = {
			...updatePet,
			schema: { ...updatePet.schema, body: counted },
		} as const;
		const app = alxia().route(
			operation,
			validate(operation),
			auth,
			({ body, reply }) => reply(200, { id: 1, name: body.name }),
		);
		// the validation stands first: a bad body is a 400 before auth asks
		expect((await patch(app, { name: '' })).status).toBe(400);
		expect((await patch(app, { name: 'Rex' }, 'ada')).status).toBe(200);
		expect(validations).toEqual(['Rex']);
	});

	test("checks every reply the operation declares, a middleware's included", async () => {
		const error = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const lying = defineMiddleware(({ reply }) =>
				reply(401, { error: 'nope' } as never),
			);
			const app = alxia()
				.route(updatePet, lying, ({ reply }) =>
					reply(200, { id: 1, name: 'x' }),
				)
				.route({ ...updatePet, path: '/cats/:petId' } as const, ({ reply }) =>
					reply(200, { id: 'x' } as never),
				);
			expect((await patch(app, { name: 'Rex' })).status).toBe(500);
			const cat = await app.request('/cats/1', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: 'Rex' }),
			});
			expect(cat.status).toBe(500);
		} finally {
			error.mockRestore();
		}
	});

	test('declares the operation on the route, as the route table and OpenAPI read it', () => {
		const app = alxia().route(updatePet, auth, ({ reply }) =>
			reply(200, { id: 1, name: 'x' }),
		);
		expect(app.routes[0]?.schema).toEqual({
			detail: { operationId: 'updatePet' },
			response: updatePet.schema.response,
			params: updatePet.schema.params,
			body: updatePet.schema.body,
		});
		type Route = RoutesOf<typeof app>['/pets/:petId']['PATCH'];
		expectTypeOf<Route['input']['body']>().toEqualTypeOf<{ name: string }>();
	});

	test('the mistakes a route method refuses', () => {
		const _mistakes = () => {
			// @ts-expect-error 201 is not declared by the operation
			alxia().route(updatePet, auth, ({ reply }) => reply(201, {}));
			alxia().route(
				updatePet,
				// @ts-expect-error a middleware before the validation reads no body
				({ body }, next) => next({ name: body.name }),
				({ reply }) => reply(200, { id: 1, name: 'x' }),
			);
		};
		expect(_mistakes).toBeFunction();
	});
});
