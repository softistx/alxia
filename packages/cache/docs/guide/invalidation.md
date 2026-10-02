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

Tags are the way to invalidate whatever the key: a `vary` header, a custom
`key`, a prefix or a query string are all covered, since the tag is on the
response, not in its key. Tag what a write changes — the entity, its
collection — and invalidate those tags from the write.

## By path: `invalidate`

```ts
invalidate(path: string): Promise<void>
```

Forgets the response kept under the **default key** of `path`, with no
`vary` header: `path` is the full path and query as the request wrote them,
prefix included.

```ts
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';

const products = cache({ ttl: 300 });
const app = alxia({ prefix: '/api' })
	.use(products)
	.get('/products', ({ reply }) => reply(200, []));

await products.invalidate('/api/products');        // forgets GET /api/products
await products.invalidate('/api/products?page=2'); // forgets GET /api/products?page=2, and only that
```

It does **not** reach:

| A response kept… | because its key is | Use instead |
| --- | --- | --- |
| behind a `vary` | `/hello\|accept-language=fr` | a tag |
| under a custom `key` | whatever your key returns | `products.store.delete(yourKey)`, or a tag |
| at another query, or the same query reordered | `/products?b=2&a=1` | a tag |
| without the app's prefix | `/products` is not `/api/products` | the full path |

`invalidate` resolves either way: a path that names nothing kept is not an
error.

## From the store

`cache()` exposes its store: `products.store`. Deleting a key you computed
yourself reaches a custom `key`:

```ts
await products.store.delete('/hello|fr');
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
