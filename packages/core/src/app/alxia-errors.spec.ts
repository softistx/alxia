/**
 * What an app answers beyond its routes' replies: the guards and errors of
 * its middlewares, a plugin's context, a reply its schema refuses.
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { HttpError } from '../errors/errors';
import { alxia } from './alxia';
import { responds } from './validate';

/** Runs `run` with `console.error` collected, not printed. */
async function quietly(run: (logged: unknown[]) => Promise<void>) {
	const original = console.error;
	const logged: unknown[] = [];
	console.error = (error: unknown) => logged.push(error);
	try {
		await run(logged);
	} finally {
		console.error = original;
	}
}

describe('middlewares', () => {
	const guarded = alxia()
		.get('/public', ({ reply }) => reply(200, 'open'))
		.derive(({ request, reply }) => {
			const token = request.headers.get('authorization');
			if (token !== 'Bearer ada') {
				return reply(401, { error: 'unauthenticated' as const });
			}
			return { user: 'ada' };
		})
		.get('/me', ({ user, reply }) => reply(200, { user }));

	test('a guard applies only to the routes after it', async () => {
		expect((await guarded.request('/public')).status).toBe(200);
		expect((await guarded.request('/me')).status).toBe(401);
	});

	test('what a middleware adds is in the context', async () => {
		const response = await guarded.request('/me', {
			headers: { authorization: 'Bearer ada' },
		});
		expect(await response.json()).toEqual({ user: 'ada' });
	});

	test('an error becomes a 500 that leaks nothing', async () => {
		const app = alxia().get('/boom', () => {
			throw new Error('boom');
		});
		await quietly(async (logged) => {
			const response = await app.request('/boom');
			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({ error: 'internal' });
			expect(logged).toHaveLength(1);
		});
	});

	test('an HttpError is answered as it says, a try/catch middleware first', async () => {
		const failing = alxia()
			.use(async ({ reply }, next) => {
				try {
					return await next();
				} catch (error) {
					if (error instanceof RangeError)
						return reply(422, { error: 'range' });
					throw error;
				}
			})
			.get('/range', () => {
				throw new RangeError();
			})
			.get('/teapot', () => {
				throw new HttpError(418, { error: 'teapot' });
			});
		expect((await failing.request('/range')).status).toBe(422);
		const teapot = await failing.request('/teapot');
		expect(teapot.status).toBe(418);
		expect(await teapot.json()).toEqual({ error: 'teapot' });
	});
});

describe('plugins', () => {
	const auth = alxia().derive(() => ({ user: 'ada' }));
	const posts = alxia({ prefix: '/posts' }).get('/:id', ({ params, reply }) =>
		reply(200, { id: params.id }),
	);
	const composed = alxia({ prefix: '/api' })
		.plugin(auth)
		.plugin(posts)
		.get('/me', ({ user, reply }) => reply(200, user));

	test("a plugin's routes are mounted under the app's prefix", async () => {
		const response = await composed.request('/api/posts/7');
		expect(await response.json()).toEqual({ id: '7' });
	});

	test("a plugin's middlewares apply to the routes after it", async () => {
		expect(await (await composed.request('/api/me')).text()).toBe('ada');
	});
});

describe('responses', () => {
	test('a reply that breaks its schema is a 500', async () => {
		const broken = alxia().get(
			'/broken',
			responds({ 200: z.object({ n: z.number() }) }),
			({ reply }) => reply(200, JSON.parse('{"n":"x"}')),
		);
		await quietly(async () => {
			expect((await broken.request('/broken')).status).toBe(500);
		});
	});

	test('a reply with a status the route does not declare names the route', async () => {
		const app = alxia().get('/u', responds({ 200: z.string() }), ({ reply }) =>
			reply(201 as 200, 'made'),
		);
		await quietly(async (logged) => {
			expect((await app.request('/u')).status).toBe(500);
			expect(String(logged[0])).toBe(
				'ResponseValidationError: GET /u declares no 201 reply',
			);
		});
	});

	test('a redirect needs no schema', async () => {
		const moved = alxia().get(
			'/old',
			responds({ 200: z.string() }),
			({ redirect }) => redirect('/new', 301),
		);
		const response = await moved.request('/old');
		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe('/new');
	});
});
