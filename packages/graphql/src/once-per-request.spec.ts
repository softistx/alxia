import { describe, expect, test } from 'bun:test';
import DataLoader from 'dataloader';
import { clearRequestCache, freshPerMutation, oncePerRequest } from './index';

describe('oncePerRequest', () => {
	test('loads a key once per request and returns the same value', () => {
		const request = {};
		let calls = 0;
		const load = () => ({ n: ++calls });
		const first = oncePerRequest(request, 'categories', load);
		expect(oncePerRequest(request, 'categories', load)).toBe(first);
		expect(calls).toBe(1);
	});

	test('keeps a falsy value', () => {
		const request = {};
		let calls = 0;
		const load = () => {
			calls++;
			return undefined;
		};
		oncePerRequest(request, 'k', load);
		oncePerRequest(request, 'k', load);
		expect(calls).toBe(1);
	});

	test('separates keys and requests', () => {
		const a = {};
		const b = {};
		expect(oncePerRequest(a, 'x', () => 1)).toBe(1);
		expect(oncePerRequest(a, 'y', () => 2)).toBe(2);
		expect(oncePerRequest(b, 'x', () => 3)).toBe(3);
		expect(oncePerRequest(a, 'x', () => 99)).toBe(1);
	});

	test('does not cache a throw or a rejection', async () => {
		const request = {};
		expect(() =>
			oncePerRequest(request, 'k', () => {
				throw new Error('boom');
			}),
		).toThrow('boom');
		expect(oncePerRequest(request, 'k', () => 'ok')).toBe('ok');
		await expect(
			oncePerRequest(request, 'p', () => Promise.reject(new Error('no'))),
		).rejects.toThrow('no');
		expect(await oncePerRequest(request, 'p', async () => 'ok')).toBe('ok');
	});

	test('shares one in-flight promise', async () => {
		const request = {};
		let calls = 0;
		const load = async () => ++calls;
		const [x, y] = await Promise.all([
			oncePerRequest(request, 'k', load),
			oncePerRequest(request, 'k', load),
		]);
		expect([x, y, calls]).toEqual([1, 1, 1]);
	});

	test('one DataLoader per request and key batches the loads', async () => {
		const batches: (readonly number[])[] = [];
		const loader = (request: object) =>
			oncePerRequest(
				request,
				'categories',
				() =>
					new DataLoader(async (ids: readonly number[]) => {
						batches.push(ids);
						return ids.map((id) => `c${id}`);
					}),
			);
		const request = {};
		const names = await Promise.all(
			[1, 2, 1].map((id) => loader(request).load(id)),
		);
		expect(names).toEqual(['c1', 'c2', 'c1']);
		expect(batches).toEqual([[1, 2]]);
		await loader({}).load(1);
		expect(batches.length).toBe(2);
	});
});

describe('clearRequestCache', () => {
	test('the next call loads again, other requests are kept', () => {
		const a = {};
		const b = {};
		let calls = 0;
		oncePerRequest(a, 'k', () => ++calls);
		oncePerRequest(b, 'k', () => ++calls);
		clearRequestCache(a);
		expect(oncePerRequest(a, 'k', () => ++calls)).toBe(3);
		expect(oncePerRequest(b, 'k', () => ++calls)).toBe(2);
	});

	test('does nothing for a request with no cache', () => {
		expect(() => clearRequestCache({})).not.toThrow();
	});
});

describe('freshPerMutation', () => {
	const build = () => {
		let name = 'A';
		let reads = 0;
		const read = (ctx: object) =>
			oncePerRequest(ctx, 'department', () => {
				reads++;
				return name;
			});
		const resolvers = freshPerMutation({
			Query: {
				department: (_p: unknown, _a: unknown, ctx: object) => read(ctx),
			},
			Mutation: {
				rename: (_p: unknown, a: { name: string }) => {
					name = a.name;
					return true;
				},
				ward: (_p: unknown, _a: unknown, ctx: object) => ({ ctx }),
				constant: 'x',
			},
			Ward: { department: (w: { ctx: object }) => read(w.ctx) },
		});
		return { resolvers, read, reads: () => reads };
	};
	const call = (f: unknown, ...a: unknown[]) =>
		(f as (...x: unknown[]) => unknown)(...a);

	test('each root mutation field starts empty, its sub-fields share', () => {
		const { resolvers, read, reads } = build();
		const ctx = {};
		expect(read(ctx)).toBe('A');
		call(resolvers.Mutation.rename, {}, { name: 'B' }, ctx, {});
		const ward = call(resolvers.Mutation.ward, {}, {}, ctx, {}) as {
			ctx: object;
		};
		expect(call(resolvers.Ward.department, ward)).toBe('B');
		expect(call(resolvers.Ward.department, ward)).toBe('B');
		expect(reads()).toBe(2);
	});

	test('a query keeps one cache for the request', () => {
		const { resolvers, reads } = build();
		const ctx = {};
		call(resolvers.Query.department, {}, {}, ctx, {});
		call(resolvers.Query.department, {}, {}, ctx, {});
		expect(reads()).toBe(1);
	});

	test('leaves other types and non-function fields alone, and passes the result through', () => {
		const { resolvers } = build();
		expect(resolvers.Mutation.constant).toBe('x');
		expect(call(resolvers.Mutation.rename, {}, { name: 'C' }, {}, {})).toBe(
			true,
		);
		expect(freshPerMutation({ Query: {} })).toEqual({ Query: {} });
	});

	test('passes a promise through and tolerates a non-object context', async () => {
		const resolvers = freshPerMutation({
			Mutation: { go: async () => 'done' },
		});
		const go = resolvers.Mutation.go as (...a: unknown[]) => Promise<string>;
		expect(await go({}, {}, {}, {})).toBe('done');
		expect(await go({}, {}, undefined, {})).toBe('done');
	});
});
