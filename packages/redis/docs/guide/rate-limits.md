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
function redisStore(target: RedisClient | Redis<any>, options: RedisStoreOptions): RateLimitStore;
function redisStore(limit: BoundRateLimit<string>): RateLimitStore; // wired by defineRedis
function redisStore(limit: BoundRateLimit<string>, definition: RateLimitDefinition<string>): PolicyStore; // and its policy

interface RedisStoreOptions {
	/** Prepended to every key it counts: one name per limit, so two never share a count. */
	readonly name: string;
}
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `name` | `string` | required | the prefix of every key it writes: `<name>:<limit>/<windowMs>:<key>` for a count, and `<name>:policies` for the policies counted under the name |

`limit`, `windowMs`, the `key` counted (the client's address by default),
`skip` and the headers are `rateLimit`'s options, not the store's: see
`@alxia/rate-limit`'s guide. The 429 and its type are unchanged — a typed
`429 { error: 'rate_limited', retryAfter }` with `Retry-After`, the same as
with the memory store.

A limit wired by `defineRedis`, `redisStore(handle.limits.api)`, takes no
`name`: its definition holds the name and the rate, and the keys are
`<prefix>:<name>:<key>`, shared with every other `@nxgt/redis` consumer. See
[Defined once, in `defineRedis`](connecting.md#defined-once-in-defineredis).

### The rate, written once

`@nxgt/redis` 0.6 does not expose a bound limit's rate, so a store of the
bound limit alone cannot tell `rateLimit` what it counts by, and `limit` and
`windowMs` repeat the definition for the headers. Give the definition as the
second argument and the store declares it as its `policy`:

```ts
const api = defineRateLimit({ name: 'api', key: (ip: string) => ip, limit: 100, per: 60_000 });
const handle = await openRedis(defineRedis({ uri, prefix: 'shop', limits: { api } }));

app.use(rateLimit({ store: redisStore(handle.limits.api, api) })); // 100 per 60 s
```

`rateLimit` reads `limit` (the definition's `limit`) and `windowMs` (its
`per`) from the policy: the 429 and the `RateLimit-Limit`, `-Remaining`,
`-Reset` and `-Policy` headers come from the definition, and one place holds
the numbers. A `limit` or `windowMs` given too must equal them, or
`rateLimit()` throws at declaration. A definition that is not the one that
wired the limit — another `name` — is a `TypeError` from `redisStore`.
The definition's `burst`, when it sets one, still governs how many requests
pass at once; the policy states `limit` per `per`.

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

`rateLimit` refuses a `limit` or a `windowMs` that is not a whole number of
1 or more when it is created, with
[`TypeError: rateLimit: … must be a whole number of 1 or more, not …`](https://github.com/softistx/alxia/blob/develop/packages/rate-limit/docs/troubleshooting.md#typeerror-ratelimit--must-be-a-whole-number-of-1-or-more-not-).
`redisStore` checks two more bounds, `@nxgt/redis`'s, only when it
first counts under a policy, not when the app starts. A policy past either
makes the first request it counts, and every one after it, a
`500 {"error":"internal"}`, with the reason in the log — a refused policy
is not kept, so each request checks it again:

| Policy | Logged |
| --- | --- |
| `limit × windowMs` above 9,007,199,254,740 (about 9e12) | `TypeError: defineRateLimit: "api:1000000/31536000000" has a burst of 1000000 and a per of 31536000000ms; burst × per must be at most 9007199254740 for the script to count exactly` |
| `windowMs` above ten 365-day years, 315,360,000,000, with `limit × windowMs` inside the bound above | `TypeError: defineRateLimit: "api:1/315360000001" would take longer than ten years to refill from empty (burst × per ÷ limit); check that per is in milliseconds` |

`limit: 1_000, windowMs: 86_400_000` — a thousand a day — is well inside
both; a million a year is not. Troubleshooting has the fix for each:
[burst × per](../troubleshooting.md#typeerror-defineratelimit--has-a-burst-of--and-a-per-of-ms-burst--per-must-be-at-most-9007199254740-for-the-script-to-count-exactly)
and [ten years](../troubleshooting.md#typeerror-defineratelimit--would-take-longer-than-ten-years-to-refill-from-empty-burst--per--limit-check-that-per-is-in-milliseconds).

## Resetting a key

`store.reset(key)` forgets a key — after a successful login, say:

```ts
import { alxia, validate } from '@alxia/core';
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
		.post('/login', validate({ body: z.object({ name: z.string(), password: z.string() }) }), async ({ body, ip, reply }) => {
			if (passwords.get(body.name) !== body.password) {
				return reply(401, { error: 'invalid_credentials' as const });
			}
			if (ip !== undefined) await attempts.reset(ip);
			return reply(200, { name: body.name });
		}),
);
```

`reset` forgets the key under **every policy ever counted under the
store's `name`**, by any store object and any process: each policy is
recorded in a Redis set, `<name>:policies`, the first time a process counts
under it. So a process that only resets — an admin endpoint, a worker —
needs no count of its own:

```ts
import { redisStore } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

// Another process: the login limit above is counted elsewhere.
export async function unblock(ip: string) {
	await redisStore(connection.client, { name: 'login' }).reset(ip);
}
```

The policies set holds one short member per `limit`/`windowMs` pair and is
kept without an expiry. A name used for several policies over time — a
limit you tuned — keeps the old ones in it; `reset` then also deletes the
key under them, which costs a command each and nothing else.

## Next

- [Idempotency](idempotency.md) — and where to declare the rate limit
  relative to it.
- [Testing](testing.md) — specs against a real Redis.
