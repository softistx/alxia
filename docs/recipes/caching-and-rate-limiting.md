# Caching and rate limiting with Redis

**The problem.** The app runs as several processes behind a load balancer,
and two things must hold across all of them: a client has one allowance, not
one per process, and a response cached by one process is forgotten by every
process when the data changes. Added to that, a value expensive to load is
loaded once, not by each request that misses it, and a periodic job runs on
one process at a time.

[`@alxia/redis`](../../packages/redis) answers each with the stores that
[`@alxia/rate-limit`](../../packages/rate-limit) and
[`@alxia/cache`](../../packages/cache) already take: the plugin never knows
which store it was given, so you can start with the in-memory defaults and
switch by one option. Everything runs on Bun's own Redis client, through
[`@nxgt/redis`](https://www.npmjs.com/package/@nxgt/redis) 0.5.

```sh
bun add @alxia/core @alxia/rate-limit @alxia/cache @alxia/redis @nxgt/redis zod
```

## One handle for the deployment

Open Redis once with `@nxgt/redis`, and hand the **handle** to every export
that takes a client. `prefix` goes in front of every key of the deployment
(`shop:api:…`, `shop:pages:…`, `lock:shop:…`), so two apps share a Redis
without meeting, and the handle is closed with the app. The typed caches are
declared on it.

```ts
// file: src/redis.ts
import { defineCache, defineRedis, openRedis } from '@nxgt/redis';
import { z } from 'zod';

export const User = z.object({ id: z.string(), name: z.string() });

// A value cached under `shop:user:<id>` for 5 minutes, checked by User when read.
const users = defineCache({ name: 'user', key: (id: string) => id, ttl: 300, schema: User });

export const open = (uri: string, prefix: string) => openRedis(defineRedis({ uri, prefix, caches: { users } }));

export type Handle = Awaited<ReturnType<typeof open>>;
```

## The app

```ts
// file: src/app.ts
import { cache } from '@alxia/cache';
import { alxia, health, validate } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import { redis, redisCacheStore, redisCheck, redisStore } from '@alxia/redis';
import { z } from 'zod';
import type { Handle } from './redis';

const catalogue = new Map<string, { id: string; name: string }>(); // your database

export const createApp = (handle: Handle) => {
	// Cached responses, in Redis: every process serves, and forgets, the same ones.
	const products = cache({
		ttl: 60,
		staleWhileRevalidate: 300, // then, for 5 minutes, answered at once while one request refreshes
		store: redisCacheStore(handle, { name: 'pages' }),
		tags: () => ['products'],
	});

	return (
		alxia({ ip: (request) => request.headers.get('x-real-ip') ?? undefined }) // behind a proxy: its header
			// The probes first: they are not rate limited, and /ready says whether Redis answers.
			.plugin(health({ checks: { redis: redisCheck(handle) } }))
			.plugin(redis(handle)) // `caches`, `lock`, `redis` in the context; closes the handle on stop
			// 100 requests a minute per client address, counted in Redis (GCRA, the server's clock).
			.use(rateLimit({ limit: 100, windowMs: 60_000, store: redisStore(handle, { name: 'api' }) }))
			.post('/products', validate({ body: z.object({ id: z.string(), name: z.string() }) }), async ({ body, reply }) => {
				catalogue.set(body.id, body);
				await products.invalidateTag('products'); // forgotten in every process
				return reply(201, body);
			})
			.use(products) // the GETs after it are cached
			.get('/products', ({ reply }) => reply(200, [...catalogue.values()]))
			// A value loaded once, however many requests miss it at the same moment.
			.get('/users/:id', async ({ caches, params, reply }) => {
				const user = await caches.users.remember(params.id, async () => ({ id: params.id, name: `User ${params.id}` }));
				return reply(200, user); // typed by User
			})
			// A job that must not run twice at once, across processes.
			.post('/reindex', async ({ lock, reply }) => reply(202, await lock('reindex', async () => 'done')))
	);
};
```

`rateLimit` counts every request it runs on, so it stands after `health()`
and before the routes it limits. A client past its allowance gets a 429 with
`Retry-After` and `RateLimit-*` headers. A refused request counts nothing,
and a Redis that does not answer costs the cache (the route runs, the error is
logged), not the response.

```ts
// file: src/server.ts
import { createApp } from './app';
import { open } from './redis';

const handle = await open(Bun.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379', 'shop');
createApp(handle).listen({ port: Number(Bun.env['PORT'] ?? 3000) }); // stop closes the handle
```

## Test it against a real Redis

There is no in-memory fake: the stores run Lua scripts and read the Redis
server's clock. Point `REDIS_URL` at a disposable Redis. Each test opens its
own handle with **its own prefix**, so tests never see each other's keys:

```sh
docker run -d --rm --name redis-test -p 6379:6379 redis:8-alpine
REDIS_URL=redis://127.0.0.1:6379 bun test
```

```ts
// file: src/app.spec.ts
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createApp } from './app';
import { type Handle, open } from './redis';

const uri = Bun.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379';
let handle: Handle;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
	handle = await open(uri, `test-${crypto.randomUUID()}`); // a prefix of its own
	app = createApp(handle);
});
afterEach(() => handle.close());

const get = (path: string, client = '10.0.0.1') => app.request(path, { headers: { 'x-real-ip': client } });

test('a response is cached, and forgotten when the data changes', async () => {
	expect((await get('/products')).headers.get('x-cache')).toBe('MISS');
	expect((await get('/products')).headers.get('x-cache')).toBe('HIT');
	await app.request('/products', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-real-ip': '10.0.0.1' },
		body: JSON.stringify({ id: '1', name: 'Kettle' }),
	});
	const again = await get('/products');
	expect(again.headers.get('x-cache')).toBe('MISS'); // the tag was invalidated
	expect(await again.json()).toContainEqual({ id: '1', name: 'Kettle' });
});

test('the allowance is the client address, counted in Redis', async () => {
	const statuses: number[] = [];
	for (let i = 0; i < 101; i++) statuses.push((await get('/users/1')).status);
	expect(statuses.at(-1)).toBe(429);
	expect((await get('/users/1', '10.0.0.2')).status).toBe(200); // another client
	expect((await get('/ready')).status).toBe(200); // the probes are not limited
});

test('two apps on one Redis share a count', async () => {
	const other = createApp(handle); // as another process would
	for (let i = 0; i < 100; i++) await get('/users/2', '10.0.0.3');
	const refused = await other.request('/users/2', { headers: { 'x-real-ip': '10.0.0.3' } });
	expect(refused.status).toBe(429);
	expect(refused.headers.get('retry-after')).not.toBeNull();
});

test('a value is loaded once, and the key carries the prefix', async () => {
	await get('/users/9');
	expect(await handle.cache.users.get('9')).toEqual({ id: '9', name: 'User 9' });
});
```

## What to cache, and what not to

- A response cache keeps `GET` and `HEAD` for the routes after it. A request
  with an `Authorization` header or a cookie is **not kept** unless the
  response says `public`, or you give `vary` or a `key` that tells users
  apart: `cache({ ttl: 60, key: ({ url, user }) => ... })`.
- A tag is a Redis set of the keys it names: `cache.tag('product:1')` in a
  handler, `invalidateTag('product:1')` after a write.
- Put a 429-able limit **before** `idempotency` and before the cache; a
  guard before them, or the refusal is kept and replayed.
- A POST that must run once per client retry is
  [idempotent](../../packages/redis/docs/guide/idempotency.md): `Idempotency-Key`.

## Reference

- [Connecting](../../packages/redis/docs/guide/connecting.md) and the
  [`@nxgt/redis` handle](../../packages/redis/README.md#with-nxgtredis)
- [Rate limits](../../packages/redis/docs/guide/rate-limits.md),
  [the response cache](../../packages/redis/docs/guide/response-cache.md),
  [caches and locks](../../packages/redis/docs/guide/caches-and-locks.md),
  [idempotency](../../packages/redis/docs/guide/idempotency.md),
  [testing](../../packages/redis/docs/guide/testing.md)
- [`@alxia/rate-limit`](../../packages/rate-limit) and
  [`@alxia/cache`](../../packages/cache): options, headers, keys, tags
- [Health and graceful shutdown](health-and-shutdown.md): `redisCheck` in `/ready`
- [`@alxia/redis` troubleshooting](../../packages/redis/docs/troubleshooting.md)
