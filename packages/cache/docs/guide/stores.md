# Stores

This page covers where responses are kept: the memory store and its
limits, the Redis store from `@alxia/redis`, and writing a store of your
own.

```ts
import { alxia } from '@alxia/core';
import { cache, MemoryCacheStore } from '@alxia/cache';

const store = new MemoryCacheStore({ maxEntries: 5_000, maxBytes: 128 * 1024 * 1024 });

const app = alxia()
	.plugin(cache({ ttl: 60, store }))
	.get('/products', ({ reply }) => reply(200, []));
```

The plugin does not know which store it was given: every store answers the
same `CacheStore` contract, and freshness — `ttl`, `staleWhileRevalidate` —
is decided by the plugin, not the store.

## In memory: `MemoryCacheStore`

```ts
new MemoryCacheStore(options?: MemoryCacheOptions)
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `maxEntries` | `number` | `1_000` | the most responses kept |
| `maxBytes` | `number` | `64 * 1024 * 1024` (64 MiB) | the most bytes of bodies kept; headers are not counted |

Past either limit, the **least recently read** response goes first: reading
a response moves it to the back of the queue. A single body larger than
`maxBytes` is never kept, so its route answers `MISS` every time.

```ts
import { expect, test } from 'bun:test';
import { MemoryCacheStore } from '@alxia/cache';

const entry = (bytes: number) => ({
	status: 200,
	headers: [],
	body: new Uint8Array(bytes),
	storedAt: Date.now(),
	ttl: 1000,
	stale: 0,
	tags: [],
});

test('the least recently read goes first', () => {
	const store = new MemoryCacheStore({ maxEntries: 2 });
	store.set('a', entry(10), 1000);
	store.set('b', entry(10), 1000);
	store.get('a');                      // a is now the most recently read
	store.set('c', entry(10), 1000);     // b goes
	expect(store.get('b')).toBeUndefined();
	expect(store.get('a')).toBeDefined();
	expect(store.size).toBe(2);
});
```

`size` reads how many responses are kept. A response is dropped once
`ttl + staleWhileRevalidate` has passed, when it is next read.

The memory store is the default: each `cache()` without a `store` creates
its own. It is right for one process; with several, each keeps its own copy
and its own invalidations ([Invalidation](invalidation.md#across-processes)).

## In Redis

`@alxia/redis` ships `redisCacheStore`, a `CacheStore` on `@nxgt/redis`:
every process sharing the Redis serves what one of them kept, and one
`invalidateTag` reaches them all.

```sh
bun add @alxia/redis @nxgt/redis @nxgt/redis-guard zod
```

```ts
import { cache } from '@alxia/cache';
import { redisCacheStore } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env.REDIS_URL!);

const products = cache({
	ttl: 60,
	staleWhileRevalidate: 300,
	store: redisCacheStore(connection.client, { name: 'shop' }),   // keys start with "shop:"
	tags: () => ['products'],
});
```

`name` is prepended to every key the store writes: one per app or
deployment sharing the Redis. See `@alxia/redis`'s README for its
connection and its other options.

Two things change with Redis:

- **Concurrent misses** run the route once per process, not once overall.
- **A Redis that is down** is a store that cannot answer: the routes still
  answer, uncached ([below](#when-the-store-cannot-answer)).

## Writing a store

A store implements four methods. Each may answer synchronously or with a
promise:

```ts
interface CacheStore {
	get(key: string): Promise<CachedResponse | undefined> | CachedResponse | undefined;
	/** Keeps `value` for `keepFor` milliseconds: its freshness and its staleness together. */
	set(key: string, value: CachedResponse, keepFor: number): Promise<void> | void;
	delete(key: string): Promise<void> | void;
	/** Forgets every response tagged `tag`. */
	deleteTag(tag: string): Promise<void> | void;
}

interface CachedResponse {
	readonly status: number;
	readonly headers: readonly (readonly [string, string])[];
	readonly body: Uint8Array;
	readonly storedAt: number;    // milliseconds since the epoch
	readonly ttl: number;         // milliseconds fresh, from storedAt
	readonly stale: number;       // milliseconds served stale after that
	readonly tags: readonly string[];
}
```

What the plugin relies on:

| Method | Must |
| --- | --- |
| `get` | return what `set` was given, or `undefined` — never `null` — when nothing is kept, or it expired |
| `set` | keep `value` under `key` for `keepFor` **milliseconds**, replacing what was there, and remember its `tags` — `invalidate(path)` relies on them too |
| `delete` | forget `key`; a key that is not there is not an error |
| `deleteTag` | forget every key whose response carries `tag` |

`get` need not check freshness: the plugin reads `storedAt`, `ttl` and
`stale` itself. Expiring at `keepFor` only bounds what the store holds.

A store over any key-value service — here a plain `Map`, standing in for
one that serialises — looks like this:

```ts
import type { CachedResponse, CacheStore } from '@alxia/cache';

interface Row {
	value: CachedResponse;
	expiresAt: number;
}

export function mapCacheStore(): CacheStore {
	const rows = new Map<string, Row>();
	const tags = new Map<string, Set<string>>();

	return {
		get(key) {
			const row = rows.get(key);
			if (row === undefined || row.expiresAt <= Date.now()) return undefined;
			return row.value;
		},
		set(key, value, keepFor) {
			rows.set(key, { value, expiresAt: Date.now() + keepFor });
			for (const tag of value.tags) {
				const keys = tags.get(tag) ?? new Set<string>();
				keys.add(key);
				tags.set(tag, keys);
			}
		},
		delete(key) {
			rows.delete(key);
		},
		deleteTag(tag) {
			for (const key of tags.get(tag) ?? []) rows.delete(key);
			tags.delete(tag);
		},
	};
}
```

A service that stores text keeps `body` as base64 and `headers` as an array
of pairs, and rebuilds the `Uint8Array` on `get` — as `redisCacheStore`
does.

Every kept response carries, among its `tags`, the tag of its path —
`alxia:path:/products?page=2`, built by `pathTag` — and `invalidate(path)`
is `deleteTag` of it. A store that drops `tags` leaves `invalidate` and
`invalidateTag` reaching nothing.

### Testing a store

The plugin's own behaviour is the best test of a store: run an app on it.

```ts
import { expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';
import { mapCacheStore } from './map-cache-store';

test('the store serves, and forgets by tag and by path', async () => {
	let runs = 0;
	const products = cache({ ttl: 60, store: mapCacheStore(), tags: () => ['products'] });
	const app = alxia()
		.plugin(products)
		.get('/products', ({ reply }) => reply.ok({ runs: ++runs }));

	await app.request('/products');
	expect((await app.request('/products')).headers.get('x-cache')).toBe('HIT');

	await products.invalidateTag('products');
	expect((await app.request('/products')).headers.get('x-cache')).toBe('MISS');

	await products.invalidate('/products');                 // the path's tag: kept by `set` too
	expect((await app.request('/products')).headers.get('x-cache')).toBe('MISS');
	expect(runs).toBe(3);
});
```

## When the store cannot answer

A store that throws or rejects costs the cache, not the response:

| Store call | Fails while | Then |
| --- | --- | --- |
| `get` | a request is looked up | a miss: the route runs, `X-Cache: MISS` |
| `set` | a response is kept | nothing is kept; the response is answered |
| `deleteTag` | `invalidate` or `invalidateTag` | the call rejects with the store's error |

The first two are logged with `console.error` once per outage — the first
failure, then nothing until the store has answered again — and the request
goes on. An invalidation rejects instead: the code that changed
the data should know the old responses may still be served.

```ts
import { expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { cache, MemoryCacheStore } from '@alxia/cache';

test('a store that cannot answer: the route answers', async () => {
	const broken = new MemoryCacheStore();
	broken.get = () => {
		throw new Error('store down');
	};
	broken.set = () => Promise.reject(new Error('store down'));
	broken.deleteTag = () => Promise.reject(new Error('store down'));

	const products = cache({ ttl: 60, store: broken });
	const app = alxia()
		.plugin(products)
		.get('/products', ({ reply }) => reply.ok([]));

	const response = await app.request('/products');   // logs "store down" once
	expect(response.status).toBe(200);
	expect(response.headers.get('x-cache')).toBe('MISS');
	await expect(products.invalidate('/products')).rejects.toThrow('store down');
});
```

A write that must answer even when the store is down catches the
invalidation, and keeps `ttl` short, since the old responses stay until
they expire:

```ts
await products.invalidateTag('products').catch((error) => console.error(error));
```

## See also

- [Caching responses](caching.md): the options that decide freshness.
- [Invalidation](invalidation.md): `invalidate`, `invalidateTag`, and
  sharing one store between caches.
