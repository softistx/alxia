import { describe, expect, test } from 'bun:test';
import { alxia, defineHook, eventStream, problem } from '@alxia/core';
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

	test('named events: one object per name in the itemSchema', () => {
		const push = alxia().get(
			'/push',
			{
				response: {
					200: eventStream({
						state: z.object({ changed: z.record(z.string(), z.string()) }),
						ping: z.object({ interval: z.number() }),
					}),
				},
			},
			({ reply }) => reply(200, (async function* () {})()),
		);
		const doc = openapi(push, { info: { title: 't', version: '1' } });
		const content = doc.paths['/push']?.get?.responses['200']?.content;
		expect(Object.keys(content ?? {})).toEqual(['text/event-stream']);
		const event = (name: string, data: unknown) => ({
			type: 'object',
			properties: {
				event: { const: name },
				data,
				id: { type: 'string' },
				retry: { type: 'integer', minimum: 0 },
			},
			required: ['event', 'data'],
		});
		expect(content?.['text/event-stream']?.itemSchema).toMatchObject({
			oneOf: [
				event('state', {
					type: 'object',
					properties: { changed: { type: 'object' } },
				}),
				event('ping', {
					type: 'object',
					properties: { interval: { type: 'number' } },
				}),
			],
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

	test('a route given hooks is documented by its schemas, as one behind a derive', () => {
		const deny = defineHook(({ reply }) =>
			reply(403, { error: 'forbidden' as const }),
		);
		const hooked = openapi(
			alxia()
				.post(
					'/a/:id',
					[deny],
					{
						params: z.object({ id: z.string() }),
						body: User,
						response: { 201: User },
					},
					({ reply, body }) => reply(201, body),
				)
				.post(
					'/b/:id',
					{
						params: z.object({ id: z.string() }),
						body: User,
						response: { 201: User },
					},
					({ reply, body }) => reply(201, body),
				),
			{ info: { title: 'Hooks', version: '1.0.0' } },
		);
		expect(hooked.paths['/a/{id}']?.post?.responses).toEqual(
			hooked.paths['/b/{id}']?.post?.responses ?? {},
		);
		expect(hooked.paths['/a/{id}']?.post?.parameters).toEqual(
			hooked.paths['/b/{id}']?.post?.parameters ?? [],
		);
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

	test('an onRefusal hook with schemas: its statuses, under its content type', () => {
		const Problem = z.object({
			type: z.string(),
			status: z.literal(400),
			detail: z.string(),
		});
		const refused = openapi(
			alxia()
				.post('/before', { body: z.string() }, ({ reply }) => reply(201, 'ok'))
				.onRefusal(
					{
						response: { 400: Problem },
						contentType: 'application/problem+json',
					},
					(refusal, { reply }) =>
						reply(400, {
							type: 'urn:example:invalid',
							status: 400,
							detail: refusal.kind === 'validation' ? refusal.part : 'body',
						}),
				)
				.post('/after', { body: z.string() }, ({ reply }) => reply(201, 'ok'))
				.get('/plain', ({ reply }) => reply(200, 'ok')),
			{ info: { title: 'Problems', version: '1' } },
		);
		const after = refused.paths['/after']?.post?.responses ?? {};
		expect(Object.keys(after).sort()).toEqual(['400', '500', 'default']);
		expect(after['400']).toEqual({
			description: 'The request was refused',
			content: {
				'application/problem+json': {
					schema: {
						type: 'object',
						properties: {
							type: { type: 'string' },
							status: { type: 'number', const: 400 },
							detail: { type: 'string' },
						},
						required: ['type', 'status', 'detail'],
						additionalProperties: false,
					},
				},
			},
		});
		expect(refused.paths['/before']?.post?.responses['400']?.content).toEqual({
			'application/json': {
				schema: { $ref: '#/components/schemas/ValidationError' },
			},
		});
		expect(
			Object.keys(refused.paths['/plain']?.get?.responses ?? {}).sort(),
		).toEqual(['500', 'default']);
	});

	test('an onRefusal hook without schemas: a client error whose body it does not say', () => {
		const refused = openapi(
			alxia()
				.onRefusal(() => problem({ status: 422, detail: 'invalid' }))
				.post('/a', { body: z.string() }, ({ reply }) => reply(201, 'ok')),
			{ info: { title: 'Problems', version: '1' } },
		);
		expect(refused.paths['/a']?.post?.responses['4XX']).toEqual({
			description: 'The request was refused',
		});
		expect(refused.paths['/a']?.post?.responses['400']).toBeUndefined();
	});

	test('a 413 for a route under a bodyLimit, its own or inherited, and no other', () => {
		const limited = openapi(
			alxia()
				.post('/free', { body: z.string() }, ({ reply }) => reply(200, 'ok'))
				.post('/notes', { body: z.string(), bodyLimit: 1024 }, ({ reply }) =>
					reply(200, 'ok'),
				)
				.bodyLimit(64)
				.post('/raw', ({ reply }) => reply(200, 'ok')),
			{ info: { title: 'Notes', version: '1' } },
		);
		expect(limited.paths['/free']?.post?.responses['413']).toBeUndefined();
		expect(limited.paths['/notes']?.post?.responses['413']).toEqual({
			description: 'The body is larger than 1024 bytes',
			content: {
				'application/json': {
					schema: { $ref: '#/components/schemas/ContentTooLargeError' },
				},
			},
		});
		expect(limited.paths['/raw']?.post?.responses['413']?.description).toBe(
			'The body is larger than 64 bytes',
		);
		expect(limited.components?.schemas?.['ContentTooLargeError']).toEqual({
			type: 'object',
			properties: {
				error: { const: 'content_too_large' },
				limit: { type: 'integer' },
			},
			required: ['error', 'limit'],
		});
	});

	test('an onRefusal hook’s 413: on every route it may refuse, naming the limit where there is one', () => {
		const Problem = (status: 400 | 413) =>
			z.object({ type: z.string(), status: z.literal(status) });
		const refused = openapi(
			alxia()
				.onRefusal(
					{
						response: { 400: Problem(400), 413: Problem(413) },
						contentType: 'application/problem+json',
					},
					(refusal, { reply }) =>
						refusal.kind === 'body_limit'
							? reply(413, { type: 'urn:example:limit', status: 413 })
							: reply(400, { type: 'urn:example:invalid', status: 400 }),
				)
				.post('/free', { body: z.string() }, ({ reply }) => reply(200, 'ok'))
				.post('/raw', { bodyLimit: 2048 }, ({ reply }) => reply(200, 'ok')),
			{ info: { title: 'Problems', version: '1' } },
		);
		const free = refused.paths['/free']?.post?.responses ?? {};
		expect(Object.keys(free).sort()).toEqual(['400', '413', '500', 'default']);
		expect(free['413']?.description).toBe('The request was refused');
		const raw = refused.paths['/raw']?.post?.responses ?? {};
		expect(Object.keys(raw).sort()).toEqual(['400', '413', '500', 'default']);
		expect(raw['413']?.description).toBe('The body is larger than 2048 bytes');
		expect(Object.keys(raw['413']?.content ?? {})).toEqual([
			'application/problem+json',
		]);
	});

	test('a hook per kind: each kind’s schemas, under each one’s content type, on the routes it may refuse', () => {
		const Invalid = z.object({ detail: z.string() });
		const TooLarge = z.object({ limit: z.number() });
		const refused = openapi(
			alxia()
				.onRefusal(
					'validation',
					{
						response: { 422: Invalid },
						contentType: 'application/problem+json',
					},
					(refusal, { reply }) => reply(422, { detail: refusal.part }),
				)
				.onRefusal(
					'body_limit',
					{ response: { 413: TooLarge } },
					(refusal, { reply }) => reply(413, { limit: refusal.limit }),
				)
				.post('/both', { body: z.string(), bodyLimit: 64 }, ({ reply }) =>
					reply(200, 'ok'),
				)
				.post('/valid', { body: z.string() }, ({ reply }) => reply(200, 'ok'))
				.post('/raw', { bodyLimit: 64 }, ({ reply }) => reply(200, 'ok')),
			{ info: { title: 'Kinds', version: '1' } },
		);
		const both = refused.paths['/both']?.post?.responses ?? {};
		expect(Object.keys(both).sort()).toEqual(['413', '422', '500', 'default']);
		expect(both['422']).toEqual({
			description: 'The request was refused',
			content: {
				'application/problem+json': {
					schema: {
						type: 'object',
						properties: { detail: { type: 'string' } },
						required: ['detail'],
						additionalProperties: false,
					},
				},
			},
		});
		expect(both['413']).toEqual({
			description: 'The body is larger than 64 bytes',
			content: {
				'application/json': {
					schema: {
						type: 'object',
						properties: { limit: { type: 'number' } },
						required: ['limit'],
						additionalProperties: false,
					},
				},
			},
		});
		expect(
			Object.keys(refused.paths['/valid']?.post?.responses ?? {}).sort(),
		).toEqual(['422', '500', 'default']);
		expect(
			Object.keys(refused.paths['/raw']?.post?.responses ?? {}).sort(),
		).toEqual(['413', '500', 'default']);
	});

	test('a kind without a hook: the general hook’s schemas, else the default of the kind', () => {
		const Problem = z.object({ type: z.string() });
		const general = openapi(
			alxia()
				.onRefusal({ response: { 400: Problem } }, (_refusal, { reply }) =>
					reply(400, { type: 'urn:example:invalid' }),
				)
				.onRefusal('body_limit', () => problem({ status: 413 }))
				.post('/a', { body: z.string(), bodyLimit: 64 }, ({ reply }) =>
					reply(200, 'ok'),
				),
			{ info: { title: 'Kinds', version: '1' } },
		);
		const a = general.paths['/a']?.post?.responses ?? {};
		expect(Object.keys(a).sort()).toEqual(['400', '4XX', '500', 'default']);
		expect(Object.keys(a['400']?.content ?? {})).toEqual(['application/json']);
		const none = openapi(
			alxia()
				.onRefusal('validation', () => problem({ status: 422 }))
				.post('/a', { body: z.string(), bodyLimit: 64 }, ({ reply }) =>
					reply(200, 'ok'),
				),
			{ info: { title: 'Kinds', version: '1' } },
		);
		const b = none.paths['/a']?.post?.responses ?? {};
		expect(Object.keys(b).sort()).toEqual(['413', '4XX', '500', 'default']);
		expect(b['413']?.content).toEqual({
			'application/json': {
				schema: { $ref: '#/components/schemas/ContentTooLargeError' },
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
