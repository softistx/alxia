# Invalidation

This page covers emptying the cache when the data behind it changes: by
path, by tag, from a route or elsewhere, and across processes.

```ts
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';

const products = cache({ ttl: 300, tags: () => ['products'] });

const app = alxia()
	.post('/products', async ({ reply }) => {
		// … save it
		await products.invalidateTag('products');       // every product page runs again
		return reply(201, { saved: true });
	})
	.use(products)
	.get('/products', ({ reply }) => reply(200, []))
	.get('/products/:id', ({ params, reply }) => reply(200, { id: params.id }));
```

Without invalidation, a response is served until `ttl +
staleWhileRevalidate` has passed. With it, the next request after a write
runs the route.

## By tag: `invalidateTag`

```ts
invalidateTag(tag: string): Promise<void>
```

Forgets every response that carries `tag`, whatever its key. A response
carries:

- the tags of the plugin's `tags(ctx)`, computed for each response kept;
- the tags its route added with `ctx.cache.tag(…)`.

```ts
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';

const catalogue = cache({
	ttl: 300,
	tags: ({ url }) => (url.pathname.startsWith('/products') ? ['products'] : []),
});

const app = alxia()
	.use(catalogue)
	.get('/products', ({ reply }) => reply(200, []))
	.get('/products/:id', ({ params, cache, reply }) => {
		cache.tag(`product:${params.id}`);
		return reply(200, { id: params.id });
	});

await catalogue.invalidateTag('product:1');   // only /products/1, in every language and query
await catalogue.invalidateTag('products');    // every page of the catalogue
```

A tag is on the response, not in its key, so it reaches every query
string and every `vary` value. Tag what a write changes — the entity, its
collection — and invalidate those tags from the write.

## By path: `invalidate`

```ts
invalidate(path: string): Promise<void>
```

Forgets every response kept for `path`, whatever its key: each `vary`
value, a `key` of your own. `path` is the path and query as the request
asked them, prefix included.

```ts
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';

const products = cache({ ttl: 300, vary: ['accept-language'] });
const app = alxia({ prefix: '/api' })
	.use(products)
	.get('/products', ({ reply }) => reply.ok([]));

await products.invalidate('/api/products');        // GET /api/products, in every language
await products.invalidate('/api/products?page=2'); // GET /api/products?page=2, and only that
```

It works by a tag: every response is kept with `alxia:path:<path and
query>` among its tags — `pathTag(path)` builds it — and `invalidate(path)`
is `store.deleteTag(pathTag(path))`.

```ts
import { pathTag } from '@alxia/cache';

pathTag('/api/products?page=2');   // 'alxia:path:/api/products?page=2'
```

Tags starting `alxia:` are the plugin's: do not give one of yours that
prefix. A store of your own must remember each response's `tags`, or
`invalidate` reaches nothing ([Writing a store](stores.md#writing-a-store)).

The path is matched exactly, so it does **not** reach:

| A response kept… | because its path is | Use instead |
| --- | --- | --- |
| at another query | `/products?page=2` is not `/products` | each path, or a tag |
| at the same query reordered | `/products?b=2&a=1` is not `/products?a=1&b=2` | a tag |
| with the app's prefix | `/api/products` is not `/products` | the full path |

A `key` of your own that several paths share — `key: (ctx) =>
ctx.url.pathname`, which `/products` and `/products?page=2` both write — is
reached by the path that wrote it last: `MemoryCacheStore` replaces the
entry with its tags, so `invalidate('/products')` misses it once
`/products?page=2` has written it. `redisCacheStore` keeps every path that
wrote it, and forgets it from either. Give such a key a tag, and use
`invalidateTag`.

`invalidate` resolves when nothing was kept for `path`. It rejects when the
store does — see [When the store cannot answer](stores.md#when-the-store-cannot-answer).

## From the store

`cache()` exposes its store: `products.store`. Deleting one key you
computed yourself forgets that response alone:

```ts
await products.store.delete('/api/products|accept-language=fr');   // the French one only
```

## Several caches, one store

Each `cache()` without a `store` gets a memory store of its own, and its
`invalidateTag` empties only that store. Give two caches one store, and a
tag invalidated through either is forgotten in both:

```ts
import { alxia } from '@alxia/core';
import { cache, MemoryCacheStore } from '@alxia/cache';

const store = new MemoryCacheStore();
const shortLived = cache({ ttl: 10, store, tags: () => ['products'] });
const longLived = cache({ ttl: 600, store, tags: () => ['products'] });

const app = alxia()
	.group((g) => g.use(shortLived).get('/products/stock', ({ reply }) => reply(200, 5)))
	.group((g) => g.use(longLived).get('/products', ({ reply }) => reply(200, [])));

await shortLived.invalidateTag('products');  // both routes run again
```

Two caches on one store must not keep the same key: give them different
paths, as here, or keys of their own.

## Across processes

The memory store lives in one process. With more than one — a cluster,
several containers — invalidating in the process that handled the write
leaves every other process serving its old copy until it expires.
`@alxia/redis`'s `redisCacheStore` keeps the responses and their tags in a
Redis every process shares, so one `invalidateTag` reaches all of them
([Stores](stores.md#in-redis)).

## In a test

```ts
import { expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';

test('invalidated by path, and by tag', async () => {
	let runs = 0;
	const products = cache({ ttl: 60, tags: () => ['products'] });
	const app = alxia()
		.use(products)
		.get('/products', ({ reply }) => reply(200, { runs: ++runs }));

	await app.request('/products');
	await products.invalidate('/products');
	await app.request('/products');
	expect(runs).toBe(2);

	await products.invalidateTag('products');
	await app.request('/products');
	expect(runs).toBe(3);
});
```

## See also

- [Keys and Vary](keys-and-vary.md): what a key is made of.
- [Stores](stores.md): what `delete` and `deleteTag` do in each store.
