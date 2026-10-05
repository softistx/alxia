/**
 * Each kind of refusal — `validation`, `body_limit` — answered by a
 * try/catch middleware reading `refusalOf`, which throws the kinds it does
 * not answer on; and where such a middleware applies: a plugin's routes, a
 * socket's upgrade.
 */
import { describe, expect, expectTypeOf, spyOn, test } from 'bun:test';
import { z } from 'zod';
import {
	type BodyLimitRefusal,
	type Refusal,
	refusalOf,
	type ValidationRefusal,
} from '../errors/errors';
import { problem } from '../reply/problem';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';
import { validate } from './validate';

const Name = z.object({ name: z.string().min(1) });

const post = (body: string, cookie?: string): RequestInit => ({
	method: 'POST',
	headers: {
		'content-type': 'application/json',
		...(cookie === undefined ? {} : { cookie }),
	},
	body,
});
/** A body its schema refuses, and one past a limit of 32 bytes. */
const INVALID = post('{"name":""}');
const LARGE = post(JSON.stringify({ name: 'x'.repeat(64) }));

/** Answers the refusals of one kind with `answer`, and throws every other error on. */
const onKind = <Kind extends Refusal['kind']>(
	kind: Kind,
	answer: (
		refusal: Extract<Refusal, { kind: Kind }>,
	) => ReturnType<typeof problem>,
) =>
	defineMiddleware(async (_ctx, next) => {
		try {
			return await next();
		} catch (error) {
			const refusal = refusalOf(error);
			if (refusal?.kind !== kind) throw error;
			return answer(refusal as Extract<Refusal, { kind: Kind }>);
		}
	});

const invalid = onKind('validation', (refusal) =>
	problem({ status: 422, detail: `the ${refusal.part} is invalid` }),
);
const tooLarge = onKind('body_limit', (refusal) =>
	problem({ status: 413, detail: `over ${refusal.limit}` }),
);

/** A route that validates its body and has a limit: it may be refused with either kind. */
const limited = <App extends ReturnType<typeof alxia>>(app: App) =>
	app.post('/a', { bodyLimit: 32 }, validate({ body: Name }), ({ reply }) =>
		reply(200, 'ok'),
	);

describe('a refusal answered by its kind', () => {
	test('each kind is answered by its own middleware', async () => {
		const app = limited(alxia().use(invalid, tooLarge));
		const refused = await app.request('/a', INVALID);
		expect(refused.status).toBe(422);
		expect(await refused.json()).toEqual({
			status: 422,
			detail: 'the body is invalid',
		});
		const large = await app.request('/a', LARGE);
		expect(large.status).toBe(413);
		expect(await large.json()).toEqual({ status: 413, detail: 'over 32' });
	});

	test('a kind no middleware answers gets the default answer', async () => {
		const app = limited(alxia().use(invalid));
		const large = await app.request('/a', LARGE);
		expect(large.status).toBe(413);
		expect(await large.json()).toEqual({
			error: 'content_too_large',
			limit: 32,
		});
		const only = limited(alxia().use(tooLarge));
		expect(await (await only.request('/a', INVALID)).json()).toMatchObject({
			error: 'validation',
		});
	});

	test("reads the request's cookies as they arrived", async () => {
		const app = limited(
			alxia().use(async ({ cookies }, next) => {
				try {
					return await next();
				} catch (error) {
					if (refusalOf(error) === undefined) throw error;
					return problem({ status: 422, detail: cookies['lang'] ?? 'none' });
				}
			}),
		);
		const response = await app.request('/a', post('{"name":""}', 'lang=fr'));
		expect(await response.json()).toEqual({ status: 422, detail: 'fr' });
	});
});

describe('a refusal middleware that fails, and its types', () => {
	test('a middleware that throws while answering is a 500, or the answer of one around it', async () => {
		const broken = onKind('validation', () => {
			throw new Error('the answer failed');
		});
		const logged = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const app = limited(alxia().use(broken));
			const response = await app.request('/a', INVALID);
			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({ error: 'internal' });
		} finally {
			logged.mockRestore();
		}
		const caught = limited(
			alxia().use(async ({ reply }, next) => {
				try {
					return await next();
				} catch {
					return reply(503, 'caught');
				}
			}, broken),
		);
		expect((await caught.request('/a', INVALID)).status).toBe(503);
	});

	test('refusalOf is narrowed by kind before its fields are read', () => {
		const read = (error: unknown) => {
			const refusal = refusalOf(error);
			if (refusal === undefined) return;
			// @ts-expect-error: a body_limit refusal has no part
			refusal.part;
			if (refusal.kind === 'validation') {
				expectTypeOf(refusal).toEqualTypeOf<ValidationRefusal>();
			} else expectTypeOf(refusal).toEqualTypeOf<BodyLimitRefusal>();
		};
		expect(read).toBeFunction();
	});
});

describe('a refusal middleware, with the rest of the app', () => {
	test("the app's answers a plugin's route; a plugin's own answers first, inside it", async () => {
		const plain = limited(alxia());
		const own = alxia()
			.use(onKind('validation', () => problem({ status: 400, detail: 'own' })))
			.post('/own', validate({ body: Name }), ({ reply }) => reply(200, 'ok'));
		const app = alxia()
			.use(onKind('validation', () => problem({ status: 400, detail: 'app' })))
			.plugin(plain)
			.plugin(own)
			// The plugin's middleware applies to the routes after it, as its derives do.
			.post('/after', validate({ body: Name }), ({ reply }) =>
				reply(200, 'ok'),
			);
		const detail = async (path: string) =>
			((await (await app.request(path, INVALID)).json()) as { detail: string })
				.detail;
		expect(await detail('/a')).toBe('app');
		expect(await detail('/own')).toBe('own');
		expect(await detail('/after')).toBe('own');
	});

	test('a socket route: its upgrade refused, answered by the middleware', async () => {
		const app = alxia()
			.use(invalid)
			.ws('/ws', validate({ query: z.object({ room: z.string() }) }), {
				message: () => {},
			});
		const response = await app.request('/ws', {
			headers: { upgrade: 'websocket' },
		});
		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({
			status: 422,
			detail: 'the query is invalid',
		});
	});

	test('a socket route over a server: its refused upgrade is the answer', async () => {
		const app = alxia()
			.use(invalid)
			.ws(
				'/rooms/:room',
				validate({ params: z.object({ room: z.coerce.number() }) }),
				{
					message: () => {},
				},
			);
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
			expect(response.status).toBe(422);
			expect(await response.json()).toEqual({
				status: 422,
				detail: 'the params is invalid',
			});
		} finally {
			await app.stop(true);
		}
	});
});
