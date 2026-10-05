/**
 * A request the route's `validate` refuses: the default 400, or the answer
 * of a try/catch middleware reading `refusalOf`, in process and over a
 * socket alike.
 */
import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import { z } from 'zod';
import { refusalOf, type ValidationErrorBody } from '../errors/errors';
import { problem } from '../reply/problem';
import { type AnyAlxia, alxia } from './alxia';
import { defineMiddleware } from './define-middleware';
import { responds, validate } from './validate';

const Id = z.object({ id: z.coerce.number().int().positive() });
const Name = z.object({ name: z.string().min(1) });

/** A JMAP-like problem for a refused request: what the part was, as `detail`. */
const jmap = defineMiddleware(async (_ctx, next) => {
	try {
		return await next();
	} catch (error) {
		const refusal = refusalOf(error);
		if (refusal?.kind !== 'validation') throw error;
		const notJson =
			refusal.part === 'body' &&
			refusal.issues.some((issue) => issue.code === 'invalid_json');
		return problem({
			type: notJson
				? 'urn:ietf:params:jmap:error:notJSON'
				: 'urn:ietf:params:jmap:error:notRequest',
			status: 400,
			detail: `the ${refusal.part} is invalid`,
		});
	}
});

/** Answers every validation refusal with `detail`. */
const answering = (status: 400 | 422, detail: string) =>
	defineMiddleware(async (_ctx, next) => {
		try {
			return await next();
		} catch (error) {
			if (refusalOf(error)?.kind !== 'validation') throw error;
			return problem({ status, detail });
		}
	});

/** A JMAP-like app: problems for every route declared after the middleware. */
const jmapApp = alxia()
	.post('/before', validate({ body: Name }), ({ reply }) => reply(200, 'ok'))
	.use(jmap)
	.post('/api', validate({ body: Name }), ({ body, reply }) =>
		reply(200, body.name),
	)
	.get('/download/:id', validate({ params: Id }), ({ params, reply }) =>
		reply(200, params.id),
	)
	.get(
		'/search',
		validate({ query: z.object({ q: z.string() }) }),
		({ reply }) => reply(200, 'found'),
	);

/** Each path of a spec, in process and over a socket. */
const servers: { stop: () => unknown }[] = [];
afterAll(() => {
	for (const server of servers) server.stop();
});
const transports = {
	'app.request': (app: AnyAlxia) => (path: string, init?: RequestInit) =>
		app.request(path, init) as Promise<Response>,
	listen: (app: AnyAlxia) => {
		// One server per app: an app listens once at a time.
		const server =
			(app.server as Bun.Server<unknown> | undefined) ??
			(app.listen({ port: 0, signals: false }) as Bun.Server<unknown>);
		if (!servers.includes(server)) servers.push(server);
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
	describe(`a refusal, through ${name}`, () => {
		test('the default: { error: "validation", issues } as JSON', async () => {
			const call = transport(
				alxia().post('/a', validate({ body: Name }), ({ reply }) =>
					reply(200, 'ok'),
				),
			);
			const response = await call('/a', json('{"name":""}'));
			expect(response.status).toBe(400);
			expect(response.headers.get('content-type')).toBe('application/json');
			const body = (await response.json()) as ValidationErrorBody;
			expect(body.error).toBe('validation');
			expect(body.issues[0]?.target).toBe('body');
		});

		test('a middleware answers a problem+json body, with its content-type', async () => {
			const response = await transport(jmapApp)('/api', json('{"name":""}'));
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
			const call = transport(jmapApp);
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

		test('a route declared before the middleware keeps the default', async () => {
			const response = await transport(jmapApp)('/before', json('{"name":""}'));
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ error: 'validation' });
		});
	});

	describe(`a refusal middleware's scope and replies, through ${name}`, () => {
		test('a group’s middleware stays inside it; the innermost answers first', async () => {
			const app = alxia()
				.group('/v2', (v2) =>
					v2
						.use(answering(422, 'v2'))
						.post('/a', validate({ body: Name }), ({ reply }) =>
							reply(200, 'ok'),
						),
				)
				.post('/a', validate({ body: Name }), ({ reply }) => reply(200, 'ok'))
				.use(answering(400, 'outer'), answering(400, 'inner'))
				.post('/b', validate({ body: Name }), ({ reply }) => reply(200, 'ok'));
			const call = transport(app);
			const grouped = await call('/v2/a', json('{}'));
			expect(grouped.status).toBe(422);
			expect(await grouped.json()).toEqual({ status: 422, detail: 'v2' });
			expect(await (await call('/a', json('{}'))).json()).toMatchObject({
				error: 'validation',
			});
			expect(await (await call('/b', json('{}'))).json()).toEqual({
				status: 400,
				detail: 'inner',
			});
		});

		test('behind responds, the reply is checked and sent as its schema output', async () => {
			const Problem = z.object({ status: z.literal(422), detail: z.string() });
			const app = alxia().post(
				'/a',
				responds({ 200: z.string(), 422: Problem }),
				async ({ reply }, next) => {
					try {
						return await next();
					} catch (error) {
						if (refusalOf(error) === undefined) throw error;
						// An unknown key the schema strips never leaves the server.
						return reply(422, {
							status: 422,
							detail: 'body',
							secret: 'x',
						} as never);
					}
				},
				validate({ body: Name }),
				({ reply }) => reply(200, 'ok'),
			);
			const response = await transport(app)('/a', json('{}'));
			expect(response.status).toBe(422);
			expect(await response.json()).toEqual({ status: 422, detail: 'body' });
		});

		test('a reply its responds refuses is a 500', async () => {
			const logged = spyOn(console, 'error').mockImplementation(() => {});
			try {
				const app = alxia().post(
					'/a',
					responds({ 200: z.string(), 422: z.object({ detail: z.string() }) }),
					async ({ reply }, next) => {
						try {
							return await next();
						} catch {
							return reply(422, { detail: 1 } as never);
						}
					},
					validate({ body: Name }),
					({ reply }) => reply(200, 'ok'),
				);
				const response = await transport(app)('/a', json('{}'));
				expect(response.status).toBe(500);
			} finally {
				logged.mockRestore();
			}
		});
	});
}
