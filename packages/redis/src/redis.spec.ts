import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { defineCache } from '@nxgt/redis';
import { z } from 'zod';
import { useRedis } from '../test/server';
import { redis } from './context';

const db = useRedis();

describe('redis', () => {
	const User = z.object({ id: z.string(), name: z.string() });
	const users = defineCache({
		name: 'user',
		key: (id: string) => id,
		ttl: 60,
		schema: User,
	});

	test('caches and a lock in the context, typed', async () => {
		let loads = 0;
		const app = alxia()
			.plugin(redis(db.client, { caches: { users } }))
			.get('/users/:id', async ({ caches, lock, params, reply }) => {
				const user = await caches.users.remember(params.id, () => {
					loads++;
					return { id: params.id, name: 'Ada' };
				});
				expectTypeOf(user).toEqualTypeOf<{ id: string; name: string }>();
				const locked = await lock(`user:${params.id}`, () => 'locked');
				return reply(200, { ...user, locked });
			});
		await app.request('/users/1');
		const second = await app.request('/users/1');
		expect(await second.json()).toEqual({
			id: '1',
			name: 'Ada',
			locked: 'locked',
		});
		expect(loads).toBe(1);
	});
});

describe('redisCacheStore', () => {
	test('two apps share kept responses, and forget them by tag', async () => {
		const { cache } = await import('@alxia/cache');
		const { redisCacheStore } = await import('./cache-store');
		let runs = 0;
		const make = () => {
			const products = cache({
				ttl: 60,
				store: redisCacheStore(db.client, { name: 'shop' }),
				tags: () => ['products'],
			});
			return {
				products,
				app: alxia()
					.plugin(products)
					.get('/products', ({ reply }) => reply(200, { runs: ++runs })),
			};
		};
		const one = make();
		const two = make();
		await one.app.request('/products');
		const shared = await two.app.request('/products');
		expect(shared.headers.get('x-cache')).toBe('HIT');
		expect(await shared.json()).toEqual({ runs: 1 });
		await two.products.invalidateTag('products');
		expect(await (await one.app.request('/products')).json()).toEqual({
			runs: 2,
		});
	});

	test('with redis(): ctx.cache and ctx.caches; invalidate(path) forgets every variant', async () => {
		const { cache } = await import('@alxia/cache');
		const { redisCacheStore } = await import('./cache-store');
		const pages = cache({
			ttl: 60,
			vary: ['accept-language'],
			store: redisCacheStore(db.client, { name: 'pages' }),
		});
		const app = alxia()
			.plugin(
				redis(db.client, {
					caches: {
						greetings: defineCache({
							name: 'greeting',
							key: (id: string) => id,
							ttl: 60,
							schema: z.string(),
						}),
					},
				}),
			)
			.plugin(pages)
			.get('/hello', ({ cache: controls, caches, request, reply }) => {
				expectTypeOf(controls.tag).toBeFunction();
				expectTypeOf(caches.greetings.remember).toBeFunction();
				controls.tag('hello');
				return reply.ok(request.headers.get('accept-language') ?? '-');
			});
		const ask = (language: string) =>
			app.request('/hello', { headers: { 'accept-language': language } });
		await ask('fr');
		await ask('en');
		expect((await ask('fr')).headers.get('x-cache')).toBe('HIT');
		await pages.invalidate('/hello');
		expect((await ask('fr')).headers.get('x-cache')).toBe('MISS');
		expect((await ask('en')).headers.get('x-cache')).toBe('MISS');
	});

	test('a tag lives as long as its longest-kept response', async () => {
		const { redisCacheStore } = await import('./cache-store');
		const store = redisCacheStore(db.client, { name: 'shop' });
		const value = {
			status: 200,
			headers: [],
			body: new Uint8Array(),
			storedAt: Date.now(),
			ttl: 0,
			stale: 0,
			tags: ['products'],
		};
		const ttl = () => db.client.send('TTL', ['shop:tag:products']);
		await store.set('/a', value, 60_000);
		expect(await ttl()).toBeWithin(55, 61);
		await store.set('/b', value, 600_000);
		expect(await ttl()).toBeWithin(595, 601);
		await store.set('/c', value, 30_000);
		expect(await ttl()).toBeWithin(595, 601);
	});
});
