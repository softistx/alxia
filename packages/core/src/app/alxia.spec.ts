import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { responds, validate } from './validate';

const User = z.object({ id: z.number(), name: z.string() });
const NotFound = z.object({ error: z.literal('not_found') });

const users = new Map([[1, { id: 1, name: 'Ada', password: 'secret' }]]);

const app = alxia()
	.decorate({ users })
	.get(
		'/users/:id',
		validate({
			params: z.object({ id: z.coerce.number().int() }),
			query: z.object({ upper: z.enum(['yes', 'no']).optional() }),
		}),
		responds({ 200: User, 404: NotFound }),
		({ params, query, users, reply }) => {
			expectTypeOf(params).toEqualTypeOf<{ id: number }>();
			const user = users.get(params.id);
			if (user === undefined) return reply(404, { error: 'not_found' });
			return reply(200, {
				...user,
				name: query.upper === 'yes' ? user.name.toUpperCase() : user.name,
			});
		},
	)
	.post(
		'/users',
		validate({ body: z.object({ name: z.string().min(1) }) }),
		responds({ 201: User }),
		({ body, reply, set }) => {
			set.headers.set('x-created', 'yes');
			return reply(201, { id: 2, name: body.name });
		},
	)
	.query(
		'/users',
		validate({ body: z.object({ name: z.string().min(1) }) }),
		responds({ 200: z.array(User) }),
		({ body, users, reply }) =>
			reply.ok(
				[...users.values()].filter((user) => user.name.startsWith(body.name)),
			),
	)
	.get('/health', ({ reply }) => reply(200, { ok: true }))
	.get('/files/*', ({ params, reply }) => reply(200, params['*']));

const call = (path: string, init?: RequestInit) =>
	app.fetch(new Request(`http://localhost${path}`, init));

describe('routing', () => {
	test('a declared route answers with its reply', async () => {
		const response = await call('/users/1');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: 1, name: 'Ada' });
	});

	test('the reply is sent as its schema output: unknown keys never leave', async () => {
		const body = await (await call('/users/1')).json();
		expect(body).not.toHaveProperty('password');
	});

	test('a wildcard reads the rest of the path', async () => {
		const response = await call('/files/a/b.txt');
		expect(await response.text()).toBe('a/b.txt');
	});

	test('an unknown path is a 404, a known path by another method a 405', async () => {
		expect((await call('/nope')).status).toBe(404);
		const response = await call('/health', { method: 'DELETE' });
		expect(response.status).toBe(405);
		expect(response.headers.get('allow')).toBe('GET');
	});
});

describe('QUERY', () => {
	const search = (body: string) =>
		call('/users', {
			method: 'QUERY',
			headers: { 'content-type': 'application/json' },
			body,
		});

	test('its body is read and validated, like a POST', async () => {
		const found = await search(JSON.stringify({ name: 'A' }));
		expect(found.status).toBe(200);
		expect(await found.json()).toEqual([{ id: 1, name: 'Ada' }]);
		const refused = await search(JSON.stringify({ name: '' }));
		expect(refused.status).toBe(400);
	});

	test('it is in the Allow of a 405', async () => {
		const response = await call('/users', { method: 'PUT' });
		expect(response.status).toBe(405);
		expect(response.headers.get('allow')).toContain('QUERY');
	});
});

describe('validation', () => {
	test('params, query and body are checked, every issue reported', async () => {
		const response = await call('/users/abc?upper=maybe');
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('validation');
		expect(
			body.issues.map((issue: { target: string }) => issue.target),
		).toEqual(['params', 'query']);
	});

	test('a malformed JSON body is a 400', async () => {
		const response = await call('/users', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{',
		});
		expect(response.status).toBe(400);
		expect((await response.json()).issues[0].code).toBe('invalid_json');
	});

	test('a valid body reaches the handler, with the headers it set', async () => {
		const response = await call('/users', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'Grace' }),
		});
		expect(response.status).toBe(201);
		expect(response.headers.get('x-created')).toBe('yes');
		expect(await response.json()).toEqual({ id: 2, name: 'Grace' });
	});
});

describe('listen', () => {
	test("Bun.serve routes to the app's handlers", async () => {
		const server = app.listen({ port: 0 });
		try {
			const ok = await fetch(new URL('/users/1', server.url));
			expect(await ok.json()).toEqual({ id: 1, name: 'Ada' });
			const missing = await fetch(new URL('/nope', server.url));
			expect(missing.status).toBe(404);
			const wrong = await fetch(new URL('/health', server.url), {
				method: 'POST',
			});
			expect(wrong.status).toBe(405);
		} finally {
			await server.stop(true);
		}
	});
});

describe('types', () => {
	test('mistakes in a route are compile errors', () => {
		alxia().get(
			'/users/:id',
			// @ts-expect-error: `name` is not a parameter of the path
			validate({ params: z.object({ name: z.string() }) }),
			({ reply }) => reply(200),
		);
		// @ts-expect-error: `quey` is not a part of a request
		validate({ quey: z.object({}) });
		alxia().get('/users', responds({ 200: User }), ({ reply }) =>
			// @ts-expect-error: 201 is not declared
			reply(201, { id: 1, name: 'x' }),
		);
		alxia().get('/users', responds({ 200: User }), ({ reply }) =>
			// @ts-expect-error: the body does not match the schema
			reply(200, { id: '1', name: 'x' }),
		);
	});
});
