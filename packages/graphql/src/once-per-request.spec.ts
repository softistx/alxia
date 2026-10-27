import { describe, expect, test } from 'bun:test';
import DataLoader from 'dataloader';
import { oncePerRequest } from './index';

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
