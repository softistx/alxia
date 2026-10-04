import { afterAll, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import type {
	Refusal,
	RequestPart,
	ValidationErrorBody,
} from '../errors/errors';
import { problem } from '../reply/problem';
import { type AnyAlxia, alxia } from './alxia';

const Id = z.object({ id: z.coerce.number().int().positive() });
const Name = z.object({ name: z.string().min(1) });

/** A JMAP-like problem for a refused request: what the part was, as `detail`; a body too large, its limit. */
const jmapProblem = (refusal: Refusal) =>
	refusal.kind === 'body_limit'
		? problem({
				type: 'urn:ietf:params:jmap:error:limit',
				status: 413,
				limit: 'maxSizeRequest',
			})
		: problem({
				type:
					refusal.part === 'body' &&
					refusal.issues.some((issue) => issue.code === 'invalid_json')
						? 'urn:ietf:params:jmap:error:notJSON'
						: 'urn:ietf:params:jmap:error:notRequest',
				status: 400,
				detail: `the ${refusal.part} is invalid`,
			});

/** A JMAP-like app: problems for every route declared after the hook. */
const jmap = alxia()
	.post('/before', { body: Name }, ({ reply }) => reply(200, 'ok'))
	.onRefusal(jmapProblem)
	.post('/api', { body: Name }, ({ body, reply }) => reply(200, body.name))
	.get('/download/:id', { params: Id }, ({ params, reply }) =>
		reply(200, params.id),
	)
	.get('/search', { query: z.object({ q: z.string() }) }, ({ reply }) =>
		reply(200, 'found'),
	)
	.get('/health', ({ reply }) => reply(200, 'ok'));

/** Each path of a spec, in process and over a socket. */
const servers: { stop: () => unknown }[] = [];
afterAll(() => {
	for (const server of servers) server.stop();
});
const transports = {
	'app.request': (app: AnyAlxia) => (path: string, init?: RequestInit) =>
		app.request(path, init) as Promise<Response>,
	listen: (app: AnyAlxia) => {
		const server = app.listen({ port: 0 }) as Bun.Server<unknown>;
		servers.push(server);
		return (path: string, init?: RequestInit) =>
			fetch(new URL(path, server.url), init);
	},
} as const;

const json = (body: string): RequestInit => ({
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body,
});

for (const [name, transport] of Object.entries(transports)) {
	describe(`onRefusal, through ${name}`, () => {
		test('the default is unchanged: { error: "validation", issues } as JSON', async () => {
			const call = transport(
				alxia().post('/a', { body: Name }, ({ reply }) => reply(200, 'ok')),
			);
			const response = await call('/a', json('{"name":""}'));
			expect(response.status).toBe(400);
			expect(response.headers.get('content-type')).toBe('application/json');
			const body = (await response.json()) as ValidationErrorBody;
			expect(body.error).toBe('validation');
			expect(body.issues[0]?.target).toBe('body');
		});

		test('a problem+json body, with its content-type', async () => {
			const call = transport(jmap);
			const response = await call('/api', json('{"name":""}'));
			expect(response.status).toBe(400);
			expect(response.headers.get('content-type')).toBe(
				'application/problem+json',
			);
			expect(await response.json()).toEqual({
				type: 'urn:ietf:params:jmap:error:notRequest',
				status: 400,
				detail: 'the body is invalid',
			});
		});

		test('the part that failed: params, query, a body that is no JSON', async () => {
			const call = transport(jmap);
			const params = await call('/download/nope');
			expect(params.status).toBe(400);
			expect(await params.json()).toMatchObject({
				type: 'urn:ietf:params:jmap:error:notRequest',
				detail: 'the params is invalid',
			});
			const query = await call('/search');
			expect(await query.json()).toMatchObject({
				detail: 'the query is invalid',
			});
			const notJson = await call('/api', json('{'));
			expect(await notJson.json()).toMatchObject({
				type: 'urn:ietf:params:jmap:error:notJSON',
				detail: 'the body is invalid',
			});
			expect((await call('/download/7')).status).toBe(200);
		});

		test('a route declared before the hook keeps the default', async () => {
			const call = transport(jmap);
			const response = await call('/before', json('{"name":""}'));
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ error: 'validation' });
		});

		test('a group’s hook stays inside it; a later hook replaces an earlier', async () => {
			const app = alxia()
				.group('/v2', (v2) =>
					v2
						.onRefusal(() => problem({ status: 422, detail: 'v2' }))
						.post('/a', { body: Name }, ({ reply }) => reply(200, 'ok')),
				)
				.post('/a', { body: Name }, ({ reply }) => reply(200, 'ok'))
				.onRefusal(() => problem({ status: 400, detail: 'first' }))
				.onRefusal(() => problem({ status: 400, detail: 'second' }))
				.post('/b', { body: Name }, ({ reply }) => reply(200, 'ok'));
			const call = transport(app);
			const grouped = await call('/v2/a', json('{}'));
			expect(grouped.status).toBe(422);
			expect(await grouped.json()).toEqual({ status: 422, detail: 'v2' });
			expect(await (await call('/a', json('{}'))).json()).toMatchObject({
				error: 'validation',
			});
			expect(await (await call('/b', json('{}'))).json()).toEqual({
				status: 400,
				detail: 'second',
			});
		});

		test('returning nothing falls back to the default', async () => {
			const seen: RequestPart[] = [];
			const app = alxia()
				.onRefusal((refusal) => {
					if (refusal.kind !== 'validation') return undefined;
					seen.push(refusal.part);
					if (refusal.part === 'query') {
						return problem({ status: 400, detail: 'query' });
					}
					return undefined;
				})
				.get('/a', { query: z.object({ q: z.string() }) }, ({ reply }) =>
					reply(200, 'ok'),
				)
				.get('/b/:id', { params: Id }, ({ reply }) => reply(200, 'ok'));
			const call = transport(app);
			expect(await (await call('/a')).json()).toEqual({
				status: 400,
				detail: 'query',
			});
			expect(await (await call('/b/x')).json()).toMatchObject({
				error: 'validation',
			});
			expect(seen).toEqual(['query', 'params']);
		});

		test('declared schemas: the reply is checked, typed, and sent as their output', async () => {
			const Problem = z.object({
				type: z.string(),
				status: z.literal(400),
				detail: z.string(),
			});
			const app = alxia()
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
							// An unknown key the schema strips never leaves the server.
							...({ secret: 'x' } as object),
						}),
				)
				.post('/a', { body: Name }, ({ reply }) => reply(200, 'ok'));
			const call = transport(app);
			const response = await call('/a', json('{}'));
			expect(response.status).toBe(400);
			expect(response.headers.get('content-type')).toBe(
				'application/problem+json',
			);
			expect(await response.json()).toEqual({
				type: 'urn:example:invalid',
				status: 400,
				detail: 'body',
			});
		});

		test('a reply its schemas refuse is a 500', async () => {
			const error = console.error;
			console.error = () => {};
			try {
				const app = alxia()
					.onRefusal(
						{ response: { 400: z.object({ detail: z.string() }) } },
						(_, { reply }) =>
							reply(400, { detail: 1 } as unknown as { detail: string }),
					)
					.post('/a', { body: Name }, ({ reply }) => reply(200, 'ok'));
				const response = await transport(app)('/a', json('{}'));
				expect(response.status).toBe(500);
			} finally {
				console.error = error;
			}
		});

		test('a plugin’s routes: the hook of the app using it, unless they have their own', async () => {
			const own = alxia()
				.onRefusal(() => problem({ status: 400, detail: 'own' }))
				.post('/own', { body: Name }, ({ reply }) => reply(200, 'ok'));
			const plain = alxia().post('/plain', { body: Name }, ({ reply }) =>
				reply(200, 'ok'),
			);
			const app = alxia()
				.onRefusal(() => problem({ status: 400, detail: 'app' }))
				.plugin(plain)
				.plugin(own)
				// The plugin's hook now applies to the routes after it, as its derives do.
				.post('/after', { body: Name }, ({ reply }) => reply(200, 'ok'));
			const call = transport(app);
			expect(await (await call('/plain', json('{}'))).json()).toEqual({
				status: 400,
				detail: 'app',
			});
			expect(await (await call('/own', json('{}'))).json()).toEqual({
				status: 400,
				detail: 'own',
			});
			expect(await (await call('/after', json('{}'))).json()).toEqual({
				status: 400,
				detail: 'own',
			});
		});

		test('a hook that throws reaches onError', async () => {
			const app = alxia()
				.onError((_, { reply }) => reply(503, 'handled'))
				.onRefusal(() => {
					throw new Error('boom');
				})
				.post('/a', { body: Name }, ({ reply }) => reply(200, 'ok'));
			const response = await transport(app)('/a', json('{}'));
			expect(response.status).toBe(503);
		});
	});
}

describe('onRefusal, misused', () => {
	test('a hook returning neither a reply nor nothing is a 500, logged', async () => {
		const logged: unknown[] = [];
		const error = console.error;
		console.error = (value: unknown) => logged.push(value);
		try {
			const app = alxia()
				.onRefusal((() => new Response('raw')) as never)
				.post('/a', { body: Name }, ({ reply }) => reply(200, 'ok'));
			const response = await app.request('/a', json('{}'));
			expect(response.status).toBe(500);
			expect(String(logged[0])).toContain(
				'POST /a: the onRefusal hook returned neither a reply nor nothing.',
			);
		} finally {
			console.error = error;
		}
	});

	test('schemas without a hook throw when declared', () => {
		expect(() =>
			alxia().onRefusal({ response: {} } as never as () => undefined),
		).toThrow('onRefusal(): the hook is missing');
	});
});

describe('onRefusal on a socket route', () => {
	test('a refused upgrade is the hook’s reply', async () => {
		const app = alxia()
			.onRefusal(() => problem({ status: 400, detail: 'socket' }))
			.ws('/rooms/:room', { params: Id }, { message: () => {} });
		const server = app.listen({ port: 0 });
		try {
			const response = await fetch(new URL('/rooms/x', server.url), {
				headers: {
					upgrade: 'websocket',
					connection: 'upgrade',
					'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
					'sec-websocket-version': '13',
				},
			});
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ status: 400, detail: 'socket' });
		} finally {
			await app.stop(true);
		}
	});
});

describe('onRefusal, its mistakes', () => {
	test('mistakes are compile errors', () => {
		// Never called: only compiled.
		const _mistakes = () => {
			// @ts-expect-error: a refusal is a client error, never a 500
			alxia().onRefusal(() => problem({ status: 500 }));
			// @ts-expect-error: a hook answers with a reply, never a raw Response
			alxia().onRefusal(() => new Response());
			// @ts-expect-error: a refusal is a client error, never a 200
			alxia().onRefusal(({ issues }, { reply }) => reply(200, issues));
			alxia().onRefusal(
				{ response: { 400: z.object({ detail: z.string() }) } },
				// @ts-expect-error: the body its schema refuses
				(_, { reply }) => reply(400, { detail: 1 }),
			);
			alxia().onRefusal(
				{ response: { 400: z.object({ detail: z.string() }) } },
				// @ts-expect-error: a status its schemas do not declare
				(_, { reply }) => reply(422, { detail: 'x' }),
			);
			const serverError = { response: { 500: z.string() } };
			// One line: TypeScript reports it at the call or at the schema, by version.
			// @ts-expect-error: schemas for client errors only
			alxia().onRefusal(serverError, () => undefined);
		};
		expect(_mistakes).toBeFunction();
	});
});
