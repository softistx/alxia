# Troubleshooting

Each entry is headed by the text you see: a TypeScript error, or an
exception in the log. `@alxia/cache` throws nothing of its own; most of what
goes wrong prints nothing at all, and is under [Traps](#traps), by symptom.

**Types**

- [`Argument of type '{}' is not assignable to parameter of type 'CacheOptions'`](#argument-of-type--is-not-assignable-to-parameter-of-type-cacheoptions)
- [`Property 'cache' does not exist on type 'Context<…>'`](#property-cache-does-not-exist-on-type-context)
- [`Property 'user' does not exist on type 'BaseContext'`](#property-user-does-not-exist-on-type-basecontext)
- [`Type '(…) => Promise<string>' is not assignable to type '(ctx: BaseContext) => string | undefined'`](#type---promisestring-is-not-assignable-to-type-ctx-basecontext--string--undefined)
- [`Type '(…) => string | null' is not assignable to type '(ctx: BaseContext) => string | undefined'`](#type---string--null-is-not-assignable-to-type-ctx-basecontext--string--undefined)
- [`Type '() => string' is not assignable to type '(ctx: BaseContext) => readonly string[]'`](#type---string-is-not-assignable-to-type-ctx-basecontext--readonly-string)
- [`Type 'string' is not assignable to type 'readonly string[]'`](#type-string-is-not-assignable-to-type-readonly-string)

**Writing a store**

- [`Type 'null' is not assignable to type 'CachedResponse | Promise<CachedResponse | undefined> | undefined'`](#type-null-is-not-assignable-to-type-cachedresponse--promisecachedresponse--undefined--undefined)
- [`Property 'deleteTag' is missing in type '{ … }' but required in type 'CacheStore'`](#property-deletetag-is-missing-in-type----but-required-in-type-cachestore)
- [`Type 'string' is not assignable to type 'Uint8Array<ArrayBufferLike>'`](#type-string-is-not-assignable-to-type-uint8arrayarraybufferlike)

**Runtime**

- [`TypeError: cache.tag is not a function. (In 'cache.tag("…")', 'cache.tag' is undefined)`](#typeerror-cachetag-is-not-a-function-in-cachetag-cachetag-is-undefined)
- [`TypeError: undefined is not an object (evaluating 'cache.….…')`](#typeerror-undefined-is-not-an-object-evaluating-cache)
- [`TypeError: Response body already used. A Response body can only be sent once; create a new Response for each request.`](#typeerror-response-body-already-used-a-response-body-can-only-be-sent-once-create-a-new-response-for-each-request)
- [`500 {"error":"internal"}` from a cached route, with the store's error in the log](#500-errorinternal-from-a-cached-route-with-the-stores-error-in-the-log)
- [The route's error is logged, yet the client got a `200` with `X-Cache: STALE`](#the-routes-error-is-logged-yet-the-client-got-a-200-with-x-cache-stale)

**Traps**

- [No `X-Cache` header, and the route runs every time](#no-x-cache-header-and-the-route-runs-every-time)
- [`X-Cache: MISS` on every request](#x-cache-miss-on-every-request)
- [Hits with curl, misses in a browser](#hits-with-curl-misses-in-a-browser)
- [One visitor sees another visitor's page](#one-visitor-sees-another-visitors-page)
- [Old data after a write](#old-data-after-a-write)
- [A hard reload shows new data, a plain reload the old](#a-hard-reload-shows-new-data-a-plain-reload-the-old)
- [Responses are kept for hours](#responses-are-kept-for-hours)

## Types

### `Argument of type '{}' is not assignable to parameter of type 'CacheOptions'`

**When:** calling `cache()` without a `ttl`.

```text
error TS2345: Argument of type '{}' is not assignable to parameter of type 'CacheOptions'.
  Property 'ttl' is missing in type '{}' but required in type 'CacheOptions'.
```

**Why:** `ttl` has no default: how long a response may be served again is
a decision only the app can make.

**Fix:** give it, in seconds:

```ts
cache({ ttl: 60 });
```

### `Property 'cache' does not exist on type 'Context<…>'`

**When:** a route reads `ctx.cache` — to call `tag` or `skip` — and is
declared before `use(cache(…))`.

```text
error TS2339: Property 'cache' does not exist on type 'Context<Empty, "/x", Empty>'.
```

**Why:** the plugin is a route hook: it applies to, and adds `cache` to, the
routes declared after it. The route before it is not cached either.

**Fix:** declare the route after the plugin:

```ts
alxia()
	.use(cache({ ttl: 60 }))
	.get('/products/:id', ({ params, cache, reply }) => {
		cache.tag(`product:${params.id}`);
		return reply(200, { id: params.id });
	});
```

### `Property 'user' does not exist on type 'BaseContext'`

**When:** a `key` or `tags` function reads something an earlier `derive` or
`decorate` added to the context.

```text
error TS2339: Property 'user' does not exist on type 'BaseContext'.
```

**Why:** `key` and `tags` are typed with `BaseContext` — `request`, `url`,
`ip`, `server`, `route`, `pathParams` — not with the context of the app the
plugin is mounted on.

**Fix:** read the request itself:

```ts
cache({
	ttl: 60,
	key: ({ url, request }) =>
		request.headers.has('authorization') ? undefined : `${url.pathname}${url.search}`,
});
```

To tag by what a route knows, tag from the route with `ctx.cache.tag(…)`
instead ([Invalidation](guide/invalidation.md#by-tag-invalidatetag)).

### `Type '(…) => Promise<string>' is not assignable to type '(ctx: BaseContext) => string | undefined'`

**When:** `key` is an `async` function.

```text
error TS2322: Type '({ url }: BaseContext) => Promise<string>' is not assignable to type '(ctx: BaseContext) => string | undefined'.
  Type 'Promise<string>' is not assignable to type 'string'.
```

**Why:** the key is computed on every request before the store is asked;
it is synchronous.

**Fix:** compute the key from the request alone. A route whose answer
needs a lookup — a session, a tenant from a database — is personal:
declare it before the cache
([Personal responses](guide/keys-and-vary.md#personal-responses)).

```ts
cache({ ttl: 60, key: ({ url }) => `${url.pathname}${url.search}` });
```

### `Type '(…) => string | null' is not assignable to type '(ctx: BaseContext) => string | undefined'`

**When:** `key` returns `request.headers.get(…)`, or anything else that may
be `null`.

```text
error TS2322: Type '({ request }: BaseContext) => string | null' is not assignable to type '(ctx: BaseContext) => string | undefined'.
  Type 'string | null' is not assignable to type 'string | undefined'.
    Type 'null' is not assignable to type 'string | undefined'.
```

**Why:** `undefined` is the key's "do not cache"; `null` is not accepted for
it.

**Fix:**

```ts
cache({ ttl: 60, key: ({ request }) => request.headers.get('x-tenant') ?? undefined });
```

### `Type '() => string' is not assignable to type '(ctx: BaseContext) => readonly string[]'`

**When:** `tags` returns one tag instead of a list.

```text
error TS2322: Type '() => string' is not assignable to type '(ctx: BaseContext) => readonly string[]'.
  Type 'string' is not assignable to type 'readonly string[]'.
```

**Fix:**

```ts
cache({ ttl: 60, tags: () => ['products'] });
```

### `Type 'string' is not assignable to type 'readonly string[]'`

**When:** `vary` or `statuses` is given one value instead of a list — or
the line above, for `tags`.

```text
error TS2322: Type 'string' is not assignable to type 'readonly string[]'.
```

**Fix:**

```ts
cache({ ttl: 60, vary: ['accept-language'], statuses: [200] });
```

## Writing a store

### `Type 'null' is not assignable to type 'CachedResponse | Promise<CachedResponse | undefined> | undefined'`

**When:** a store's `get` returns `null` for a key it does not hold — as
most key-value clients do.

```text
error TS2322: Type '(_key: string) => CachedResponse | null' is not assignable to type '(key: string) => CachedResponse | Promise<CachedResponse | undefined> | undefined'.
  Type 'CachedResponse | null' is not assignable to type 'CachedResponse | Promise<CachedResponse | undefined> | undefined'.
    Type 'null' is not assignable to type 'CachedResponse | Promise<CachedResponse | undefined> | undefined'.
```

**Why:** the plugin treats `undefined` as a miss; it would read `null` as a
response.

**Fix:** turn the client's `null` into `undefined`:

```ts
async get(key) {
	const raw = await client.get(key);           // string | null
	return raw === null ? undefined : decode(raw);
},
```

### `Property 'deleteTag' is missing in type '{ … }' but required in type 'CacheStore'`

**When:** a store implements `get`, `set` and `delete` only.

```text
error TS2741: Property 'deleteTag' is missing in type '{ get: () => undefined; set(): void; delete(): void; }' but required in type 'CacheStore'.
```

**Why:** `invalidateTag` calls the store's `deleteTag`; every store must
answer it.

**Fix:** remember which keys each tag names in `set`, and delete them in
`deleteTag` — [Writing a store](guide/stores.md#writing-a-store) has a
complete one.

### `Type 'string' is not assignable to type 'Uint8Array<ArrayBufferLike>'`

**When:** a store's `get` returns the body as it read it from a text
service — a string — instead of bytes.

```text
error TS2322: Type 'string' is not assignable to type 'Uint8Array<ArrayBufferLike>'.
```

**Why:** `CachedResponse.body` is the response's bytes, so a binary body
survives the round trip.

**Fix:** store it as base64, and decode it on the way back:

```ts
const text = Buffer.from(value.body).toString('base64');          // in set
const body = new Uint8Array(Buffer.from(text, 'base64'));         // in get
```

## Runtime

### `TypeError: cache.tag is not a function. (In 'cache.tag("…")', 'cache.tag' is undefined)`

**When:** a route behind the response cache calls `cache.tag()` or
`cache.skip()`, and another plugin that also adds `cache` to the context —
`@alxia/redis`'s `redis()` does, for its typed caches — is declared
**after** `use(cache(…))`. The route answers a 500.

**Why:** two plugins add the same name; at runtime the later one replaces
the earlier, while the types merge both, so the call compiles.

**Fix:** give one of them another name with a `derive` before the second
is declared:

```ts
alxia()
	.use(redis(connection.client, { caches: { users } }))
	.derive(({ cache }) => ({ caches: cache }))     // the Redis caches, renamed
	.use(cache({ ttl: 60 }))                        // `cache` is now the response cache
	.get('/users/:id', async ({ caches, cache, params, reply }) => {
		cache.tag(`user:${params.id}`);
		return reply(200, await caches.users.remember(params.id, () => loadUser(params.id)));
	});
```

### `TypeError: undefined is not an object (evaluating 'cache.….…')`

**When:** the same two plugins in the other order: the one with typed
caches before `use(cache(…))`, and a route after both reads
`cache.<name>`. The route answers a 500.

**Why:** the response cache's `cache` — `{ tag, skip }` — replaced the
other plugin's.

**Fix:** the `derive` above, between the two.

### `TypeError: Response body already used. A Response body can only be sent once; create a new Response for each request.`

**When:** several requests for one URL arrive together — a page under
load — and the route behind the cache answers
something that is not kept: `Cache-Control: private` or `no-store`, a
`Set-Cookie`, `cache.skip()`, or a status outside `statuses`. Over
`Bun.serve`, one request gets the response and the others get a 500, with
this message in the log. In process, `app.request()` rejects with
`TypeError [ERR_BODY_ALREADY_USED]: Body already used`.

```text
TypeError: Response body already used. A Response body can only be sent once; create a new Response for each request.
```

**Why:** concurrent misses of one key wait on a single run of the route,
and whether its response may be kept is only known once it has run. A
response that is not kept is handed, as the one `Response` object it is, to
every waiting request: the first to send it consumes its body, the others
cannot. The route ran once, with **one** of the requests — so the one that
got a 200 may have been sent another visitor's answer. curl, one request at
a time, never shows it.

**Fix:** a personal route — or one that often answers what is not kept —
goes before the cache, so it never joins a shared run:

```ts
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';

alxia()
	.get('/me', ({ request, reply }) => reply(200, { cookie: request.headers.get('cookie') }))
	.use(cache({ ttl: 60 }))
	.get('/products', ({ reply }) => reply(200, []));
```

Or give such requests no key — a request whose `key` is `undefined` runs
the route on its own:

```ts
cache({
	ttl: 60,
	key: ({ url, request }) => (request.headers.has('cookie') ? undefined : `${url.pathname}${url.search}`),
});
```

For a public route whose occasional 404 or `cache.skip()` is the trigger,
keeping that answer too (`statuses: [200, 404]`) also avoids it.

### `500 {"error":"internal"}` from a cached route, with the store's error in the log

**When:** the store throws — a Redis that is down, a store of your own
with a bug — on `get` while a request is looked up, or on `set` while a
response is kept.

**Why:** the plugin awaits the store, and does not catch it: the store's
error is the request's error, so a route that would have answered is a
500.

**Fix:** if a store outage should only cost the cache, wrap the store so
its errors are misses —
[A store that fails open](guide/stores.md#a-store-that-fails-open):

```ts
cache({ ttl: 60, store: failOpen(redisCacheStore(connection.client, { name: 'shop' })) });
```

### The route's error is logged, yet the client got a `200` with `X-Cache: STALE`

**When:** `staleWhileRevalidate` is set, a response is stale, and the
route throws while refreshing it.

**Why:** the stale copy was already sent; the refresh runs behind it, and
its error has no request left to answer, so it is logged with
`console.error`. Each later stale request tries again, until
`ttl + staleWhileRevalidate` has passed; then the next request waits for
the route, and gets its 500.

**Fix:** none is needed — serving the last good response while the route
fails is what stale-while-revalidate is for. Fix the route; keep
`staleWhileRevalidate` as long as you are willing to serve old data.

## Traps

### No `X-Cache` header, and the route runs every time

**When:** the request is never looked up, or the response is never kept.

**Why:** one of these, from the most common:

| Cause | Fix |
| --- | --- |
| the route is declared before `use(cache(…))` | declare it after |
| the response sets a cookie — a session plugin that touches every response, say | move the routes that set it before the cache, or stop it setting a cookie on public pages |
| the response says `Cache-Control: private` or `no-store` | if it is personal, declare the route before the cache: [concurrent requests still share it](#typeerror-response-body-already-used-a-response-body-can-only-be-sent-once-create-a-new-response-for-each-request) |
| its status is not in `statuses` (`[200]`) | `statuses: [200, 404]` |
| it is `text/event-stream` | intended: a stream is never kept |
| the route called `cache.skip()` | intended, for an answer not worth keeping; not for a personal one |
| `key` returned `undefined` | intended: see [Personal responses](guide/keys-and-vary.md#personal-responses) |
| the method is not `GET` or `HEAD` | intended |
| `honorClientNoCache: true`, and the request said `Cache-Control: no-cache` | see [below](#a-hard-reload-shows-new-data-a-plain-reload-the-old) |
| `debugHeaders: false` | the cache works; it just does not say so |

### `X-Cache: MISS` on every request

**When:** the response is computed, kept, and the next request misses
anyway.

**Why:** the store did not keep it, or the next request has another key:

- **The body is larger than the memory store's `maxBytes`** (64 MiB by
  default): a body that would not fit is never kept.
- **The key changes every time**: a query parameter that is new on each
  request (`?t=1712345678`), or a `vary` header whose value differs — see
  [the next entry](#hits-with-curl-misses-in-a-browser).
- **A store of your own reads `keepFor` as seconds**: it is
  **milliseconds**. A Redis `EX` given `keepFor` keeps a response 1 000 times
  too long; `PX` is right, or `Math.ceil(keepFor / 1000)` for `EX`.
- **Each process has its own memory store**, and a load balancer spreads
  requests across them: each process misses once.

**Fix:** for a large body, raise the limit:

```ts
cache({ ttl: 60, store: new MemoryCacheStore({ maxBytes: 256 * 1024 * 1024 }) });
```

For a changing query, key by what the route reads:

```ts
cache({ ttl: 60, key: ({ url }) => `${url.pathname}?page=${url.searchParams.get('page') ?? '1'}` });
```

### Hits with curl, misses in a browser

**When:** `vary` names `accept-language`, `cookie`, `user-agent` or another
header a browser fills in.

**Why:** the key holds the header's **exact** value. curl sends no
`Accept-Language` and no `Cookie`, so every curl request shares one key and
hits. A browser sends its whole preference list —
`fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7` — and every cookie of the site, so
visitors rarely share a key.

**Fix:** key by what the route actually answers with, and keep `vary` for
the `Vary` header —
[A key of your own](guide/keys-and-vary.md#a-key-of-your-own):

```ts
cache({
	ttl: 60,
	vary: ['accept-language'],
	key: ({ url, request }) =>
		`${url.pathname}${url.search}|${language(request.headers.get('accept-language'))}`,
});
```

### One visitor sees another visitor's page

**When:** a route that answers by who is asking — a `Cookie`, an
`Authorization` header — is behind the cache with the default key. curl,
with no cookie, shows nothing wrong; a signed-in browser does.

**Why:** the default key is the path and query only. The first visitor's
response is kept, and served to everyone after. Answering
`Cache-Control: private` stops it being kept, but not being shared: two
visitors whose requests arrive together still wait on one run of the
route, made for one of them
([`Response body already used`](#typeerror-response-body-already-used-a-response-body-can-only-be-sent-once-create-a-new-response-for-each-request)).

**Fix:** keep personal routes out of the cache by declaring them before it:

```ts
alxia()
	.get('/me', ({ request, reply }) => reply(200, { cookie: request.headers.get('cookie') }))
	.use(cache({ ttl: 60 }))
	.get('/products', ({ reply }) => reply(200, []));
```

When they cannot move — a group mounted behind the cache — give their
requests no key: `key: (ctx) => (ctx.request.headers.has('cookie') ? undefined : …)`
([Personal responses](guide/keys-and-vary.md#personal-responses)).

Then empty what was already kept: `await products.invalidateTag(…)`, or
restart a process that uses the memory store.

### Old data after a write

**When:** a write calls `invalidate(path)` or `invalidateTag(tag)`, and a
read still answers the old response.

**Why:** the invalidation did not reach the key, or the store:

- `invalidate(path)` deletes the **default key** of `path`, without `vary`:
  it misses a response kept behind `vary`, under a custom `key`, at another
  query, or when `path` lacks the app's prefix.
- Two `cache()` without a `store` have **two memory stores**; invalidating
  through one does not touch the other.
- Several processes with the **memory store** each keep their own copy;
  the write's process is the only one emptied.

**Fix:** invalidate by tag, on a store every cache and process shares:

```ts
const store = redisCacheStore(connection.client, { name: 'shop' });
const products = cache({ ttl: 60, store, tags: () => ['products'] });

await products.invalidateTag('products');
```

[Invalidation](guide/invalidation.md) covers each case.

### A hard reload shows new data, a plain reload the old

**When:** `honorClientNoCache: true`.

**Why:** a browser sends `Cache-Control: no-cache` on a hard reload
(Shift-reload) and not on a plain one. With `honorClientNoCache`, that
request runs the route — but its fresh response does **not** replace the
one kept, so the next plain request is served the old one.

**Fix:** leave `honorClientNoCache` off (the default) and invalidate on
write; or keep it, knowing it is a way for one client to bypass the cache,
not to refresh it.

### Responses are kept for hours

**When:** `ttl` or `staleWhileRevalidate` was given in milliseconds.

**Why:** both are **seconds**: `ttl: 60_000` is nearly 17 hours.

**Fix:**

```ts
cache({ ttl: 60, staleWhileRevalidate: 300 });  // one minute fresh, five more stale
```
