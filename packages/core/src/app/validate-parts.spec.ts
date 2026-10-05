import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';
import { validate } from './validate';

describe('validate, given twice', () => {
	test("checks the request's cookies each time, never the first one's output", async () => {
		// Its output, `#7`, is no input it takes: checked again, it would refuse.
		const Session = z.object({
			n: z
				.string()
				.regex(/^\d+$/)
				.transform((n) => `#${n}`),
		});
		const app = alxia().get(
			'/',
			validate({ cookies: Session }),
			validate({ cookies: Session }),
			({ cookies, reply }) => reply(200, { n: cookies.n }),
		);
		const response = await app.request('/', { headers: { cookie: 'n=7' } });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ n: '#7' });
	});
});

// Typed apart: a route types its `body` as `undefined` until it validates one.
describe('what a middleware of use() passes next()', () => {
	const addsBody = defineMiddleware((_ctx, next) => next({ body: 'from use' }));

	test('reaches a route with no middleware and no schema', async () => {
		const app = (
			alxia().use(addsBody) as unknown as ReturnType<typeof alxia>
		).get('/', ({ body, reply }) => reply(200, { body: body as unknown }));
		expect(await (await app.request('/')).json()).toEqual({
			body: 'from use',
		});
	});

	test('stays beside the parts a validate reads', async () => {
		const scoped = alxia().use(addsBody) as unknown as ReturnType<typeof alxia>;
		const app = scoped.get(
			'/:id',
			validate({ params: z.object({ id: z.coerce.number() }) }),
			({ body, params, reply }) =>
				reply(200, { body: body as unknown, params }),
		);
		expect(await (await app.request('/3')).json()).toEqual({
			body: 'from use',
			params: { id: 3 },
		});
	});
});

describe('a validate of another copy of @alxia/core', () => {
	// What that copy's validate() is: a function marked by the same global symbol.
	const Query = z.object({ page: z.coerce.number() });
	const foreign = Object.defineProperty(() => {}, Symbol.for('alxia.builtin'), {
		value: { kind: 'validate', schemas: { query: Query } },
	});

	test('is recognised on a route, and refused by use()', async () => {
		const app = alxia().get('/', foreign as never, ({ reply }) =>
			reply(200, 'ok'),
		);
		expect((await app.request('/?page=x')).status).toBe(400);
		expect((await app.request('/?page=2')).status).toBe(200);
		expect(() => alxia().use(foreign as never)).toThrow(
			'use(): argument 1 is a validate() or responds(), which belongs to a route',
		);
	});
});
