# Troubleshooting

Each entry is headed by the text you see: a TypeScript error, or an
exception in the log. `@alxia/cache` throws nothing of its own; most of what
goes wrong prints nothing at all, and is under [Traps](#traps), by symptom.

**Types**

- [`Argument of type '{}' is not assignable to parameter of type 'CacheOptions<Empty>'`](#argument-of-type--is-not-assignable-to-parameter-of-type-cacheoptionsempty)
- [`Property 'cache' does not exist on type 'Context<…>'`](#property-cache-does-not-exist-on-type-context)
- [`Property '…' does not exist on type 'CacheControls'`](#property--does-not-exist-on-type-cachecontrols)
- [`Property 'user' does not exist on type 'BaseContext & Empty'`](#property-user-does-not-exist-on-type-basecontext--empty)
- [`Type '(…) => Promise<string>' is not assignable to type '(ctx: BaseContext & Empty) => string | undefined'`](#type---promisestring-is-not-assignable-to-type-ctx-basecontext--empty--string--undefined)
- [`Type '(…) => string | null' is not assignable to type '(ctx: BaseContext & Empty) => string | undefined'`](#type---string--null-is-not-assignable-to-type-ctx-basecontext--empty--string--undefined)
- [`Type '() => string' is not assignable to type '(ctx: BaseContext & Empty) => readonly string[]'`](#type---string-is-not-assignable-to-type-ctx-basecontext--empty--readonly-string)
- [`Type 'string' is not assignable to type 'readonly string[]'`](#type-string-is-not-assignable-to-type-readonly-string)

**Writing a store**

- [`Type 'null' is not assignable to type 'CachedResponse | Promise<CachedResponse | undefined> | undefined'`](#type-null-is-not-assignable-to-type-cachedresponse--promisecachedresponse--undefined--undefined)
- [`Property 'deleteTag' is missing in type '{ … }' but required in type 'CacheStore'`](#property-deletetag-is-missing-in-type----but-required-in-type-cachestore)
- [`Type 'string' is not assignable to type 'Uint8Array<ArrayBufferLike>'`](#type-string-is-not-assignable-to-type-uint8arrayarraybufferlike)

**Runtime**

- [`500 {"error":"internal"}` from a route that invalidates, with the store's error in the log](#500-errorinternal-from-a-route-that-invalidates-with-the-stores-error-in-the-log)
- [The route's error is logged, yet the client got a `200` with `X-Cache: STALE`](#the-routes-error-is-logged-yet-the-client-got-a-200-with-x-cache-stale)

**Traps**

- [No `X-Cache` header, and the route runs every time](#no-x-cache-header-and-the-route-runs-every-time)
- [`X-Cache: MISS` on every request](#x-cache-miss-on-every-request)
- [Hits with curl, misses in a browser](#hits-with-curl-misses-in-a-browser)
- [A client that sent no `Accept-Encoding` gets gzip bytes](#a-client-that-sent-no-accept-encoding-gets-gzip-bytes)
- [One visitor sees another visitor's page](#one-visitor-sees-another-visitors-page)
- [Old data after a write](#old-data-after-a-write)
- [A hard reload shows new data, a plain reload the old](#a-hard-reload-shows-new-data-a-plain-reload-the-old)
- [Responses are kept for hours](#responses-are-kept-for-hours)

## Types

### `Argument of type '{}' is not assignable to parameter of type 'CacheOptions<Empty>'`

**When:** calling `cache()` without a `ttl`.

```text
error TS2345: Argument of type '{}' is not assignable to parameter of type 'CacheOptions<Empty>'.
  Property 'ttl' is missing in type '{}' but required in type 'CacheOptions<Empty>'.
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

### `Property '…' does not exist on type 'CacheControls'`

**When:** a route reads from `ctx.cache` something other than `tag` or
`skip` — most often `@alxia/redis`'s typed caches, which `redis()` puts in
the context as `caches`.

```text
error TS2339: Property 'users' does not exist on type 'CacheControls'.
```

At run time, without a typecheck, the route answers a 500 with
`TypeError: undefined is not an object (evaluating 'cache.users.remember')`.

**Why:** `ctx.cache` is this plugin's controls, `{ tag, skip }`, and
nothing else.

**Fix:** read the other plugin's name for it:

```ts
alxia()
	.use(redis(connection.client, { caches: { users } }))
	.use(cache({ ttl: 60 }))
	.get('/users/:id', async ({ caches, cache, params, reply }) => {
		cache.tag(`user:${params.id}`);
		return reply.ok(await caches.users.remember(params.id, () => loadUser(params.id)));
	});
```

### `Property 'user' does not exist on type 'BaseContext & Empty'`

**When:** a `key` or `tags` function reads something an earlier `derive`,
`decorate` or plugin added to the context, and `cache` is not told about it.

```text
error TS2339: Property 'user' does not exist on type 'BaseContext & Empty'.
```

**Why:** `key` and `tags` are typed with `BaseContext` — `request`, `url`,
`ip`, `server`, `route`, `pathParams` — plus what you name as `cache`'s type
argument, and nothing else. `cache` is built before it is used, so it
cannot see the app it will be used on.

**Fix:** name what `key` and `tags` read. The app that uses the cache must
then give it, before the cache:

```ts
const perTenant = cache<{ user: { tenantId: string } }>({
	ttl: 60,
	key: ({ user, url }) => `${user.tenantId}:${url.pathname}${url.search}`,
	tags: ({ user }) => [`tenant:${user.tenantId}`],
});

const auth = alxia().derive(({ request }) => ({
	user: { tenantId: request.headers.get('x-tenant') ?? 'public' },
}));

alxia().use(auth).use(perTenant); // auth derives user
```

On an app that does not give `user`, `use(perTenant)` is a compile error:
[`the plugin reads "user", which this app's context does not give`](https://github.com/softistx/alxia/blob/develop/packages/core/docs/troubleshooting.md#the-plugin-reads--which-this-apps-context-does-not-give-add-the-plugin-or-middleware-that-gives-it-first),
or [`… gives with another type`](https://github.com/softistx/alxia/blob/develop/packages/core/docs/troubleshooting.md#the-plugin-reads--which-this-apps-context-gives-with-another-type)
when its `user` is not `{ tenantId: string }`.
See [Reading the app's context](guide/keys-and-vary.md#reading-the-apps-context).

To tag by what only the route knows — the product it loaded — tag from the
route with `ctx.cache.tag(…)` instead
([Invalidation](guide/invalidation.md#by-tag-invalidatetag)).

### `Type '(…) => Promise<string>' is not assignable to type '(ctx: BaseContext & Empty) => string | undefined'`

**When:** `key` is an `async` function.

```text
error TS2322: Type '({ url }: BaseContext & Empty) => Promise<string>' is not assignable to type '(ctx: BaseContext & Empty) => string | undefined'.
  Type 'Promise<string>' is not assignable to type 'string'.
```

**Why:** the key is computed on every request before the store is asked;
it is synchronous.

**Fix:** compute the key from the request alone. A route whose answer
needs a lookup — a session, a tenant from a database — is personal:
declare it before the cache, or answer `Cache-Control: private`
([Personal responses](guide/keys-and-vary.md#personal-responses)).

```ts
cache({ ttl: 60, key: ({ url }) => `${url.pathname}${url.search}` });
```

### `Type '(…) => string | null' is not assignable to type '(ctx: BaseContext & Empty) => string | undefined'`

**When:** `key` returns `request.headers.get(…)`, or anything else that may
be `null`.

```text
error TS2322: Type '({ request }: BaseContext & Empty) => string | null' is not assignable to type '(ctx: BaseContext & Empty) => string | undefined'.
  Type 'string | null' is not assignable to type 'string | undefined'.
    Type 'null' is not assignable to type 'string | undefined'.
```

**Why:** `undefined` is the key's "do not cache"; `null` is not accepted for
it.

**Fix:**

```ts
cache({ ttl: 60, key: ({ request }) => request.headers.get('x-tenant') ?? undefined });
```

### `Type '() => string' is not assignable to type '(ctx: BaseContext & Empty) => readonly string[]'`

**When:** `tags` returns one tag instead of a list.

```text
error TS2322: Type '() => string' is not assignable to type '(ctx: BaseContext & Empty) => readonly string[]'.
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

### `500 {"error":"internal"}` from a route that invalidates, with the store's error in the log

**When:** a write calls `invalidate(path)` or `invalidateTag(tag)` while
the store cannot answer — a Redis that is down, a store of your own with a
bug — and does not catch it.

**Why:** a lookup or a keep that fails is only logged — the cached route
still answers, `X-Cache: MISS` — but an invalidation rejects, so the code
that changed the data learns that the old responses may still be served.

**Fix:** bring the store back. Where the write must succeed regardless,
catch the invalidation, and keep `ttl` short —
[When the store cannot answer](guide/stores.md#when-the-store-cannot-answer):

```ts
await products.invalidateTag('products').catch((error) => console.error(error));
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
| the response says `Cache-Control: private` or `no-store` | intended: it is personal |
| its status is not in `statuses` (`[200]`) | `statuses: [200, 404]` |
| it is `text/event-stream` | intended: a stream is never kept |
| the route called `cache.skip()` | intended |
| it arrived while a concurrent request for the same key was answered with something not kept, or failed | intended: it ran the route itself, and the next request is a miss |
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
- **The store cannot answer**: its first error of the outage is in the log,
  and every request runs the route
  ([When the store cannot answer](guide/stores.md#when-the-store-cannot-answer)).

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

### A client that sent no `Accept-Encoding` gets gzip bytes

**When:** the cache is in front of `app.static(…, { precompressed })`, or of
any route whose answer depends on a request header, and that header is not
in `vary`. The first client asked with `Accept-Encoding: gzip`; the next
one, without it, gets `Content-Encoding: gzip` with `X-Cache: HIT`.

**Why:** the default key is built from the path, the query and `vary`
alone, and a `key` of your own from what it reads. The response's own
`Vary` is passed on to the client but not read by the cache.

**Fix:** name the header in `vary`, or read it in your `key`:

```ts
app.use(cache({ ttl: 60, vary: ['accept-encoding'] }))
	.static('/assets', './public', { precompressed: ['br', 'gzip'] });
```

### One visitor sees another visitor's page

**When:** a route that answers by who is asking — a `Cookie`, an
`Authorization` header — is behind the cache with the default key, and its
response says nothing about it. curl, with no cookie, shows nothing wrong;
a signed-in browser does.

**Why:** the default key is the path and query only. The first visitor's
response is kept, and served to everyone after.

**Fix:** say the response is personal — it is then never kept, nor handed
to a concurrent request:

```ts
app.get('/me', ({ reply }) =>
	reply(200, { name: 'Grace' }, { headers: { 'cache-control': 'private' } }),
);
```

Or declare the route before the cache, which also saves the lookup
([Personal responses](guide/keys-and-vary.md#personal-responses)).

Then empty what was already kept: `await products.invalidateTag(…)`, or
restart a process that uses the memory store.

### Old data after a write

**When:** a write calls `invalidate(path)` or `invalidateTag(tag)`, and a
read still answers the old response.

**Why:** the invalidation did not reach the key, or the store:

- `invalidate(path)` forgets the responses of that **exact** path and
  query, prefix included: `/products` is not `/products?page=2`, nor
  `/api/products`.
- A store of your own does not remember each response's `tags` in `set`:
  neither `invalidate` nor `invalidateTag` reaches anything.
- Two `cache()` without a `store` have **two memory stores**; invalidating
  through one does not touch the other.
- Several processes with the **memory store** each keep their own copy;
  the write's process is the only one emptied.

**Fix:** invalidate by tag — it reaches every query — on a store every
cache and process shares:

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
