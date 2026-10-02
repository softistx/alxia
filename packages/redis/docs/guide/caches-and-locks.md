# Caches and locks

This page covers `redis`: a plugin that puts the client, typed caches and a
lock in the context of every route declared after it.

```ts
import { alxia } from '@alxia/core';
import { redis } from '@alxia/redis';
import { connectRedis, defineCache } from '@nxgt/redis';
import { z } from 'zod';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

const User = z.object({ id: z.string(), name: z.string() });
const users = defineCache({ name: 'user', key: (id: string) => id, ttl: 300, schema: User });

const loadUser = async (id: string) => ({ id, name: 'Ada' });   // your database

const app = alxia()
	.use(redis(connection.client, { caches: { users } }))
	.get('/users/:id', async ({ cache, params, reply }) => {
		const user = await cache.users.remember(params.id, () => loadUser(params.id));   // typed by User
		return reply(200, user);
	});
```

## The signature

```ts
function redis<Caches>(client: RedisClient, options?: RedisContextOptions<Caches>);  // a plugin

interface RedisContextOptions<Caches> {
	/** `@nxgt/redis` cache definitions, by the name routes read them under. */
	readonly caches?: Caches;
}

/** What routes after `redis()` read. */
interface RedisContext<Caches> {
	readonly redis: RedisClient;
	readonly cache: BoundCaches<Caches>;
	lock<T>(key: string, work: () => Promise<T> | T, options?: LockOptions): Promise<T>;
}
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `caches` | `Record<string, CacheDefinition>` | none | each definition, bound to the client once, under `ctx.cache.<name>` |

| In the context | What it is |
| --- | --- |
| `redis` | Bun's `RedisClient`, untouched: every command Bun has |
| `cache.<name>` | the `@nxgt/redis` `BoundCache` of that definition, typed by its schema |
| `lock(key, work, options?)` | `@nxgt/redis`'s `withLock`: `work` under a lock every process respects |

The caches are bound when `redis(…)` is called, not per request.

## Caches

A cache is described with `defineCache` from `@nxgt/redis` — a `name`, a
`key` function, a `ttl` in **seconds**, and a zod `schema` — and read under
the name you give it in `caches`:

| `cache.<name>` | |
| --- | --- |
| `get(params)` | the value, or `undefined`: a miss, an expiry, or a stored value the schema no longer accepts |
| `set(params, value, { ttl }?)` | checks `value` against the schema, then stores it |
| `remember(params, load, { ttl }?)` | the value if it is there; otherwise what `load` gives, stored |
| `delete(params)` | `true` when something was there |
| `keyFor(params)` | the Redis key it uses: `<name>:<key(params)>` |

A realistic case, a profile read through the cache and forgotten on write:

```ts
import { alxia } from '@alxia/core';
import { redis } from '@alxia/redis';
import { connectRedis, defineCache } from '@nxgt/redis';
import { z } from 'zod';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

const Profile = z.object({ id: z.string(), name: z.string(), plan: z.enum(['free', 'pro']).default('free') });
const profiles = defineCache({ name: 'profile', key: (id: string) => id, ttl: 600, schema: Profile });
const table = new Map<string, z.input<typeof Profile>>([['1', { id: '1', name: 'Ada' }]]);

const app = alxia()
	.use(redis(connection.client, { caches: { profiles } }))
	.get('/profiles/:id', async ({ cache, params, reply }) => {
		const profile = await cache.profiles.remember(params.id, async () => table.get(params.id) ?? { id: params.id, name: '?' });
		return reply(200, profile);                       // plan is filled in: 'free'
	})
	.put('/profiles/:id', { body: Profile.omit({ id: true }) }, async ({ cache, params, body, reply }) => {
		table.set(params.id, { id: params.id, ...body });
		await cache.profiles.delete(params.id);           // the next read loads it again
		return reply(204, undefined);
	});
```

`remember` holds no lock: two requests missing at once both call `load`.
Wrap it in `lock` where loading is expensive or must happen once. The
caches' errors, their schemas and their traps are `@nxgt/redis`'s: see its
documentation.

## Locks

`lock(key, work, options?)` takes `lock:<key>` in Redis, runs `work`, and
releases the lock — only if it still holds it.

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `ttl` | `number` | `30_000` | **milliseconds** the lock is held before Redis drops it |
| `wait` | `number` | `0` | milliseconds to keep trying to take a held lock |
| `retryDelay` | `number` | `50` | milliseconds between tries |

A lock that is held, or that expires before `work` returns, throws a
`RedisError`. Uncaught, the route answers `500 {"error":"internal"}`; catch
it to answer something better:

```ts
import { alxia } from '@alxia/core';
import { redis } from '@alxia/redis';
import { connectRedis, RedisError } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

const sendInvoices = async () => 12;   // the work that must not run twice at once

const app = alxia()
	.use(redis(connection.client))
	.post('/invoices/run', async ({ lock, reply }) => {
		try {
			const sent = await lock('invoices', sendInvoices, { ttl: 60_000 });
			return reply(200, { sent });
		} catch (error) {
			if (error instanceof RedisError && error.code === 'LOCK_HELD') {
				return reply(409, { error: 'already_running' as const });
			}
			throw error;
		}
	});
```

| `error.code` | When | Message |
| --- | --- | --- |
| `LOCK_HELD` | someone else holds it, and `wait` ran out | ``The lock "invoices" is held by somebody else, and this call did not wait for it — pass `wait` to keep trying`` |
| `LOCK_LOST` | `work` returned after `ttl` had passed | `The lock "invoices" expired before its work finished: it ran longer than the 60000ms ttl, so it may have run beside another holder` |

`LOCK_HELD` means nothing ran. `LOCK_LOST` means `work` did run, possibly
beside another holder: size `ttl` above the slowest run you accept.

## The client

`redis` is Bun's `RedisClient`, for every command the plugin does not wrap:

```ts
import { alxia } from '@alxia/core';
import { redis } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

const app = alxia()
	.use(redis(connection.client))
	.post('/articles/:id/views', async ({ redis, params, reply }) => {
		const views = await redis.incr(`views:${params.id}`);
		return reply(200, { views });
	});
```

## With `@alxia/cache`: two plugins named `cache`

`@alxia/cache`'s `cache()` also adds `cache` to the context — its
`{ tag, skip }` controls. Used on the same routes, the plugin declared
later replaces the other's `cache` at runtime, while the types merge both,
so the route compiles and fails when it runs:

- `redis()` after `cache()`: `cache.tag(…)` throws
  `TypeError: cache.tag is not a function`;
- `cache()` after `redis()`: `cache.users.get(…)` throws
  `TypeError: undefined is not an object (evaluating 'cache.users.get')`.

Either way the route answers `500 {"error":"internal"}`. Rename the Redis
caches with a `derive` between the two:

```ts
import { cache } from '@alxia/cache';
import { alxia } from '@alxia/core';
import { redis } from '@alxia/redis';
import { connectRedis, defineCache } from '@nxgt/redis';
import { z } from 'zod';

const connection = await connectRedis(Bun.env['REDIS_URL']!);
const users = defineCache({ name: 'user', key: (id: string) => id, ttl: 300, schema: z.object({ id: z.string(), name: z.string() }) });
const loadUser = async (id: string) => ({ id, name: 'Ada' });

const app = alxia()
	.use(redis(connection.client, { caches: { users } }))
	.derive(({ cache }) => ({ caches: cache }))     // the Redis caches, renamed
	.use(cache({ ttl: 60 }))                        // `cache` is now the response cache
	.get('/users/:id', async ({ caches, cache, params, reply }) => {
		cache.tag(`user:${params.id}`);
		return reply(200, await caches.users.remember(params.id, () => loadUser(params.id)));
	});
```

`@alxia/cache`'s troubleshooting has the
[same entry](https://github.com/softistx/alxia/blob/develop/packages/cache/docs/troubleshooting.md#typeerror-cachetag-is-not-a-function-in-cachetag-cachetag-is-undefined)
from its side.

## Next

- [Connecting](connecting.md) — the client, and closing it.
- [Testing](testing.md) — a route with a cache, in a spec.
- [`@nxgt/redis`](https://www.npmjs.com/package/@nxgt/redis) — caches,
  locks and pub/sub in full.
