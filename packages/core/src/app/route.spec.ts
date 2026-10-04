import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import type { RouteOperation } from './route-operation';

// As an OpenAPI code generator writes them: data, importing only the schemas.
const Pet = z.object({ id: z.number(), name: z.string() });
const getPet = {
	method: 'GET',
	path: '/pets/:petId',
	schema: {
		params: z.object({ petId: z.coerce.number().int() }),
		response: { 200: Pet, 404: z.object({ error: z.literal('not_found') }) },
	},
} as const;
const searchPets = {
	method: 'QUERY',
	path: '/pets',
	schema: {
		body: z.object({ name: z.string() }),
		response: { 200: z.array(Pet) },
	},
} as const;
const health = { method: 'GET', path: '/health' } as const;

const pets = [{ id: 1, name: 'Rex' }];

const app = alxia()
	.decorate({ pets })
	.route(getPet, ({ params, pets, reply }) => {
		expectTypeOf(params).toEqualTypeOf<{ petId: number }>();
		const pet = pets.find((one) => one.id === params.petId);
		return pet ? reply.ok(pet) : reply.notFound({ error: 'not_found' });
	})
	.route(searchPets, ({ body, pets, reply }) =>
		reply.ok(pets.filter((pet) => pet.name.startsWith(body.name))),
	)
	.route(health, ({ reply }) => reply(200, 'ok'));

describe('route(operation, handler)', () => {
	test('declares the route the operation describes', async () => {
		expect((await app.request('/pets/1')).status).toBe(200);
		expect(await (await app.request('/pets/2')).json()).toEqual({
			error: 'not_found',
		});
		expect((await app.request('/pets/x')).status).toBe(400);
		const found = await app.request('/pets', {
			method: 'QUERY',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'R' }),
		});
		expect(await found.json()).toEqual([{ id: 1, name: 'Rex' }]);
		expect(await (await app.request('/health')).text()).toBe('ok');
	});

	test('under a prefix, and with the mistakes of a route method', () => {
		alxia({ prefix: '/api' }).route(health, ({ reply }) => reply(200, 'ok'));
		const _mistakes = () => {
			alxia().route(
				{
					method: 'GET',
					path: '/pets/:petId',
					// @ts-expect-error the params must read the path's own
					schema: { params: z.object({ id: z.string() }) },
				},
				() => {
					throw new Error('never declared');
				},
			);
			alxia().route(getPet, ({ reply }) =>
				// @ts-expect-error 201 is not declared
				reply(201, { id: 1, name: 'x' }),
			);
		};
		expect(_mistakes).toBeFunction();
	});

	test('in a group, and for HEAD', async () => {
		const grouped = alxia().group('/v1', (g) =>
			g.route({ method: 'HEAD', path: '/ping' }, ({ reply }) => reply(204)),
		);
		const response = await grouped.request('/v1/ping', { method: 'HEAD' });
		expect(response.status).toBe(204);
	});

	test('one method and one path, as literals: a widened one is refused', () => {
		const typed: RouteOperation = { method: 'GET', path: '/w' };
		const either = {
			method: 'GET' as 'GET' | 'POST',
			path: '/w',
		} as const;
		const _refused = () => {
			// @ts-expect-error the method could be any: the route would be typed under all
			alxia().route(typed, ({ reply }) => reply(200, 'x'));
			// @ts-expect-error two methods, one route registered
			alxia().route(either, ({ reply }) => reply(200, 'x'));
		};
		expect(_refused).toBeFunction();
	});
});
