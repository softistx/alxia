# @alxia/redis

Redis for [alxia](https://www.npmjs.com/package/@alxia/core), on
[`@nxgt/redis`](https://www.npmjs.com/package/@nxgt/redis) —
Bun's own Redis client, no driver, no dependency:

- `redisStore`: a rate-limit store every process shares;
- `idempotency`: a middleware, so routes run once per `Idempotency-Key`;
- `redisCacheStore`: an `@alxia/cache` store every process shares;
- `redis`: the client, typed caches and a lock in the context;
- `redisCheck`: a readiness check for core's `health()`.

Each takes Bun's `RedisClient`, or an [`@nxgt/redis`](https://www.npmjs.com/package/@nxgt/redis) handle: see [With @nxgt/redis](#with-nxgtredis).

```sh
bun add @alxia/redis @nxgt/redis zod @alxia/core
bun add -d typescript
```

They are peers, with `@alxia/rate-limit` for `redisStore` and `@alxia/cache`
for `redisCacheStore`. **Bun 1.4 or
later**: Bun's `RedisClient` is what the nxgt packages run on.

## A shared rate limit

```ts
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import { redisStore } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

const app = alxia()
	.use(rateLimit({ limit: 100, windowMs: 60_000, store: redisStore(connection.client, { name: 'api' }) }))
	.get('/search', ({ reply }) => reply(200, []));
```

GCRA, in one atomic script, timed by the Redis server's clock: every
process behind the load balancer counts together, and a refused request
counts nothing. The 429 stays typed, as `@alxia/rate-limit` types it.
GCRA refills continuously: an idle client may send `limit` at once, then
one more every `windowMs / limit`.

## A shared response cache

```ts
import { cache } from '@alxia/cache';
import { alxia } from '@alxia/core';
import { redisCacheStore } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);
const products = cache({ ttl: 60, store: redisCacheStore(connection.client, { name: 'shop' }), tags: () => ['products'] });

const app = alxia()
	.post('/products', async ({ reply }) => {
		await products.invalidateTag('products');   // forgotten in every process
		return reply(201, { ok: true });
	})
	.use(products)
	.get('/products', ({ reply }) => reply(200, [{ id: '1', name: 'Kettle' }]));
```

Responses are `@nxgt/redis` cache records, checked by their schema when
read: one that no longer reads as a response is a miss. A tag is a Redis
set of the keys it names. A Redis that does not answer costs the cache, not
the response: the route runs, and the error is logged.

## Idempotent routes

```ts
import { alxia, validate } from '@alxia/core';
import { idempotency } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';
import { z } from 'zod';

const connection = await connectRedis(Bun.env['REDIS_URL']!);
const Payment = z.object({ amount: z.number().int().positive() });

const app = alxia()
	.use(idempotency(connection.client, { name: 'payments', required: true }))
	.post('/payments', validate({ body: Payment }), ({ body, reply }) =>
		reply(201, { id: crypto.randomUUID(), amount: body.amount }),
	);
```

A `POST` or `PATCH` with an `Idempotency-Key` runs once; every repeat gets
the first response back — status, headers, body — with
`Idempotent-Replayed: true`, from any process.

| case | answer |
| --- | --- |
| a repeat while the first runs | `409 { error: 'idempotency_in_progress', retryAfter }`, `Retry-After` |
| the same key, another request (method, path or body) | `422 { error: 'idempotency_key_reused' }` |
| a key that is not 1 to 255 printable ASCII characters | `400 { error: 'idempotency_key_invalid' }` |
| no key, with `required` | `400 { error: 'idempotency_key_missing' }` |
| the route answers a 5xx, or streams | answered, not kept: the key is free again |

Only the routes after the middleware answer them; a request no route matches
is not guarded: there is no route to scope its key by. What is kept is what the
route answers, an error's answer included. Keys are scoped by the
route and by `scope(ctx)` — the client's address by default, a user id
when there is one — so two clients choosing the same key never see each
other's response. A request with no scope — no address, no `scope` — runs
unguarded, nothing stored or replayed, and the middleware warns once. A replay never repeats `Set-Cookie`. Every response
below 500 is kept, a 4xx included: declare a rate limit or an auth check
**before** `idempotency`, or its refusal is replayed (`app.use` in
declaration order: the guard first, then `idempotency`).

| option | default | |
| --- | --- | --- |
| `name` | required | names the stored keys |
| `ttl` | a day | seconds a response is replayed |
| `lease` | 10 s | milliseconds a running request holds its key, renewed while it runs |
| `wait` | 0 | milliseconds a repeat waits for the first before a 409 |
| `methods` | `POST`, `PATCH` | |
| `header` | `Idempotency-Key` | |
| `required` | `false` | |
| `scope` | the client's address | `(ctx) => string \| undefined`; `undefined` runs the request unguarded |

## Caches and locks in the context

```ts
import { alxia } from '@alxia/core';
import { redis } from '@alxia/redis';
import { connectRedis, defineCache } from '@nxgt/redis';
import { z } from 'zod';

const connection = await connectRedis(Bun.env['REDIS_URL']!);
const User = z.object({ id: z.string(), name: z.string() });
const users = defineCache({ name: 'user', key: (id: string) => id, ttl: 300, schema: User });
const loadUser = async (id: string) => ({ id, name: 'Ada' });   // your database
const touch = async (user: z.infer<typeof User>) => user;

const app = alxia()
	.plugin(redis(connection.client, { caches: { users } }))
	.get('/users/:id', async ({ caches, lock, params, reply }) => {
		const user = await caches.users.remember(params.id, () => loadUser(params.id)); // typed by User
		await lock(`user:${params.id}`, () => touch(user));
		return reply.ok(user);
	});
```

`caches.<name>` is `@nxgt/redis`'s bound cache; `redis` the client itself,
for everything else. It sits beside `@alxia/cache`'s `ctx.cache` — the
response cache's `{ tag, skip }` — without touching it, in either order.

## With @nxgt/redis

Open the Redis once with `@nxgt/redis`'s `openRedis(defineRedis({ … }))` and
hand the handle to every export that takes a client: one `prefix` is in front
of every key of the deployment, and the handle closes with the app.

```ts
import { alxia, health } from '@alxia/core';
import { redis, redisCheck, redisStore } from '@alxia/redis';
import { rateLimit } from '@alxia/rate-limit';
import { defineCache, defineRedis, openRedis } from '@nxgt/redis';
import { z } from 'zod';

const users = defineCache({ name: 'user', key: (id: string) => id, ttl: 300, schema: z.object({ id: z.string(), name: z.string() }) });
const handle = await openRedis(defineRedis({ uri: Bun.env['REDIS_URL']!, prefix: 'shop', caches: { users } }));

const app = alxia()
	.use(rateLimit({ limit: 100, windowMs: 60_000, store: redisStore(handle, { name: 'api' }) })) // shop:api:…
	.plugin(redis(handle))                                   // caches typed from handle.cache; handle.close() in onStop
	.plugin(health({ checks: { redis: redisCheck(handle) } }))
	.get('/users/:id', async ({ caches, lock, params, reply }) =>
		reply.ok(await lock(params.id, () => caches.users.remember(params.id, () => ({ id: params.id, name: 'Ada' })))), // shop:user:…, lock:shop:…
	);
```

`redisStore`, `redisCacheStore` and `idempotency` take the handle where they
take a client, and put its `prefix` in front of their `name`: the keys are
`shop:api:…`, `shop:pages:response:…`, `shop:orders:…`. `redis(handle)` puts
`caches` (the handle's own bound caches), `lock` (under the prefix), `redis`
(the client) and `prefix` in the context, and closes the handle once when the
app stops, after the requests in flight finished: `redis(handle, { close: false })`
when something else closes it. The handle must wire one Redis instance.
The bare `RedisClient` forms are unchanged and add no prefix.

### Defined once, in `defineRedis`

With `@nxgt/redis` 0.6 the rate limit and the idempotency are wired by
`defineRedis` too (`limits`, `idempotency`), and `redisStore` and `idempotency`
take the wired entry, so the definition lives in one place and its types flow
through:

```ts
import { idempotency, idempotencyResult, redisStore } from '@alxia/redis';
import { defineIdempotency, defineRateLimit, defineRedis, openRedis } from '@nxgt/redis';

const api = defineRateLimit({ name: 'api', key: (ip: string) => ip, limit: 100, per: 60_000 });
const orders = defineIdempotency({ name: 'orders', key: (id: string) => id, ttl: 86_400, schema: idempotencyResult });
const wired = await openRedis(defineRedis({ uri: Bun.env['REDIS_URL']!, prefix: 'shop', limits: { api }, idempotency: { orders } }));

alxia()
	.use(rateLimit({ store: redisStore(wired.limits.api, api) }))                         // shop:api:<address>, 100 per 60 s from `api`
	.use(idempotency(wired.idempotency.orders, { required: true }))                       // shop:orders:<route>:<scope>:<key>
	.post('/orders', ({ reply }) => reply(201, { id: crypto.randomUUID() }));
```

The keys are those `@nxgt/redis` writes, `<prefix>:<name>:<key>`, so another
consumer calling `wired.limits.api.consume(address)` shares the count. The
rate, `ttl` and `lease` are the definition's. `redisStore(wired.limits.api, api)`,
given the definition, declares its rate as the store's `policy`, so `rateLimit`
needs no `limit` nor `windowMs` and writes its headers from it (one it is given
that differs throws at declaration); `redisStore(wired.limits.api)` alone has
no policy, and `rateLimit` then takes the numbers, which only write its
headers. The wired `idempotency` takes no `name`, `ttl` or `lease`. The limit's key takes a
string, and the idempotency's `schema` is `idempotencyResult`: another is a
compile error. A rate limit moved from `redisStore(handle, { name })` starts
its counts again, the layouts differing; an idempotency keeps its keys. Both
older forms stay. [More](docs/guide/connecting.md#defined-once-in-defineredis).

## Testing

The package's specs run against `$REDIS_URL`, or a `redis-server` on
`$PATH` they start on a free port.

## API

| export | |
| --- | --- |
| `redisStore(client \| handle, { name })`, `RedisStoreOptions` | an `@alxia/rate-limit` store |
| `redisStore(handle.limits.api)` | the same for a rate limit wired by `defineRedis` (`@nxgt/redis` 0.6): the definition holds the name and the rate, the keys are `<prefix>:<name>:<key>` |
| `redisStore(handle.limits.api, api)` | the same, given the definition: the store declares its `limit` and `per` as its `policy`, and `rateLimit({ store })` needs no `limit` nor `windowMs` |
| `redisCacheStore(client \| handle, { name })`, `RedisCacheStoreOptions` | an `@alxia/cache` store |
| `idempotency(client \| handle, options)` | the middleware, given to `app.use` |
| `idempotency(handle.idempotency.orders, options?)`, `WiredIdempotency`, `WiredIdempotencyOptions` | the same for an idempotency wired by `defineRedis`: its definition holds the `name`, `ttl` and `lease`, so the options take none of them |
| `idempotencyResult`, `IdempotencyResult` | the `schema` a wired idempotency given to `idempotency()` must have: the response it keeps |
| `redis(client, { caches? })`, `RedisContextOptions` | a plugin, given to `app.plugin`: `redis`, `caches`, `lock` in the context |
| `redis(handle, { close? })`, `RedisHandleOptions`, `RedisHandleContext` | the same from an `@nxgt/redis` handle: its typed caches, a prefixed `lock`, `prefix`; closes the handle in `onStop` unless `close: false` |
| `redisCheck(client \| handle, { timeout? })`, `RedisCheckOptions` | a check for core's `health({ checks })`: down when a Redis instance does not answer a `PING`; `timeout` bounds a handle's ping, a client's is bounded by `health({ timeout })` |
| `RedisTarget` | a client or a handle: what the factories above take |
| `IdempotencyOptions`, `IdempotencyErrorBody`, `RedisContext`, `BoundCaches` | its types |
| `IdempotencyMiddleware` | what `idempotency()` returns: a middleware that adds nothing, and may answer a 400, a 409 or a 422 |
| `AnyCache` | any cache definition: the constraint of a function generic over the caches it hands to `redis()` |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/redis/docs): a page per area — connecting, rate limits, the response cache, idempotency, caches and locks, and testing against a real Redis.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/redis/docs/troubleshooting.md): an error message, a refusal a client got, or a limit, cache or replay that does not behave as expected, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/redis/docs/roadmap.md): what is coming, and what is not planned.
- [Recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md): [Caching and rate limiting with Redis](https://github.com/softistx/alxia/blob/develop/docs/recipes/caching-and-rate-limiting.md), [Test an alxia app](https://github.com/softistx/alxia/blob/develop/docs/recipes/testing.md), [Health checks and graceful shutdown](https://github.com/softistx/alxia/blob/develop/docs/recipes/health-and-shutdown.md).
