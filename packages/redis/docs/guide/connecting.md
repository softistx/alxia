# Connecting

This page covers the one thing every export of `@alxia/redis` takes first:
a Bun `RedisClient`, how to open it, when to make the plugins with it, and
how to close it.

```ts
import { alxia } from '@alxia/core';
import { redis } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379');

const app = alxia()
	.plugin(redis(connection.client))
	.get('/ping', async ({ redis, reply }) => reply(200, await redis.ping()));

app.listen({ port: 3000 });
```

## The client

Every export takes Bun's own `RedisClient` as its first argument:

```ts
redisStore(client: RedisClient, options: RedisStoreOptions): RateLimitStore
redisCacheStore(client: RedisClient, options: RedisCacheStoreOptions): CacheStore
idempotency(client: RedisClient, options: IdempotencyOptions)    // a plugin
redis(client: RedisClient, options?: RedisContextOptions)        // a plugin
```

Any `RedisClient` will do. `connectRedis` from
[`@nxgt/redis`](https://www.npmjs.com/package/@nxgt/redis) is the usual
way: it shares one client per URI across the process, connects it once
even when two calls race, and gives back a `RedisConnection` with
`client`, `ping()` and `close()`. A client you open yourself works the
same:

```ts
import { redisStore } from '@alxia/redis';
import { RedisClient } from 'bun';

const client = new RedisClient(Bun.env['REDIS_URL']);
const store = redisStore(client, { name: 'api' });
```

One client is enough for the whole app: the rate-limit store, the cache
store, idempotency and `redis()` all send ordinary commands over it. None
of them subscribes, so none needs a connection of its own.

## Make the plugins after you connect

Each export binds the client it is given when it is called. Open the
connection first, then build the app:

```ts
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import { idempotency, redisStore } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

const app = alxia()
	.plugin(rateLimit({ limit: 100, windowMs: 60_000, store: redisStore(connection.client, { name: 'api' }) }))
	.plugin(idempotency(connection.client, { name: 'orders' }))
	.post('/orders', ({ reply }) => reply(201, { id: crypto.randomUUID() }));
```

In a test, that means building the app in `beforeAll`, once Redis is up —
see [Testing](testing.md).

## When Redis is down

`@alxia/redis` does not catch Redis's errors. A command that fails while a
request runs fails that request: the app answers
`500 {"error":"internal"}` and logs Bun's error, code
`ERR_REDIS_CONNECTION_CLOSED`: `Max reconnection attempts reached` for the
first command once Bun's client has given up reconnecting, then
`Connection has failed` for the ones after it
([troubleshooting](../troubleshooting.md#rediserror-connection-has-failed)).
A short outage recovers on its own while the client is still retrying;
after it has given up, do not count on it coming back — restart the process.
There is no fail-open mode: a rate limit that cannot count does not let the
request through, and an idempotent route that cannot take its key does not
run. The response cache is the exception, as `@alxia/cache` decides it: a
cached route whose `redisCacheStore` cannot answer runs and answers
`X-Cache: MISS`, with the outage's first error logged; only its
invalidations reject.

At startup, Bun's client reconnects by default, so a `connectRedis` to a
server that is not there keeps trying for about half a minute before it
rejects. For a check that should fail at once, pass `autoReconnect: false`:

```ts
import { connectRedis } from '@nxgt/redis';

try {
	const check = await connectRedis(Bun.env['REDIS_URL']!, { autoReconnect: false });
	await check.close();
} catch (error) {
	console.error('Redis is not reachable', error);
	process.exit(1);
}
```

`connectRedis` shares one client per URI, so every later call for the same
URI must pass the same options, or it throws
`TypeError: connectRedis: this URI is already connected with other options. Pass the same options everywhere, or close the first connection.` Close the
check before the app connects, as above, or pass the same options
everywhere.

`connection.ping()` never throws, and is a health route in one line:

```ts
import { alxia } from '@alxia/core';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

const app = alxia().get('/health', async ({ reply }) => {
	const redis = await connection.ping();
	return redis.ok ? reply(200, { redis: 'up', ms: redis.latencyMs }) : reply(503, { redis: 'down' });
});
```

## Closing

Nothing here listens to a signal. Close the connection when the process
stops:

```ts
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

process.on('SIGTERM', async () => {
	await connection.close();
	process.exit(0);
});
```

`closeRedis()` from `@nxgt/redis` closes every client the process opened
through `connectRedis` — the end of a test file, say.

## Naming keys

Every export that writes takes a `name`, prepended to its keys, so several
apps and several features can share one Redis:

| Export | Keys it writes |
| --- | --- |
| `redisStore(client, { name })` | `<name>:<limit>/<windowMs>:<key>`, and `<name>:policies` |
| `redisCacheStore(client, { name })` | `<name>:response:<key>`, and `<name>:tag:<tag>`, which expires with its longest-kept response |
| `idempotency(client, { name })` | `<name>:<route>:<scope>:<Idempotency-Key>` |
| `redis(client, { caches })` | each cache's own `<name>:<key>`, and `lock:<key>` |

Two features given the same `name` share their keys; give each its own.

## Next

- [Rate limits](rate-limits.md) — `redisStore`.
- [Response cache](response-cache.md) — `redisCacheStore`.
- [Idempotency](idempotency.md) — `idempotency`.
- [Caches and locks](caches-and-locks.md) — `redis`.
