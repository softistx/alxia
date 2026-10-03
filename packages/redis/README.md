# @alxia/redis

Redis for [alxia](https://www.npmjs.com/package/@alxia/core), on
[`@nxgt/redis`](https://www.npmjs.com/package/@nxgt/redis) and
[`@nxgt/redis-guard`](https://www.npmjs.com/package/@nxgt/redis-guard) —
Bun's own Redis client, no driver, no dependency:

- `redisStore`: a rate-limit store every process shares;
- `idempotency`: routes that run once per `Idempotency-Key`;
- `redisCacheStore`: an `@alxia/cache` store every process shares;
- `redis`: the client, typed caches and a lock in the context.

```sh
bun add @alxia/redis @nxgt/redis @nxgt/redis-guard zod @alxia/core
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
import { alxia } from '@alxia/core';
import { idempotency } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';
import { z } from 'zod';

const connection = await connectRedis(Bun.env['REDIS_URL']!);
const Payment = z.object({ amount: z.number().int().positive() });

const app = alxia()
	.use(idempotency(connection.client, { name: 'payments', required: true }))
	.post('/payments', { body: Payment }, ({ body, reply }) =>
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

Every one is part of the guarded routes' types. Keys are scoped by the
route and by `scope(ctx)` — the client's address by default, a user id
when there is one — so two clients choosing the same key never see each
other's response. A replay never repeats `Set-Cookie`. Every response
below 500 is kept, a 4xx included: declare a rate limit or an auth check
**before** `idempotency`, or its refusal is replayed.

| option | default | |
| --- | --- | --- |
| `name` | required | names the stored keys |
| `ttl` | a day | seconds a response is replayed |
| `lease` | 10 s | milliseconds a running request holds its key, renewed while it runs |
| `wait` | 0 | milliseconds a repeat waits for the first before a 409 |
| `methods` | `POST`, `PATCH` | |
| `header` | `Idempotency-Key` | |
| `required` | `false` | |
| `scope` | the client's address | `(ctx) => string` |

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
	.use(redis(connection.client, { caches: { users } }))
	.get('/users/:id', async ({ caches, lock, params, reply }) => {
		const user = await caches.users.remember(params.id, () => loadUser(params.id)); // typed by User
		await lock(`user:${params.id}`, () => touch(user));
		return reply.ok(user);
	});
```

`caches.<name>` is `@nxgt/redis`'s bound cache; `redis` the client itself,
for everything else. It sits beside `@alxia/cache`'s `ctx.cache` — the
response cache's `{ tag, skip }` — without touching it, in either order.

## Testing

The package's specs run against `$REDIS_URL`, or a `redis-server` on
`$PATH` they start on a free port.

## API

| export | |
| --- | --- |
| `redisStore(client, { name })`, `RedisStoreOptions` | an `@alxia/rate-limit` store |
| `redisCacheStore(client, { name })`, `RedisCacheStoreOptions` | an `@alxia/cache` store |
| `idempotency(client, options)` | the plugin |
| `redis(client, { caches? })`, `RedisContextOptions` | the plugin: `redis`, `caches`, `lock` in the context |
| `IdempotencyOptions`, `IdempotencyErrorBody`, `RedisContext`, `BoundCaches` | its types |
| `AnyCache` | any cache definition: the constraint of a function generic over the caches it hands to `redis()` |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/redis/docs): a page per area — connecting, rate limits, the response cache, idempotency, caches and locks, and testing against a real Redis.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/redis/docs/troubleshooting.md): an error message, a refusal a client got, or a limit, cache or replay that does not behave as expected, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/redis/docs/roadmap.md): what is coming, and what is not planned.
