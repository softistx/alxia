import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia, responds, validate } from '@alxia/core';
import { z } from 'zod';
import { zq } from './coerce';

const app = alxia().get(
	'/search/:page',
	validate({
		params: z.object({ page: zq.int() }),
		query: z.object({
			tags: zq.array(z.string()).optional(),
			exact: zq.boolean().optional(),
			since: zq.date().optional(),
			filter: zq.json(z.object({ min: z.number() })).optional(),
		}),
	}),
	responds({
		200: z.object({
			page: z.number(),
			tags: z.array(z.string()),
			exact: z.boolean(),
			since: z.date().nullable(),
			min: z.number().nullable(),
		}),
	}),
	({ params, query, reply }) =>
		reply(200, {
			page: params.page,
			tags: query.tags ?? [],
			exact: query.exact ?? false,
			since: query.since ?? null,
			min: query.filter?.min ?? null,
		}),
);

describe('zq', () => {
	test('a query as a client sends it, read typed', async () => {
		const query = new URLSearchParams({
			tags: 'one',
			exact: 'true',
			since: new Date('2026-01-01T00:00:00Z').toISOString(),
			filter: JSON.stringify({ min: 3 }),
		});
		const result = await app.request(`/search/2?${query}`);
		expect(result.status).toBe(200);
		expect(await result.json()).toEqual({
			page: 2,
			tags: ['one'],
			exact: true,
			since: '2026-01-01T00:00:00.000Z',
			min: 3,
		});
	});

	test('a list given more than once, and refusals', async () => {
		const many = await app.request('/search/1?tags=a&tags=b&exact=0');
		expect(await many.json()).toMatchObject({ tags: ['a', 'b'], exact: false });
		expect((await app.request('/search/1.5')).status).toBe(400);
		expect((await app.request('/search/x')).status).toBe(400);
		expect((await app.request('/search/1?exact=maybe')).status).toBe(400);
		expect((await app.request('/search/1?filter={')).status).toBe(400);
	});

	test('a refusal says what was expected, not Invalid input', async () => {
		const messages = async (path: string) =>
			(
				(await (await app.request(path)).json()) as {
					issues: { message: string }[];
				}
			).issues.map((issue) => issue.message);
		expect(await messages('/search/x')).toEqual(['Expected a number']);
		expect(await messages('/search/1.5')).toEqual(['Expected an integer']);
		expect(await messages('/search/1?exact=maybe')).toEqual([
			'Expected true, false, 1 or 0',
		]);
		expect(await messages('/search/1?since=soon')).toEqual([
			'Expected an ISO 8601 date or date-time',
		]);
		expect(await messages('/search/1?filter={')).toEqual(['Expected JSON']);
		const ids = zq.array(zq.int());
		expect(ids.safeParse('x').error?.issues[0]?.message).toBe(
			'Expected a number',
		);
		const points = zq.array(z.object({ x: z.number() }));
		expect(
			points.safeParse([{ x: 'a' }]).error?.issues[0]?.message,
		).not.toContain('received array');
	});

	test('zq.json of an array is given as JSON text, since a query repeats a list', async () => {
		const list = alxia().get(
			'/ids',
			validate({ query: z.object({ ids: zq.json(z.array(z.number())) }) }),
			({ query, reply }) => reply(200, query.ids),
		);
		expectTypeOf<
			z.input<ReturnType<typeof zq.json<z.ZodArray<z.ZodNumber>>>>
		>().toEqualTypeOf<string>();
		const query = new URLSearchParams({ ids: JSON.stringify([1, 2]) });
		const result = await list.request(`/ids?${query}`);
		expect(await result.json()).toEqual([1, 2]);
	});

	test("a coercion's input is what a client means to send", () => {
		expectTypeOf<z.input<ReturnType<typeof zq.int>>>().toEqualTypeOf<
			string | number
		>();
		expectTypeOf<
			z.output<ReturnType<typeof zq.boolean>>
		>().toEqualTypeOf<boolean>();
		expectTypeOf<
			z.output<ReturnType<typeof zq.array<z.ZodString>>>
		>().toEqualTypeOf<string[]>();
	});
});
