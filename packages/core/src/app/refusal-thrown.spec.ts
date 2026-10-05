/**
 * A refusal is thrown — a `ValidationError` by `validate`, a
 * `ContentTooLargeError` by a body read past its limit — so that a
 * middleware before it answers it; the default 400 or 413 answers it
 * otherwise. And `settle`, which answers what `next()` threw as the route
 * would.
 */
import { describe, expect, spyOn, test } from 'bun:test';
import { z } from 'zod';
import {
	ContentTooLargeError,
	refusalOf,
	ValidationError,
} from '../errors/errors';
import { alxia } from './alxia';
import { settle } from './boundary';
import { defineMiddleware } from './define-middleware';
import { validate } from './validate';

const Note = z.object({ title: z.string().min(1) });

class Unavailable extends Error {}

const post = (body: string, headers: Record<string, string> = {}) =>
	new Request('http://localhost/notes', {
		method: 'POST',
		body,
		headers: { 'content-type': 'application/json', ...headers },
	});

/** Answers a validation refusal with a 422 of its own; throws anything else on. */
const problems = defineMiddleware(async ({ reply }, next) => {
	try {
		return await next();
	} catch (error) {
		const refusal = refusalOf(error);
		if (refusal?.kind !== 'validation') throw error;
		return reply(422, { detail: `the ${refusal.part} is invalid` });
	}
});

describe('a refusal, thrown', () => {
	test('a middleware before validate answers it in its own format', async () => {
		const app = alxia()
			.use(problems)
			.post('/notes', validate({ body: Note }), ({ body, reply }) =>
				reply(201, body),
			);
		const refused = await app.fetch(post('{"title":""}'));
		expect(refused.status).toBe(422);
		expect(await refused.json()).toEqual({ detail: 'the body is invalid' });
		expect((await app.fetch(post('{"title":"a"}'))).status).toBe(201);
	});

	test('nobody answers it: the default 400, its body unchanged', async () => {
		const app = alxia().post('/notes', validate({ body: Note }), ({ reply }) =>
			reply(201, 'ok'),
		);
		const refused = await app.fetch(post('{"title":""}'));
		expect(refused.status).toBe(400);
		expect(await refused.json()).toMatchObject({
			error: 'validation',
			issues: [{ target: 'body' }],
		});
	});

	test('is a ValidationError, an HttpError of the 400, carrying the refusal', async () => {
		let caught: unknown;
		const app = alxia().post(
			'/notes',
			async (_ctx, next) => {
				try {
					return await next();
				} catch (error) {
					caught = error;
					throw error;
				}
			},
			validate({ body: Note }),
			({ reply }) => reply(201, 'ok'),
		);
		expect((await app.fetch(post('{}'))).status).toBe(400);
		expect(caught).toBeInstanceOf(ValidationError);
		const error = caught as ValidationError;
		expect(error.status).toBe(400);
		expect(error.refusal.part).toBe('body');
		expect(error.body).toEqual({
			error: 'validation',
			issues: error.refusal.issues,
		});
	});

	test('a body past its limit is the body_limit refusal', async () => {
		let kind: string | undefined;
		const app = alxia().post(
			'/notes',
			{ bodyLimit: 4 },
			async (_ctx, next) => {
				try {
					return await next();
				} catch (error) {
					kind = refusalOf(error)?.kind;
					throw error;
				}
			},
			validate({ body: Note }),
			({ reply }) => reply(201, 'ok'),
		);
		expect((await app.fetch(post('{"title":"long"}'))).status).toBe(413);
		expect(kind).toBe('body_limit');
		expect(refusalOf(new ContentTooLargeError(4))).toEqual({
			kind: 'body_limit',
			limit: 4,
		});
		expect(refusalOf(new Error('no'))).toBeUndefined();
	});
});

describe('settle(ctx, next())', () => {
	test('sees every response: a caught error, a 400, a 404 and a 500', async () => {
		const statuses: number[] = [];
		const watch = defineMiddleware(async (ctx, next) => {
			const response = await settle(ctx, next());
			statuses.push(response.status);
			response.headers.set('x-watched', '1');
			return response;
		});
		const unavailable = defineMiddleware(async ({ reply }, next) => {
			try {
				return await next();
			} catch (error) {
				if (!(error instanceof Unavailable)) throw error;
				return reply(503, 'handled');
			}
		});
		const app = alxia()
			.use(watch, unavailable)
			.post('/notes', validate({ body: Note }), ({ reply }) => reply(201, 'ok'))
			.get('/busy', () => {
				throw new Unavailable('busy');
			})
			.get('/bug', () => {
				throw new Error('bug');
			});
		const busy = await app.request('/busy');
		expect(busy.status).toBe(503);
		expect(busy.headers.get('x-watched')).toBe('1');
		const refused = await app.fetch(post('{}'));
		expect(refused.status).toBe(400);
		expect(refused.headers.get('x-watched')).toBe('1');
		const missing = await app.request('/missing');
		expect(missing.headers.get('x-watched')).toBe('1');
		const logged = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const bug = await app.request('/bug');
			expect(bug.headers.get('x-watched')).toBe('1');
			expect(await bug.json()).toEqual({ error: 'internal' });
		} finally {
			logged.mockRestore();
		}
		expect(statuses).toEqual([503, 400, 404, 500]);
	});
});

describe('settle(ctx, next()), its error and the middlewares inside it', () => {
	test('keeps the error on ctx.error, and passes a response through', async () => {
		let error: unknown;
		const watch = defineMiddleware(async (ctx, next) => {
			const response = await settle(ctx, next());
			error = ctx.error;
			return response;
		});
		const app = alxia()
			.use(watch)
			.get('/ok', ({ reply }) => reply(200, 'ok'))
			.get('/teapot', () => {
				throw new ValidationError({
					kind: 'validation',
					part: 'query',
					issues: [],
				});
			});
		expect((await app.request('/ok')).status).toBe(200);
		expect(error).toBeUndefined();
		expect((await app.request('/teapot')).status).toBe(400);
		expect(error).toBeInstanceOf(ValidationError);
	});

	test('a middleware inside it answers first: settle sees its response', async () => {
		const statuses: number[] = [];
		const app = alxia()
			.use(
				defineMiddleware(async (ctx, next) => {
					const response = await settle(ctx, next());
					statuses.push(response.status);
					return response;
				}),
			)
			.use(problems)
			.post('/notes', validate({ body: Note }), ({ reply }) =>
				reply(201, 'ok'),
			);
		expect((await app.fetch(post('{}'))).status).toBe(422);
		expect(statuses).toEqual([422]);
	});
});

describe('next.behind()', () => {
	test('runs the rest behind a reply sent at once', async () => {
		const { promise: release, resolve } = Promise.withResolvers<void>();
		let refreshed: Promise<Response> | undefined;
		const app = alxia()
			.use(
				defineMiddleware(({ reply }, next) => {
					refreshed = next.behind();
					return reply(200, 'stale');
				}),
			)
			.get('/', async ({ reply }) => {
				await release;
				return reply(200, 'fresh');
			});
		const served = await app.request('/');
		expect(await served.text()).toBe('stale');
		resolve();
		expect(await (await (refreshed as Promise<Response>)).text()).toBe('fresh');
	});

	test('merges what it is given, as next(added) does', async () => {
		let refreshed: Promise<Response> | undefined;
		const app = alxia()
			.use(
				defineMiddleware(({ reply }, next) => {
					refreshed = next.behind({ by: 'refresh' });
					return reply(200, 'stale');
				}),
			)
			.get('/', (ctx) =>
				ctx.reply(200, String((ctx as unknown as { by: string }).by)),
			);
		expect(await (await app.request('/')).text()).toBe('stale');
		expect(await (await (refreshed as Promise<Response>)).text()).toBe(
			'refresh',
		);
	});
});
