import { beforeAll, describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia, validate } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import { defineCache } from '@nxgt/redis';
import { z } from 'zod';
import { useRedis } from '../test/server';
import { redis } from './context';
import { idempotency } from './idempotency';
import { redisStore } from './store';

const db = useRedis();

describe('redisStore', () => {
	test('two apps sharing a Redis share a count, 429 and all', async () => {
		const make = () =>
			alxia({ ip: () => '1.2.3.4' })
				.plugin(
					rateLimit({
						limit: 2,
						windowMs: 60_000,
						store: redisStore(db.client, { name: 'api' }),
					}),
				)
				.get('/', ({ reply }) => reply(200, 'ok'));
		const [one, two] = [make(), make()];
		expect((await one.request('/')).status).toBe(200);
		expect((await two.request('/')).status).toBe(200);
		const third = await one.request('/');
		expect(third.status).toBe(429);
		expect((await third.json()).retryAfter).toBeGreaterThan(0);
		expect(third.headers.get('ratelimit-remaining')).toBe('0');
	});

	test('reset forgets a key', async () => {
		const store = redisStore(db.client, { name: 'reset' });
		const policy = { limit: 1, windowMs: 60_000 };
		expect((await store.consume('k', policy)).allowed).toBe(true);
		expect((await store.consume('k', policy)).allowed).toBe(false);
		await store.reset('k');
		expect((await store.consume('k', policy)).allowed).toBe(true);
	});

	test('reset forgets a key counted by another store, or another process', async () => {
		const policy = { limit: 1, windowMs: 60_000 };
		const counting = redisStore(db.client, { name: 'shared' });
		expect((await counting.consume('k', policy)).allowed).toBe(true);
		expect((await counting.consume('k', policy)).allowed).toBe(false);
		await redisStore(db.client, { name: 'shared' }).reset('k');
		expect((await counting.consume('k', policy)).allowed).toBe(true);
	});

	test('reset skips what it did not record under the name', async () => {
		const store = redisStore(db.client, { name: 'odd' });
		const policy = { limit: 1, windowMs: 60_000 };
		await store.consume('k', policy);
		await db.client.send('SADD', ['odd:policies', 'a/b', '0/1000', '1/2/3']);
		await store.reset('k');
		expect((await store.consume('k', policy)).allowed).toBe(true);
		expect(
			((await db.client.send('SMEMBERS', ['odd:policies'])) as string[]).sort(),
		).toEqual(['0/1000', '1/2/3', '1/60000', 'a/b']);
	});
});

let runs = 0;
const makeApp = () =>
	alxia({ ip: () => '1.2.3.4' })
		.post('/open', ({ reply }) => reply(201, ++runs))
		.use(idempotency(db.client, { name: 'payments' }))
		.post(
			'/payments',
			validate({ body: z.object({ amount: z.number() }) }),
			async ({ body, reply, set }) => {
				runs++;
				set.cookies.set('seen', 'yes');
				await Bun.sleep(40);
				return reply(201, { id: runs, amount: body.amount });
			},
		)
		.post('/fails', () => {
			throw new Error('down');
		});

describe('idempotency', () => {
	// Built once Redis is up: a plugin binds its client when it is made.
	let app: ReturnType<typeof makeApp>;
	beforeAll(() => {
		app = makeApp();
	});

	const pay = (key: string | undefined, amount = 10) =>
		app.request('/payments', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(key === undefined ? {} : { 'idempotency-key': key }),
			},
			body: JSON.stringify({ amount }),
		});

	test('a key runs once; a repeat replays the first response', async () => {
		runs = 0;
		const first = await pay('k-1');
		const again = await pay('k-1');
		expect(first.status).toBe(201);
		expect(await again.json()).toEqual({ id: 1, amount: 10 });
		expect(again.headers.get('idempotent-replayed')).toBe('true');
		expect(again.headers.get('set-cookie')).toBeNull();
		expect(runs).toBe(1);
		await pay(undefined);
		expect(runs).toBe(2);
	});

	test('a repeat while the first runs is a 409; another request with the key a 422', async () => {
		const [first, concurrent] = await Promise.all([pay('k-2'), pay('k-2')]);
		expect([first.status, concurrent.status].sort()).toEqual([201, 409]);
		const reused = await pay('k-2', 99);
		expect(reused.status).toBe(422);
		expect(await reused.json()).toEqual({ error: 'idempotency_key_reused' });
	});

	test('a 5xx is not kept: the key is free again', async () => {
		const original = console.error;
		console.error = () => {};
		try {
			const call = () =>
				app.request('/fails', {
					method: 'POST',
					headers: { 'idempotency-key': 'k-3' },
				});
			expect((await call()).status).toBe(500);
			expect((await call()).headers.get('idempotent-replayed')).toBeNull();
		} finally {
			console.error = original;
		}
	});
});

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
