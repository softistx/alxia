import { describe, expect, test } from 'bun:test';
import { alxia, eventStream } from '@alxia/core';
import { z } from 'zod';
import { openApiPath, openapi, operationId } from './document';
import { docs } from './plugin';

const User = z.object({
	id: z.number(),
	name: z.string(),
});

const app = alxia()
	.get(
		'/users/:id',
		{
			params: z.object({ id: z.coerce.number() }),
			query: z.object({ expand: z.string().optional() }),
			response: { 200: User, 404: z.object({ error: z.literal('not_found') }) },
			detail: { summary: 'One user', tags: ['users'] },
		},
		({ reply }) => reply(404, { error: 'not_found' }),
	)
	.post(
		'/users',
		{
			body: z.object({ name: z.string() }),
			response: { 201: User },
			detail: { operationId: 'createUser' },
		},
		({ reply, body }) => reply(201, { id: 1, name: body.name }),
	)
	.query(
		'/users',
		{ body: z.object({ name: z.string() }), response: { 200: z.array(User) } },
		({ reply }) => reply(200, []),
	)
	.delete('/files/*', ({ reply }) => reply(204));

const document = openapi(app, { info: { title: 'Users', version: '1.0.0' } });

describe('openapi', () => {
	test('paths are written the OpenAPI way', () => {
		expect(Object.keys(document.paths)).toEqual([
			'/users/{id}',
			'/users',
			'/files/{path}',
		]);
	});

	test('OpenAPI 3.2: a QUERY route is its path’s query operation, with its body', () => {
		expect(document.openapi).toBe('3.2.0');
		const query = document.paths['/users']?.query;
		expect(query?.operationId).toBe('queryUsers');
		expect(query?.requestBody?.content['application/json']?.schema).toEqual({
			type: 'object',
			properties: { name: { type: 'string' } },
			required: ['name'],
		});
	});

	test('parameters come from the schemas, required as they say', () => {
		const get = document.paths['/users/{id}']?.get;
		expect(get?.parameters).toEqual([
			{ name: 'id', in: 'path', required: true, schema: { type: 'number' } },
			{
				name: 'expand',
				in: 'query',
				required: false,
				schema: { type: 'string' },
			},
		]);
		expect(get?.summary).toBe('One user');
		expect(get?.tags).toEqual(['users']);
	});

	test('replies are documented by what their schema gives back', () => {
		const ok = document.paths['/users/{id}']?.get?.responses['200'];
		expect(ok?.content?.['application/json']?.schema).toMatchObject({
			properties: { id: { type: 'number' }, name: { type: 'string' } },
		});
	});

	test('an event stream, cookies, and a converter', () => {
		const streaming = alxia().get(
			'/ticks',
			{
				cookies: z.object({ session: z.string() }),
				response: { 200: eventStream(z.object({ n: z.number() })) },
			},
			({ reply }) => reply(200, (async function* () {})()),
		);
		const doc = openapi(streaming, {
			info: { title: 't', version: '1' },
			convert: (schema) =>
				schema['~standard'].vendor === 'zod' ? undefined : { type: 'null' },
		});
		const get = doc.paths['/ticks']?.get;
		expect(get?.parameters?.[0]).toMatchObject({
			name: 'session',
			in: 'cookie',
		});
		expect(
			get?.responses['200']?.content?.['text/event-stream']?.itemSchema,
		).toMatchObject({
			properties: { n: { type: 'number' } },
		});
	});

	test('every validating route documents its 400, every route its 500', () => {
		const post = document.paths['/users']?.post;
		expect(Object.keys(post?.responses ?? {}).sort()).toEqual([
			'201',
			'400',
			'500',
		]);
		const remove = document.paths['/files/{path}']?.delete;
		expect(Object.keys(remove?.responses ?? {}).sort()).toEqual([
			'500',
			'default',
		]);
	});

	test('a route’s own 400 and 500 are kept', () => {
		const own = openapi(
			alxia().post(
				'/orders',
				{
					body: z.object({ sku: z.string() }),
					response: {
						201: z.object({ id: z.string() }),
						400: z.object({ error: z.literal('out_of_stock') }),
						500: z.object({ error: z.literal('payment_down') }),
					},
				},
				({ reply }) => reply(201, { id: '1' }),
			),
			{ info: { title: 'Orders', version: '1' } },
		);
		const responses = own.paths['/orders']?.post?.responses ?? {};
		const json = (status: string) =>
			responses[status]?.content?.['application/json']?.schema;
		expect(json('400')?.['anyOf']).toEqual([
			{
				type: 'object',
				properties: { error: { type: 'string', const: 'out_of_stock' } },
				required: ['error'],
				additionalProperties: false,
			},
			{ $ref: '#/components/schemas/ValidationError' },
		]);
		expect(JSON.stringify(json('500'))).toContain('payment_down');
		expect(JSON.stringify(json('500'))).toContain('InternalError');
	});

	test('a route’s own 400 as text: the framework’s JSON 400 beside it', () => {
		const own = openapi(
			alxia().post(
				'/notes',
				{ body: z.string(), response: { 201: z.string(), 400: z.string() } },
				({ reply }) => reply(201, 'ok'),
			),
			{ info: { title: 'Notes', version: '1' } },
		);
		expect(own.paths['/notes']?.post?.responses['400']?.content).toEqual({
			'text/plain': { schema: { type: 'string' } },
			'application/json': {
				schema: { $ref: '#/components/schemas/ValidationError' },
			},
		});
	});

	test('operation ids: the route’s own, or one from its method and path', () => {
		expect(document.paths['/users']?.post?.operationId).toBe('createUser');
		expect(document.paths['/users/{id}']?.get?.operationId).toBe(
			'getUsersById',
		);
		expect(operationId('DELETE', '/files/*')).toBe('deleteFilesPath');
		expect(openApiPath('/a/:b/*')).toBe('/a/{b}/{path}');
	});
});

describe('docs', () => {
	test('serves the document and a page, and leaves itself out of it', async () => {
		const served = alxia().get('/ping', ({ reply }) => reply(200, 'pong'));
		served.use(docs(served, { info: { title: 'Ping', version: '1' } }));
		const json = await served.fetch(
			new Request('http://localhost/openapi.json'),
		);
		const body = await json.json();
		expect(Object.keys(body.paths)).toEqual(['/ping']);
		const page = await served.fetch(new Request('http://localhost/docs'));
		expect(page.headers.get('content-type')).toContain('text/html');
		expect(await page.text()).toContain('data-url="/openapi.json"');
	});

	test('on a prefixed app: its own paths, and a page that finds them', async () => {
		const api = alxia({ prefix: '/api' }).get('/ping', ({ reply }) =>
			reply(200, 'pong'),
		);
		api.use(docs(api, { info: { title: 'Ping', version: '1' } }));
		const json = await api.fetch(
			new Request('http://localhost/api/openapi.json'),
		);
		const body = await json.json();
		expect(Object.keys(body.paths)).toEqual(['/api/ping']);
		const page = await api.fetch(new Request('http://localhost/api/docs'));
		expect(await page.text()).toContain('data-url="/api/openapi.json"');
	});

	test('in a group: the page finds the document under the group', async () => {
		const app = alxia().get('/ping', ({ reply }) => reply(200, 'pong'));
		app.group('/v1', (group) =>
			group.use(docs(app, { info: { title: 'Ping', version: '1' }, ui: '/' })),
		);
		const page = await app.fetch(new Request('http://localhost/v1'));
		expect(await page.text()).toContain('data-url="/v1/openapi.json"');
	});

	test('under a group with a parameter: the page asks where it is served', async () => {
		const app = alxia().get('/ping', ({ reply }) => reply(200, 'pong'));
		app.group('/:tenant', (group) =>
			group.use(docs(app, { info: { title: 'Ping', version: '1' } })),
		);
		const page = await app.fetch(new Request('http://localhost/acme/docs'));
		expect(await page.text()).toContain('data-url="/acme/openapi.json"');
	});

	test('two docs plugins: neither lists the other', async () => {
		const app = alxia().get('/a', ({ reply }) => reply(200, 'a'));
		app.group('/v1', (group) =>
			group.use(docs(app, { info: { title: 'A', version: '1' } })),
		);
		app.group('/v2', (group) =>
			group.use(docs(app, { info: { title: 'A', version: '2' } })),
		);
		for (const version of ['v1', 'v2']) {
			const json = await app.fetch(
				new Request(`http://localhost/${version}/openapi.json`),
			);
			expect(Object.keys((await json.json()).paths)).toEqual(['/a']);
		}
	});
});
