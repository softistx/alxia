import { alxia, eventStream } from '@alxia/core';
import { z } from 'zod';

// alxia.ts as `@nxgt/openapi-codegen` writes it with `alxia: true`.
export const zPet = z.object({ id: z.number(), name: z.string() });
export const zNotFound = z.object({ title: z.string() });
export const zHit = z.object({ id: z.string() });

export const searchEmployees = {
	method: 'QUERY',
	path: '/employees',
	schema: {
		body: z.object({ name: z.string() }),
		response: { 200: z.array(zHit) },
		detail: { operationId: 'searchEmployees', tags: ['employees'] },
	},
} as const;

export const getPet = {
	method: 'GET',
	path: '/pets/:petId',
	schema: {
		params: z.object({ petId: z.coerce.number().int() }),
		response: { 200: zPet, 404: zNotFound },
		detail: { operationId: 'getPet', summary: 'Fetch a pet.' },
	},
} as const;

export const watchPets = {
	method: 'GET',
	path: '/pets/events',
	schema: {
		response: { 200: eventStream(zPet) },
		detail: { operationId: 'watchPets' },
	},
} as const;

export const operations = { searchEmployees, getPet, watchPets } as const;

export const pets = new Map([[1, { id: 1, name: 'Rex' }]]);

export const routed = () =>
	alxia()
		.route(searchEmployees, ({ reply }) => reply.ok([]))
		.route(getPet, ({ params, reply }) => {
			const pet = pets.get(params.petId);
			return pet ? reply.ok(pet) : reply.notFound({ title: 'No such pet' });
		})
		.route(watchPets, ({ reply }) =>
			reply.ok(
				(async function* () {
					yield { id: 1, name: 'Rex' };
				})(),
			),
		);
