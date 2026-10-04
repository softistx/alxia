/**
 * Each request hook of 0.3, deprecated, beside the middleware that
 * replaces it: the same requests get the same answers, a 404 and a 500
 * included. The hooks' own behaviour is spec'd where it always was
 * (`route-hooks.spec.ts`, `refusal.spec.ts`, `features.spec.ts`).
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { HttpError, refusalOf } from '../errors/errors';
import { withHeaders } from '../reply/headers';
import { type AnyAlxia, alxia } from './alxia';
import { settle } from './boundary';
import { defineMiddleware } from './define-middleware';
import { validate } from './validate';

/** The routes both forms of an app declare after their hook or middleware. */
const routes = <App extends AnyAlxia>(app: App) =>
	(app as unknown as ReturnType<typeof alxia>)
		.get('/ok', ({ reply }) => reply(200, 'ok'))
		.get('/http', () => {
			throw new HttpError(418, 'teapot');
		})
		.get('/boom', () => {
			throw new Error('boom');
		})
		.post(
			'/notes',
			validate({ body: z.object({ title: z.string() }) }),
			({ reply }) => reply(201, 'created'),
		);

/** What each request gets: its status, its body, and the header under test. */
async function answers(app: AnyAlxia, header = 'x-seen') {
	const original = console.error;
	console.error = () => {};
	try {
		const requests = [
			new Request('http://localhost/ok'),
			new Request('http://localhost/missing'),
			new Request('http://localhost/http'),
			new Request('http://localhost/boom'),
			new Request('http://localhost/notes', { method: 'POST', body: '{}' }),
		];
		const results: unknown[] = [];
		for (const request of requests) {
			const response = await app.fetch(request);
			results.push([
				response.status,
				await response.text(),
				response.headers.get(header),
			]);
		}
		return results;
	} finally {
		console.error = original;
	}
}

describe('the request hooks, deprecated, and their middlewares', () => {
	test('onRequest is a middleware first that answers early or calls next()', async () => {
		const early = (request: Request) =>
			request.url.endsWith('/ok')
				? new Response('early', { status: 202 })
				: undefined;
		const hooked = routes(alxia().onRequest(({ request }) => early(request)));
		const used = routes(
			alxia().use(
				defineMiddleware(({ request }, next) => early(request) ?? next()),
			),
		);
		expect(await answers(used)).toEqual(await answers(hooked));
	});

	test('onResponse is a middleware first that settles next() and returns the response', async () => {
		const mark = (response: Response) =>
			withHeaders(response, (headers) =>
				headers.set('x-seen', String(response.status)),
			);
		const hooked = routes(alxia().onResponse((response) => mark(response)));
		const used = routes(
			alxia().use(
				defineMiddleware(async (ctx, next) => mark(await settle(ctx, next()))),
			),
		);
		const expected = await answers(hooked);
		expect(await answers(used)).toEqual(expected);
		// Every response carries it, the 404 and the 500 included.
		expect(expected.map((result) => (result as unknown[])[2])).toEqual([
			'200',
			'404',
			'418',
			'500',
			'400',
		]);
	});

	test('around is a middleware first that runs next() inside it', async () => {
		const seen: string[] = [];
		const hooked = routes(
			alxia().around(async (ctx, next) => {
				seen.push(`around ${ctx.url.pathname}`);
				return next();
			}),
		);
		const used = routes(
			alxia().use(
				defineMiddleware((ctx, next) => {
					seen.push(`use ${ctx.url.pathname}`);
					return next();
				}),
			),
		);
		expect(await answers(used)).toEqual(await answers(hooked));
		expect(seen.filter((line) => line.startsWith('use'))).toHaveLength(5);
		expect(seen.filter((line) => line.startsWith('around'))).toHaveLength(5);
	});

	test('onError is a try/catch around next(), an error it leaves thrown answered as before', async () => {
		const handle = (error: unknown) =>
			error instanceof Error && error.message === 'boom'
				? 'handled'
				: undefined;
		const hooked = routes(
			alxia().onError((error, { reply }) => {
				const handled = handle(error);
				return handled === undefined ? undefined : reply(503, handled);
			}),
		);
		const used = routes(
			alxia().use(
				defineMiddleware(async ({ reply }, next) => {
					try {
						return await next();
					} catch (error) {
						const handled = handle(error);
						if (handled === undefined) throw error;
						return reply(503, handled);
					}
				}),
			),
		);
		expect(await answers(used)).toEqual(await answers(hooked));
	});

	test('onRefusal is a try/catch around next() that reads refusalOf', async () => {
		const hooked = routes(
			alxia().onRefusal((refusal, { reply }) => reply(422, refusal.kind)),
		);
		const used = routes(
			alxia().use(
				defineMiddleware(async ({ reply }, next) => {
					try {
						return await next();
					} catch (error) {
						const refusal = refusalOf(error);
						if (refusal === undefined) throw error;
						return reply(422, refusal.kind);
					}
				}),
			),
		);
		expect(await answers(used)).toEqual(await answers(hooked));
	});

	test('derive is use() of a middleware that returns next(added)', async () => {
		const derived = alxia()
			.derive(() => ({ user: 'ada' }))
			.get('/me', ({ user, reply }) => reply(200, user));
		const used = alxia()
			.use(defineMiddleware((_ctx, next) => next({ user: 'ada' })))
			.get('/me', ({ user, reply }) => reply(200, user));
		expect(await (await derived.request('/me')).text()).toBe('ada');
		expect(await (await used.request('/me')).text()).toBe('ada');
	});

	test('wrap is use() of a middleware that awaits next()', async () => {
		const stamp = (response: Response) => {
			response.headers.set('x-seen', 'wrapped');
			return response;
		};
		const wrapped = routes(
			alxia().wrap(async (_ctx, next) => stamp(await next())),
		);
		const used = routes(
			alxia().use(defineMiddleware(async (_ctx, next) => stamp(await next()))),
		);
		const results = await answers(used);
		// The 404 runs the middleware too, where a wrap never ran; the
		// refusal reaches the middleware thrown, where a wrap's next()
		// resolves to the 400.
		expect(results[0]).toEqual((await answers(wrapped))[0]);
		expect((results[1] as unknown[])[2]).toBe('wrapped');
		expect(((await answers(wrapped))[1] as unknown[])[2]).toBeNull();
		expect((results[4] as unknown[])[2]).toBeNull();
	});
});
