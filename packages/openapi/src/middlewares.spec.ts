import { describe, expect, test } from 'bun:test';
import { alxia, defineMiddleware, validate } from '@alxia/core';
import { z } from 'zod';
import { matchesSpec } from './routes';

// Two operations as `@nxgt/openapi-codegen` writes them, served by routes
// that take middlewares: the checks read the routes, whatever guards them.
const zPet = z.object({ id: z.number(), name: z.string() });
const zUnauthorized = z.object({ error: z.literal('unauthorized') });

const renamePet = {
	method: 'PATCH',
	path: '/pets/:petId',
	schema: {
		params: z.object({ petId: z.coerce.number().int() }),
		body: z.object({ name: z.string().min(1) }),
		response: { 200: zPet, 401: zUnauthorized },
		detail: { operationId: 'renamePet' },
	},
} as const;
const adoptPet = {
	method: 'POST',
	path: '/pets/:petId/adoption',
	schema: {
		params: z.object({ petId: z.coerce.number().int() }),
		body: z.object({ by: z.string().min(1) }),
		response: { 201: zPet, 401: zUnauthorized },
		detail: { operationId: 'adoptPet' },
	},
} as const;
const operations = { renamePet, adoptPet } as const;

const auth = defineMiddleware(({ request, reply }, next) =>
	request.headers.has('x-user')
		? next()
		: reply(401, { error: 'unauthorized' as const }),
);

const app = alxia()
	.route(renamePet, auth, ({ params, body, reply }) =>
		reply(200, { id: params.petId, name: body.name }),
	)
	.route(adoptPet, validate(adoptPet), auth, ({ params, reply }) =>
		reply(201, { id: params.petId, name: 'Rex' }),
	);

const send = (path: string, method: string, user: boolean) =>
	app.request(path, {
		method,
		headers: {
			'content-type': 'application/json',
			...(user ? { 'x-user': 'ada' } : {}),
		},
		body: '{}',
	});

describe('routes with middlewares', () => {
	test('match the spec as plain routes do', () => {
		expect(() => matchesSpec(app, operations)).not.toThrow();
	});

	test("validate where the operation's validate stands", async () => {
		// renamePet validates just before its handler: auth answers first
		expect((await send('/pets/1', 'PATCH', false)).status).toBe(401);
		expect((await send('/pets/1', 'PATCH', true)).status).toBe(400);
		// adoptPet places validate(adoptPet) first: a bad body is a 400 first
		expect((await send('/pets/1/adoption', 'POST', false)).status).toBe(400);
	});
});
