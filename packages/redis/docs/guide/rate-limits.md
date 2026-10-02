# Rate limits

This page covers `redisStore`: an
[`@alxia/rate-limit`](https://www.npmjs.com/package/@alxia/rate-limit)
store that every process sharing a Redis counts in, and how it differs
from the memory store.

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

`@alxia/rate-limit` is an optional peer: install it beside this package to
use `redisStore`.

```sh
bun add @alxia/rate-limit
```

## The signature

```ts
function redisStore(client: RedisClient, options: RedisStoreOptions): RateLimitStore;

interface RedisStoreOptions {
	/** Prepended to every key it counts: one name per limit, so two never share a count. */
	readonly name: string;
}
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `name` | `string` | required | the prefix of every key it counts: `<name>:<limit>/<windowMs>:<key>` |

`limit`, `windowMs`, the `key` counted (the client's address by default),
`skip` and the headers are `rateLimit`'s options, not the store's: see
`@alxia/rate-limit`'s guide. The 429 and its type are unchanged — a typed
`429 { error: 'rate_limited', retryAfter }` with `Retry-After`, the same as
with the memory store.

## What changes with Redis

- **Every process counts together.** Behind a load balancer, a client gets
  `limit` requests in all, not `limit` per process; a restart forgets
  nothing.
- **It is GCRA, not a fixed window.** The memory store counts `limit`
  requests, then refuses until its window ends. `redisStore` refills
  continuously, at `limit` per `windowMs`, from a bucket that holds
  `limit`. A client that has been idle can send `limit` at once, then one
  more each `windowMs / limit`: in the first `windowMs` after an idle
  spell, up to `2 × limit − 1` requests pass, never more than `limit` at
  once.
- **The clock is the Redis server's**, not each process's, so processes
  whose clocks differ still agree.
- **A refused request counts nothing**, as with the memory store.

Measured with `limit: 5, windowMs: 2_000`: seven requests at once answer
five `200` then two `429`; one second later, two more pass.

```ts
import { expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import { redisStore } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

test('a full bucket, then a steady refill', async () => {
	await connection.client.send('FLUSHDB', []);
	const app = alxia({ ip: () => '1.2.3.4' })
		.use(rateLimit({ limit: 5, windowMs: 2_000, store: redisStore(connection.client, { name: 'demo' }) }))
		.get('/', ({ reply }) => reply(200, 'ok'));

	const burst = [];
	for (let i = 0; i < 7; i++) burst.push((await app.request('/')).status);
	expect(burst).toEqual([200, 200, 200, 200, 200, 429, 429]);

	await Bun.sleep(1_000);                                // half a window: 2.5 requests' worth
	expect((await app.request('/')).status).toBe(200);
});
```

If a hard ceiling per fixed window is a requirement, GCRA is not it: halve
`limit` and `windowMs` together to keep the rate and halve the burst.

## Choosing `name`

The key is `<name>:<limit>/<windowMs>:<key>`. Two `rateLimit`s with the
same `name` and the same `limit` and `windowMs` share one count; with a
different policy they do not. Give each limit its own name:

```ts
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import { redisStore } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

const app = alxia()
	.group('/auth', (auth) =>
		auth
			.use(rateLimit({ limit: 5, windowMs: 15 * 60_000, store: redisStore(connection.client, { name: 'login' }) }))
			.post('/login', ({ reply }) => reply(200, 'ok')),
	)
	.use(rateLimit({ limit: 100, windowMs: 60_000, store: redisStore(connection.client, { name: 'api' }) }))
	.get('/search', ({ reply }) => reply(200, []));
```

Every process must agree on `name`, `limit` and `windowMs`: the same three
are the same count.

## Policies Redis refuses

`limit` and `windowMs` are checked the first time a request is counted, not
when the app starts. A policy that cannot be counted exactly makes that
request, and every one after it, a `500 {"error":"internal"}`, with the
reason in the log:

| Policy | Logged |
| --- | --- |
| `windowMs` not a whole number (`1.5`) | `TypeError: defineRateLimit: "api:5/1.5" has a per of 1.5; it is a whole number of milliseconds, and must be at least 1` |
| `limit` below 1, or not whole | `TypeError: defineRateLimit: "api:0/1000" has a limit of 0; it is a whole number of requests, and must be at least 1` |
| `limit × windowMs` above 9,007,199,254,740 | `TypeError: defineRateLimit: "api:1000000/31536000000" has a burst of 1000000 and a per of 31536000000ms; burst × per must be at most 9007199254740 for the script to count exactly` |

`limit: 1_000, windowMs: 86_400_000` — a thousand a day — is well inside
the last bound; a million a year is not.

## Resetting a key

`store.reset(key)` forgets a key — after a successful login, say:

```ts
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import { redisStore } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';
import { z } from 'zod';

const connection = await connectRedis(Bun.env['REDIS_URL']!);
const attempts = redisStore(connection.client, { name: 'login' });
const passwords = new Map([['ada', 'lovelace']]);

const app = alxia().group('/auth', (auth) =>
	auth
		.use(rateLimit({ limit: 5, windowMs: 15 * 60_000, store: attempts }))
		.post('/login', { body: z.object({ name: z.string(), password: z.string() }) }, async ({ body, ip, reply }) => {
			if (passwords.get(body.name) !== body.password) {
				return reply(401, { error: 'invalid_credentials' as const });
			}
			if (ip !== undefined) await attempts.reset(ip);
			return reply(200, { name: body.name });
		}),
);
```

`reset` forgets the key under each policy **this store object has counted
since the process started**. Called from the same store the limit counts
with, as above, it always works. Called from another store object, or
from a process that has not counted that policy yet, it forgets nothing
([troubleshooting](../troubleshooting.md#reset-forgets-nothing-and-the-client-is-still-refused)).

## Next

- [Idempotency](idempotency.md) — and where to declare the rate limit
  relative to it.
- [Testing](testing.md) — specs against a real Redis.
