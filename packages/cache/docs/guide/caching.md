# Caching responses

This page covers the `cache()` plugin: which requests it answers, which
responses it keeps, each option, the headers it sends, and what a route
behind it reads.

```ts
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';

const app = alxia()
	.get('/health', ({ reply }) => reply(200, 'ok'))      // declared before: never cached
	.use(cache({ ttl: 60, staleWhileRevalidate: 300 }))
	.get('/products', ({ reply }) => reply(200, [{ id: 1, name: 'Lamp' }]));

app.listen({ port: 3000 });
```

```sh
curl -i localhost:3000/products   # x-cache: MISS — the route ran
curl -i localhost:3000/products   # x-cache: HIT, age: 0 — the route did not
```

## Which requests

The plugin is a route hook: it applies to the routes declared **after**
`use(cache(…))`, in the same app or group, and to no other. Within those:

- only `GET` and `HEAD` are looked up; every other method runs the route as
  if there were no cache, and still reads [`ctx.cache`](#what-a-route-reads).
  A `QUERY` is a read too, but not cached: its key would have to include
  its body;
- a `HEAD` and a `GET` to the same URL share one key; a `HEAD` that misses
  runs the `GET` route and keeps its whole body, so the next `GET` is a hit;
- a request whose [`key`](keys-and-vary.md#a-key-of-your-own) is
  `undefined` is not looked up, nor kept;
- with `honorClientNoCache: true`, a request that says
  `Cache-Control: no-cache` runs the route, and its response is not kept.

## The three answers

| State | When | What happens | `X-Cache` |
| --- | --- | --- | --- |
| fresh | younger than `ttl` | answered from the store; the route does not run | `HIT` |
| stale | older than `ttl`, younger than `ttl + staleWhileRevalidate` | answered from the store at once; one request runs the route behind it and keeps the new response | `STALE` |
| missing | not in the store, or older than both | the route runs, and its response is kept if it [may be](#which-responses-are-kept) | `MISS` |

Concurrent misses of one key run the route **once**: every request that
arrives while it runs waits for the same response. This holds in one
process, for one `cache()`; two processes sharing a Redis store each run the
route once.

```ts
import { expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';

test('ten concurrent misses run the route once', async () => {
	let runs = 0;
	const app = alxia()
		.use(cache({ ttl: 60 }))
		.get('/products', async ({ reply }) => {
			await Bun.sleep(20);
			return reply(200, { runs: ++runs });
		});

	const answers = await Promise.all(
		Array.from({ length: 10 }, async () => (await app.request('/products')).json()),
	);
	expect(answers.every((answer) => answer.runs === 1)).toBe(true);
});
```

Only a response that is kept is shared this way:
[Not kept is not shared](#not-kept-is-not-shared).

A route that throws during a miss answers its 500 to the request that ran
it, and nothing is kept; every request that was waiting on it runs the
route itself.

A request that ran the route itself, after waiting on a run that was not
kept or that threw, gets its answer as the route made it: not kept, with
no `X-Cache`. The next request is a miss. A route that throws while refreshing a stale
response is logged with `console.error`; the stale copy keeps being served,
and the next stale request tries again, until `ttl + staleWhileRevalidate`
has passed.

## Which responses are kept

A response is kept only when all of these hold:

| Condition | Why |
| --- | --- |
| its status is in `statuses` (`[200]` by default) | a 500 or a 404 is not served again unless you say so |
| its `Cache-Control` has neither `private` nor `no-store` | the route said it belongs to one client |
| it sets no cookie | a `Set-Cookie` belongs to one client |
| it is not `text/event-stream` | a stream has no end to keep |
| the route did not call `cache.skip()` | the route said so |

Otherwise it is sent as the route answered it, with no `X-Cache`.

### Not kept is not shared

Concurrent misses wait on one run of the route, but only a response that is
**kept** is handed to them. A response that is not kept answers the request
that ran the route, and every other waiting request runs the route itself:
three visitors asking `/me` together, behind the cache, each get their own
answer.

```ts
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';

const app = alxia()
	.use(cache({ ttl: 60 }))
	.get('/me', ({ request, reply }) =>
		reply(200, { cookie: request.headers.get('cookie') }, { headers: { 'cache-control': 'private' } }),
	); // concurrent requests: one run each, each with its own answer
```

A route that is always personal still belongs before the plugin: it saves
the store lookup, and the wait on another request's run.

## Options

```ts
cache<Requires extends object = Empty>(options: CacheOptions<Requires>): Alxia<…> & Requiring<Requires> & Cache
// an app, given to `use`, which checks `Requires`; and the hands to empty it
```

`Requires` is what `key` and `tags` read beyond `BaseContext`, empty by
default; see [Reading the app's context](keys-and-vary.md#reading-the-apps-context).

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `ttl` | `number` | required | **seconds** a response is fresh; fractions are allowed (`0.5`) |
| `staleWhileRevalidate` | `number` | `0` | seconds more it is served stale while one request refreshes it |
| `store` | `CacheStore` | a new `MemoryCacheStore()` | where responses are kept: [Stores](stores.md) |
| `key` | `(ctx: BaseContext & Requires) => string \| undefined` | the path and query, then each `vary` header | a request's key; `undefined` is not cached: [Keys and Vary](keys-and-vary.md) |
| `vary` | `readonly string[]` | none | request headers the response depends on: part of the default key, and appended to `Vary` |
| `statuses` | `readonly number[]` | `[200]` | the statuses kept |
| `tags` | `(ctx: BaseContext & Requires) => readonly string[]` | none | tags on every response kept: [Invalidation](invalidation.md) |
| `honorClientNoCache` | `boolean` | `false` | a request's `Cache-Control: no-cache` runs the route instead |
| `debugHeaders` | `boolean` | `true` | send `X-Cache` and `Age` |

### `ttl` and `staleWhileRevalidate`

Both are **seconds**. With both, a response is served for
`ttl + staleWhileRevalidate` seconds, and the route runs at most about once
per `ttl`, never while a client waits — except on the first request, and
after a quiet period longer than both.

```ts
cache({ ttl: 30, staleWhileRevalidate: 600 }); // fresh 30 s, then served while refreshed for 10 min more
```

### `statuses`

A "not found" that is expensive to compute is worth keeping too. A `204` is
kept and served without a body.

```ts
cache({ ttl: 60, statuses: [200, 404] });
```

### `honorClientNoCache`

Off by default: a client cannot empty your cache, nor run your route at
will, by sending `Cache-Control: no-cache`. On, such a request runs the
route — but its response does **not** replace the stored one.

```ts
cache({ ttl: 60, honorClientNoCache: true });
```

A browser sends `Cache-Control: no-cache` on a hard reload (Shift-reload),
and not on a plain reload. curl sends it only when told to:
`curl -H 'cache-control: no-cache'`.

### `debugHeaders`

On by default: every answer from the cache carries `X-Cache` (`HIT`,
`STALE` or `MISS`) and `Age` (whole seconds since it was kept). Turn them
off to say nothing of the cache to clients:

```ts
cache({ ttl: 60, debugHeaders: false });
```

## ETags and 304s

Every kept response gets a weak `ETag` computed from its body, unless the
route set one. A request whose `If-None-Match` names it — or says `*` — is
answered `304 Not Modified` with no body, whether it was a hit, a stale hit
or a miss. Weak and strong forms of one tag match.

```ts
import { expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';

test('a client whose copy is current gets a 304', async () => {
	const app = alxia()
		.use(cache({ ttl: 60 }))
		.get('/products', ({ reply }) => reply(200, []));

	const first = await app.request('/products');
	const etag = first.headers.get('etag') ?? '';
	expect(etag).toStartWith('W/"');

	const again = await app.request('/products', { headers: { 'if-none-match': etag } });
	expect(again.status).toBe(304);
});
```

A browser sends `If-None-Match` on its own once it has the response with
an `ETag`; curl does not unless you pass the header.

The plugin sets no `Cache-Control` of its own: it caches on the server.
For a browser or a CDN to keep the response as well, the route says so —
`public` is not `private`, so the response is still kept here:

```ts
app.get('/products', ({ reply }) =>
	reply(200, [], { headers: { 'cache-control': 'public, max-age=60' } }),
);
```

## The headers kept

A kept response keeps the route's status and headers, without
`Content-Length` and `Date`, with its `ETag`, and with each `vary` header
appended to `Vary` once. Headers that global hooks add after the route
(`onResponse`, a CORS or compression plugin) are not kept: they are added
again to every answer, from the cache or not.

## What a route reads

Every route after the plugin reads `ctx.cache`:

```ts
interface CacheControls {
	/** Tags the response being built, beyond the plugin's `tags`. */
	tag(...tags: string[]): void;
	/** Keeps this response out of the cache. */
	skip(): void;
}
```

```ts
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';

const app = alxia()
	.use(cache({ ttl: 60 }))
	.get('/products/:id', ({ params, cache, reply }) => {
		cache.tag(`product:${params.id}`);               // invalidateTag('product:1') forgets it
		return reply(200, { id: params.id });
	})
	.get('/products/:id/stock', ({ params, cache, reply }) => {
		const stock = params.id === '1' ? 0 : 5;
		if (stock === 0) cache.skip();                   // "sold out" is not kept
		return reply(200, { stock });
	});
```

A route declared before the plugin has no `ctx.cache`; reading it is a
compile error ([Troubleshooting](../troubleshooting.md#property-cache-does-not-exist-on-type-context)).

## The value `cache()` returns

`cache()` returns the plugin — an app to give to `use` — with the handles
of its store on it:

```ts
interface Cache {
	invalidate(path: string): Promise<void>;
	invalidateTag(tag: string): Promise<void>;
	readonly store: CacheStore;
}
```

Keep it in a variable to reach them from elsewhere: a route that writes, a
job, a test. [Invalidation](invalidation.md) covers both.

## A realistic app

A catalogue whose reads are cached and whose writes empty it, with the
personal routes kept out:

```ts
import { alxia } from '@alxia/core';
import { cache, MemoryCacheStore } from '@alxia/cache';

const products = new Map<string, { id: string; name: string }>();

const catalogue = cache({
	ttl: 60,
	staleWhileRevalidate: 600,
	store: new MemoryCacheStore({ maxEntries: 5_000 }),
	tags: () => ['products'],
	statuses: [200, 404],
});

export const app = alxia({ prefix: '/api' })
	.post('/products', async ({ request, reply }) => {
		const product = (await request.json()) as { id: string; name: string };
		products.set(product.id, product);
		await catalogue.invalidateTag('products');      // the next GET runs the route
		return reply(201, product);
	})
	.get('/me', ({ reply }) => reply(200, { name: 'Grace' }))  // before the cache: personal
	.use(catalogue)
	.get('/products', ({ reply }) => reply(200, [...products.values()]))
	.get('/products/:id', ({ params, cache, reply }) => {
		cache.tag(`product:${params.id}`);
		const product = products.get(params.id);
		return product ? reply(200, product) : reply(404, { error: 'not_found' });
	});
```

## See also

- [Keys and Vary](keys-and-vary.md): what makes two requests the same one.
- [Invalidation](invalidation.md): emptying the cache when the data changes.
- [Stores](stores.md): memory, Redis, or your own.
