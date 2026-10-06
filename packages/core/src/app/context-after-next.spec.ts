import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';
import { validate } from './validate';

/**
 * One context per request: a middleware that reads `ctx` again once
 * `next()` settled reads the object the steps after it added to. What it
 * destructured before `next()` is what it was given. Its type names
 * neither: `scope` is reached here through a cast alone.
 */
const inner = defineMiddleware((_ctx, next) => next({ scope: 'inner' }));
const Cookies = z.object({ n: z.coerce.number() });

function outer(seen: unknown[]) {
	return defineMiddleware(async (ctx, next) => {
		const { cookies } = ctx;
		const response = await next();
		seen.push((ctx as { scope?: unknown }).scope, cookies, ctx.cookies);
		return response;
	});
}

describe('a middleware reading its context after next()', () => {
	test('reads what the steps after it added, a validate of the cookies or not', async () => {
		for (const validated of [false, true]) {
			const seen: unknown[] = [];
			const app = validated
				? alxia().get(
						'/',
						outer(seen),
						validate({ cookies: Cookies }),
						inner,
						({ reply }) => reply(200, 'ok'),
					)
				: alxia().get('/', outer(seen), inner, ({ reply }) => reply(200, 'ok'));
			await app.request('/', { headers: { cookie: 'n=2' } });
			expect(seen).toEqual(['inner', { n: '2' }, { n: '2' }]);
		}
	});

	test('keeps the cookies as they arrived, after a validate of them', async () => {
		const seen: unknown[] = [];
		const app = alxia().get(
			'/',
			outer(seen),
			validate({ cookies: Cookies }),
			({ cookies, reply }) => reply(200, { n: cookies.n }),
		);
		const response = await app.request('/', { headers: { cookie: 'n=2' } });
		expect(await response.json()).toEqual({ n: 2 });
		expect(seen.slice(1)).toEqual([{ n: '2' }, { n: '2' }]);
	});
});
