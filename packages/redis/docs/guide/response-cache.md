# Response cache

This page covers `redisCacheStore`: an
[`@alxia/cache`](https://www.npmjs.com/package/@alxia/cache) store that
every process sharing a Redis serves from, and invalidates together.

```ts
import { cache } from '@alxia/cache';
import { alxia } from '@alxia/core';
import { redisCacheStore } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

const products = cache({ ttl: 60, store: redisCacheStore(connection.client, { name: 'shop' }), tags: () => ['products'] });

const app = alxia()
	.use(products)
	.get('/products', ({ reply }) => reply(200, [{ id: '1', name: 'Kettle' }]));
```

`@alxia/cache` is an optional peer: install it beside this package to use
`redisCacheStore`.

```sh
bun add @alxia/cache
```

## The signature

```ts
function redisCacheStore(client: RedisClient, options: RedisCacheStoreOptions): CacheStore;

interface RedisCacheStoreOptions {
	/** Prepended to every key it writes: one name per app or deployment. */
	readonly name: string;
}
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `name` | `string` | required | the prefix of every key: `<name>:response:<key>` for a response, `<name>:tag:<tag>` for a tag |

Everything else — `ttl`, `staleWhileRevalidate`, `key`, `vary`, `statuses`,
`tags` — is `cache()`'s, and behaves as with the memory store: see
`@alxia/cache`'s guide.

## What it stores

- **A response** is one Redis string at `<name>:response:<key>`: an
  `@nxgt/redis` cache record holding the status, the headers, the body as
  base64, and the plugin's `storedAt`, `ttl` and `stale`. Redis expires it
  when `ttl + staleWhileRevalidate` has passed, rounded up to the second.
- **A tag** is a Redis set at `<name>:tag:<tag>`, of the response keys it
  names. Besides your tags, every response carries `alxia:path:<path>` —
  the tag `invalidate(path)` deletes. It expires with the longest-kept response it names: each `set`
  gives a new tag set its expiry, and only ever lengthens it after that.
  On a Redis older than 7, which cannot compare expiries, the last
  response written sets it.
- **Reading** checks the record against its schema: a record that no
  longer reads as a response — written by another version, or by hand — is
  a miss, and is deleted.

Measured with `cache({ ttl: 2, tags: () => ['products'] })` after one
`GET /products`:

```text
shop:response:/products            string   TTL 2
shop:tag:alxia:path:/products      set      TTL 2
shop:tag:products                  set      TTL 2
```

## Invalidating across processes

`invalidate(path)` and `invalidateTag(tag)` delete from Redis, so every
process sharing it misses on its next request:

```ts
import { cache } from '@alxia/cache';
import { alxia } from '@alxia/core';
import { redisCacheStore } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';
import { z } from 'zod';

const connection = await connectRedis(Bun.env['REDIS_URL']!);
const Product = z.object({ id: z.string(), name: z.string() });
const catalogue = new Map<string, z.infer<typeof Product>>();

const store = redisCacheStore(connection.client, { name: 'shop' });
const products = cache({ ttl: 60, staleWhileRevalidate: 300, store, tags: () => ['products'] });

const app = alxia()
	.post('/products', { body: Product }, async ({ body, reply }) => {
		catalogue.set(body.id, body);
		await products.invalidateTag('products');      // forgotten in every process
		return reply(201, body);
	})
	.use(products)
	.get('/products', ({ reply }) => reply(200, [...catalogue.values()]));
```

`invalidateTag` reads the tag's set, deletes every key in it, then the set.
`invalidate(path)` does the same with the path's tag, so it forgets every
response kept for that path — each `vary` value, a `key` of your own:

```ts
await products.invalidate('/products');          // every language, every key, in every process
await products.invalidate('/products?page=2');   // another path: its query is part of it
```

Two `cache()` given stores with the same `name` share responses and tags;
give each app or deployment its own `name`.

## What changes with Redis

- **Concurrent misses** run the route once per process, not once overall:
  `@alxia/cache` coalesces them in memory.
- **A Redis that does not answer costs the cache, not the response.** A
  read that fails is a miss, so the route runs; a write that fails keeps
  nothing; the first error of an outage is logged with `console.error`. `invalidate` and
  `invalidateTag` do reject, so a write that empties the cache learns that
  it could not — see `@alxia/cache`'s
  [Stores](https://github.com/softistx/alxia/blob/develop/packages/cache/docs/guide/stores.md#when-the-store-cannot-answer).

## Next

- [Caches and locks](caches-and-locks.md) — `redis()` adds typed caches to
  the context, as `caches`, beside this one's `cache`.
- [Testing](testing.md).
