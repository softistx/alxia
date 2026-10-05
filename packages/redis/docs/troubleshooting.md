# Troubleshooting

Each entry is headed by the text you see: a TypeScript error, an exception
at startup, an exception in the log beside a `500 {"error":"internal"}`, or
the response a client got. `@alxia/redis` throws almost nothing of its own: the
messages are `@nxgt/redis`'s and Bun's, and it lets
each through; its own refusals, a handle of several instances, a wired guard given a
`name`, `ttl` or `lease`, or a client given without a `name`, say what to pass instead. It prints one warning of its own, under
[Runtime: a warning in the log](#runtime-a-warning-in-the-log). What prints nothing is under [Traps](#traps), by symptom.

**Install and types**

- [`error TS2307: Cannot find module '@alxia/rate-limit' or its corresponding type declarations.`](#error-ts2307-cannot-find-module-alxiarate-limit-or-its-corresponding-type-declarations)
- [`error TS2307: Cannot find module '@alxia/cache' or its corresponding type declarations.`](#error-ts2307-cannot-find-module-alxiacache-or-its-corresponding-type-declarations)
- [`Property 'cache' does not exist on type '… & RedisContext<…> …'`](#property-cache-does-not-exist-on-type---rediscontext-)
- [`Property '…' does not exist on type 'CacheControls'`](#property--does-not-exist-on-type-cachecontrols)

**Startup**

- [`TypeError: defineIdempotency: "…" has a ttl of …; it is a whole number of seconds, and must be at least 1`](#typeerror-defineidempotency--has-a-ttl-of--it-is-a-whole-number-of-seconds-and-must-be-at-least-1)
- [`TypeError: defineIdempotency: "…" has a lease of …; it is a whole number of milliseconds, and must be at least 1`](#typeerror-defineidempotency--has-a-lease-of--it-is-a-whole-number-of-milliseconds-and-must-be-at-least-1)
- [`TypeError: defineIdempotency: an idempotent operation needs a name, for its keys`](#typeerror-defineidempotency-an-idempotent-operation-needs-a-name-for-its-keys)
- [`RedisError: Connection closed`](#rediserror-connection-closed)
- [`TypeError: connectRedis: this URI is already connected with other options. Pass the same options everywhere, or close the first connection.`](#typeerror-connectredis-this-uri-is-already-connected-with-other-options-pass-the-same-options-everywhere-or-close-the-first-connection)

- [`TypeError: @alxia/redis: this @nxgt/redis handle wires N Redis instances (…), and one is needed.`](#typeerror-alxiaredis-this-nxgtredis-handle-wires-n-redis-instances--and-one-is-needed)
- [`TypeError: defineRedis: instance "default" wires no cache, no channel, no rate limit and no idempotency. Pass the module that exports them, or drop the instance.`](#typeerror-defineredis-instance-default-wires-no-cache-no-channel-no-rate-limit-and-no-idempotency-pass-the-module-that-exports-them-or-drop-the-instance)
- [`TypeError: defineRedis: instance "default" wires the cache "users" and the rate limit "login" under one name, "user". They would share every key in Redis. Give one of them a name of its own.`](#typeerror-defineredis-instance-default-wires-the-cache-users-and-the-rate-limit-login-under-one-name-user-they-would-share-every-key-in-redis-give-one-of-them-a-name-of-its-own)

**Runtime: a 500, with this in the log**

- [`TypeError: defineRateLimit: "…" has a burst of … and a per of …ms; burst × per must be at most 9007199254740 for the script to count exactly`](#typeerror-defineratelimit--has-a-burst-of--and-a-per-of-ms-burst--per-must-be-at-most-9007199254740-for-the-script-to-count-exactly)
- [`TypeError: defineRateLimit: "…" would take longer than ten years to refill from empty (burst × per ÷ limit); check that per is in milliseconds`](#typeerror-defineratelimit--would-take-longer-than-ten-years-to-refill-from-empty-burst--per--limit-check-that-per-is-in-milliseconds)
- [`TypeError: run on "…": wait is a whole number of milliseconds, 0 or more`](#typeerror-run-on--wait-is-a-whole-number-of-milliseconds-0-or-more)
- [`RedisError: Connection has failed`](#rediserror-connection-has-failed)
- [`GuardError: run on "…": the key was taken from this run before it finished (forgotten, or its lease of …ms went unrenewed), so a repeat may have run it too; its result was not stored`](#guarderror-run-on--the-key-was-taken-from-this-run-before-it-finished-forgotten-or-its-lease-of-ms-went-unrenewed-so-a-repeat-may-have-run-it-too-its-result-was-not-stored)
- [``RedisError: The lock "…" is held by somebody else, and this call did not wait for it — pass `wait` to keep trying``](#rediserror-the-lock--is-held-by-somebody-else-and-this-call-did-not-wait-for-it--pass-wait-to-keep-trying)
- [`RedisError: The lock "…" expired before its work finished: it ran longer than the …ms ttl, so it may have run beside another holder`](#rediserror-the-lock--expired-before-its-work-finished-it-ran-longer-than-the-ms-ttl-so-it-may-have-run-beside-another-holder)
- [`TypeError: undefined is not an object (evaluating 'cache.…')`](#typeerror-undefined-is-not-an-object-evaluating-cache)

**Runtime: a warning in the log**

- [`idempotency "…": no client scope could be derived (ctx.ip is undefined and no scope option returned one), so these requests run unguarded, nothing stored or replayed. Pass a scope option, (ctx) => a user id, or an ip option to alxia().`](#idempotency--no-client-scope-could-be-derived-ctxip-is-undefined-and-no-scope-option-returned-one-so-these-requests-run-unguarded-nothing-stored-or-replayed-pass-a-scope-option-ctx--a-user-id-or-an-ip-option-to-alxia)

**Calling the store yourself**

- [`TypeError: defineRateLimit: "…" has a per of …; it is a whole number of milliseconds, and must be at least 1`](#typeerror-defineratelimit--has-a-per-of--it-is-a-whole-number-of-milliseconds-and-must-be-at-least-1)
- [`TypeError: defineRateLimit: "…" has a limit of …; it is a whole number of requests, and must be at least 1`](#typeerror-defineratelimit--has-a-limit-of--it-is-a-whole-number-of-requests-and-must-be-at-least-1)

**Responses**

- [`400 {"error":"idempotency_key_missing"}`](#400-erroridempotency_key_missing)
- [`400 {"error":"idempotency_key_invalid"}`](#400-erroridempotency_key_invalid)
- [`409 {"error":"idempotency_in_progress","retryAfter":10}`](#409-erroridempotency_in_progressretryafter10)
- [`422 {"error":"idempotency_key_reused"}`](#422-erroridempotency_key_reused)

**Traps**

- [A rate limit lets more than `limit` requests through](#a-rate-limit-lets-more-than-limit-requests-through)
- [Two limits count each other's requests](#two-limits-count-each-others-requests)
- [A `401` or a `429` is replayed, with `Idempotent-Replayed: true`, after the client fixed it](#a-401-or-a-429-is-replayed-with-idempotent-replayed-true-after-the-client-fixed-it)
- [One client gets another client's response](#one-client-gets-another-clients-response)
- [Counts and kept responses vanish after moving to a handle with a `prefix`](#counts-and-kept-responses-vanish-after-moving-to-a-handle-with-a-prefix)
- [Counts restart after moving a rate limit to the wired form](#counts-restart-after-moving-a-rate-limit-to-the-wired-form)
- [The handle is closed while something still uses it](#the-handle-is-closed-while-something-still-uses-it)

## Install and types

### `error TS2307: Cannot find module '@alxia/rate-limit' or its corresponding type declarations.`

**When:** typechecking an app that uses `@alxia/redis` without
`@alxia/rate-limit` installed, with `skipLibCheck` off. The error points
into `node_modules/@alxia/redis/dist/store.d.ts`.

**Why:** `@alxia/rate-limit` is an optional peer: `redisStore` returns its
`RateLimitStore` type. Nothing loads it at run time, so the app runs; only
`tsc` reads the declaration.

**Fix:** install it, or turn `skipLibCheck` on:

```sh
bun add @alxia/rate-limit
```

### `error TS2307: Cannot find module '@alxia/cache' or its corresponding type declarations.`

**When:** the same, for `@alxia/cache`, pointing into
`node_modules/@alxia/redis/dist/cache-store.d.ts`.

**Why:** `redisCacheStore` returns `@alxia/cache`'s `CacheStore` type.

**Fix:**

```sh
bun add @alxia/cache
```

### `Property 'cache' does not exist on type '… & RedisContext<…> …'`

**When:** a route behind `redis()` reads its typed caches as `cache` —
`({ cache }) => cache.users.remember(…)`, the name they had before
`caches`.

```text
error TS2339: Property 'cache' does not exist on type 'Omit<BaseContext, "reply"> & Empty & RedisContext<{ readonly users: CacheDefinition<string, ZodObject<…>>; }> & { …; }'.
```

A `derive(({ cache }) => ({ caches: cache }))` written to keep them apart
from `@alxia/cache`'s `cache` fails the same way, on the `derive`:

```text
error TS2339: Property 'cache' does not exist on type 'BaseContext & Empty & RedisContext<{ readonly users: CacheDefinition<string, ZodObject<…>>; }>'.
```

**Why:** `redis()` puts its caches in the context as `caches`, so that they
never meet `@alxia/cache`'s `cache`.

**Fix:** read `caches`, and drop the `derive`:

```ts
alxia()
	.plugin(redis(connection.client, { caches: { users } }))
	.get('/users/:id', async ({ caches, params, reply }) =>
		reply.ok(await caches.users.remember(params.id, () => loadUser(params.id))),
	);
```

### `Property '…' does not exist on type 'CacheControls'`

**When:** the same old name, on a route behind both `redis()` and
`@alxia/cache`'s `cache()`.

```text
error TS2339: Property 'users' does not exist on type 'CacheControls'.
```

**Why:** `ctx.cache` is the response cache's `{ tag, skip }`; the Redis
caches are `ctx.caches`.

**Fix:** `caches.users`, as above
([With `@alxia/cache`](guide/caches-and-locks.md#with-alxiacache)).

## Startup

### `TypeError: defineIdempotency: "…" has a ttl of …; it is a whole number of seconds, and must be at least 1`

**When:** calling `idempotency(client, { name, ttl })` with a `ttl` of 0,
below 0, or with a fraction — often milliseconds divided by 1000.

```text
TypeError: defineIdempotency: "payments" has a ttl of 1.5; it is a whole number of seconds, and must be at least 1
```

**Why:** `ttl` is how long a finished response is replayed, in whole
**seconds**, Redis's own unit for an expiry.

**Fix:**

```ts
idempotency(connection.client, { name: 'payments', ttl: 86_400 });   // a day
```

### `TypeError: defineIdempotency: "…" has a lease of …; it is a whole number of milliseconds, and must be at least 1`

**When:** `lease` is 0, below 0, or has a fraction.

```text
TypeError: defineIdempotency: "payments" has a lease of 500.5; it is a whole number of milliseconds, and must be at least 1
```

**Why:** `lease` is in whole **milliseconds** — unlike `ttl`.

**Fix:**

```ts
idempotency(connection.client, { name: 'payments', lease: 30_000 });  // 30 s
```

### `TypeError: defineIdempotency: an idempotent operation needs a name, for its keys`

**When:** `idempotency(client, { name: '' })` — a name read from an
environment variable that is not set, say.

**Why:** `name` prefixes every key it stores; an empty one would share keys
with anything else in the Redis.

**Fix:** give it a fixed name:

```ts
idempotency(connection.client, { name: 'payments' });
```

### `RedisError: Connection closed`

**When:** `await connectRedis(url)` at startup, with no Redis listening at
`url`. With Bun's default reconnects it rejects after about half a
minute; with `autoReconnect: false`, at once.

```text
RedisError [ERR_REDIS_CONNECTION_CLOSED]: Connection closed
```

**Why:** Bun's client could not reach the server. `REDIS_URL` is unset —
Bun then tries `localhost:6379` — or points at the wrong host or port, or
the server is not up yet.

**Fix:** check the URL, and fail fast where a startup check should:

```ts
const connection = await connectRedis(Bun.env['REDIS_URL']!, { autoReconnect: false });
```

See [Connecting](guide/connecting.md#when-redis-is-down), and the next
entry before you mix options.

### `TypeError: connectRedis: this URI is already connected with other options. Pass the same options everywhere, or close the first connection.`

**When:** a startup check calls `connectRedis(url, { autoReconnect: false })`
and the app later calls `connectRedis(url)` for the same URL.

**Why:** `connectRedis` shares one client per URI, and refuses to hand out
a client opened with other options than those asked for.

**Fix:** close the check before the app connects, or pass the same options
everywhere:

```ts
const check = await connectRedis(Bun.env['REDIS_URL']!, { autoReconnect: false });
await check.close();
const connection = await connectRedis(Bun.env['REDIS_URL']!);
```

### `TypeError: @alxia/redis: this @nxgt/redis handle wires N Redis instances (…), and one is needed.`

**When:** a handle wiring several instances is given to `redis()`,
`redisStore`, `redisCacheStore`, `idempotency` or `redisCheck`, at startup.

**Why:** the keys of one deployment live on one Redis; which of several is
meant is not guessed.

**Fix:** give the bare client of the one, with the prefix in the `name`:

```ts
redisStore(handle.clients.cache, { name: 'shop:api' });
```

or wire one instance per handle.

### `TypeError: defineRedis: instance "default" wires no cache, no channel, no rate limit and no idempotency. Pass the module that exports them, or drop the instance.`

**When:** `defineRedis({ uri, prefix })` is written only to give the stores
and `idempotency` a prefix. `@nxgt/redis` 0.5 said `wires no cache and no
channel`; 0.6 counts the rate limits and the idempotency it can now wire too.

**Why:** `@nxgt/redis` refuses a handle that wires nothing.

**Fix:** wire at least one of the four on it: a cache, which `redis(handle)`
then puts in the context as `caches`, a channel, a rate limit or an idempotency:

```ts
defineRedis({ uri, prefix: 'shop', caches: { users } });
defineRedis({ uri, prefix: 'shop', limits: { api } });
```

### `TypeError: defineRedis: instance "default" wires the cache "users" and the rate limit "login" under one name, "user". They would share every key in Redis. Give one of them a name of its own.`

**When:** the `defineRedis(...)` of an app that gives `caches`, `limits` and
`idempotency` one `name` on one instance: here the cache exported as `users`
and the rate limit exported as `login`, both named `user`. The sentence says
which two, and the export keys they are wired under. It is thrown at wiring
time, before the app serves; with the same kind twice it reads `wires the rate
limit named "user" twice, under "a" and "b"`.

**Why:** a cache, a rate limit and an idempotency all write
`<prefix>:<name>:<key>`, so one name is one keyspace, and they would
overwrite each other's values or meet as `WRONGTYPE`. The same wiring that lets
`redisStore(handle.limits.login)` and `idempotency(handle.idempotency.orders)`
write the layout `@nxgt/redis` writes refuses the clash.

**Fix:** rename one: the **definition's** `name`, not its export:

```ts
export const login = defineRateLimit({ name: 'login.limit', key: (ip: string) => ip, limit: 5, per: 60_000 });
```

## Runtime: a 500, with this in the log

Each of these makes the request answer `500 {"error":"internal"}`; the
message is in the app's log.

### `TypeError: defineRateLimit: "…" has a burst of … and a per of …ms; burst × per must be at most 9007199254740 for the script to count exactly`

**When:** every counted request, with a large `limit` over a long
`windowMs`: `limit × windowMs` above 9,007,199,254,740 (about 9e12) — a
million a year. `rateLimit` starts without complaint.

```text
TypeError: defineRateLimit: "api:1000000/31536000000" has a burst of 1000000 and a per of 31536000000ms; burst × per must be at most 9007199254740 for the script to count exactly
```

**Why:** the script counts in exact integers; `limit × windowMs` past that
bound would lose precision. `redisStore` hands each policy to
`@nxgt/redis` when it first counts under it, and a refused policy is
not kept, so it is checked again, and refused again, on each request.

**Fix:** state the same rate over a shorter window:

```ts
rateLimit({ limit: 2_740, windowMs: 86_400_000, store: redisStore(connection.client, { name: 'api' }) });  // ~a million a year
```

### `TypeError: defineRateLimit: "…" would take longer than ten years to refill from empty (burst × per ÷ limit); check that per is in milliseconds`

**When:** every counted request, with a `windowMs` above 315,360,000,000
(ten 365-day years) while `limit × windowMs` is still at most
9,007,199,254,740 — so a `limit` of 28 or less. Past that, the entry
above is hit first.

```text
TypeError: defineRateLimit: "api:1/315360000001" would take longer than ten years to refill from empty (burst × per ÷ limit); check that per is in milliseconds
```

**Why:** `redisStore` sets the guard's burst to `limit`, so the time to
refill from empty is `windowMs` itself. The guard refuses one over ten
years: it is far more often a window written in the wrong unit than a
limit anyone means. As above, nothing is checked at startup, and the
refused policy is checked again on each request.

**Fix:** `windowMs` in milliseconds, at most ten years:

```ts
rateLimit({ limit: 1, windowMs: 365 * 86_400_000, store: redisStore(connection.client, { name: 'trial' }) });  // once a year
```

For "once, ever", a rate limit is the wrong tool: record that it happened.

### `TypeError: run on "…": wait is a whole number of milliseconds, 0 or more`

**When:** every guarded request, when `idempotency` was given a `wait`
with a fraction or below 0.

```text
TypeError: run on "payments": wait is a whole number of milliseconds, 0 or more
```

**Why:** `wait` is checked when it is used, not when the middleware is made.

**Fix:**

```ts
idempotency(connection.client, { name: 'payments', wait: 2_000 });
```

### `RedisError: Connection has failed`

**When:** any request that reaches Redis while it is unreachable — a
counted request, a guarded route, a `caches.<name>` or a `lock`, or a call
to the response cache's `invalidate` or `invalidateTag`. The first command
to fail once Bun's client has given up reconnecting logs
`Max reconnection attempts reached`; the calls after it log
`Connection has failed`:

```text
RedisError [ERR_REDIS_CONNECTION_CLOSED]: Max reconnection attempts reached
RedisError: Connection has failed
 code: "ERR_REDIS_CONNECTION_CLOSED"
```

**Why:** `@alxia/redis` does not catch Redis's errors: a rate limit does
not let the request through uncounted, and an idempotent route does not
run unguarded. The response cache is the exception, as `@alxia/cache`
decides it: a cached route whose store cannot answer runs and answers
`X-Cache: MISS`, with the outage's first error logged — only its invalidations
reject.

**Fix:** bring Redis back. Bun's client reconnects on its own while it is
still retrying — a short outage of a few seconds recovers without a
restart — but once it has logged `Max reconnection attempts reached`, do
not count on the same client coming back: `connection.ping()` tells you
whether it answers, and restarting the process is the way back that is
sure.

### `GuardError: run on "…": the key was taken from this run before it finished (forgotten, or its lease of …ms went unrenewed), so a repeat may have run it too; its result was not stored`

**When:** a guarded route that blocks the event loop longer than `lease`
(10 s by default) — a synchronous loop, `Bun.sleepSync`, a large
synchronous parse.

```text
GuardError: run on "payments": the key was taken from this run before it finished (forgotten, or its lease of 10000ms went unrenewed), so a repeat may have run it too; its result was not stored
 definition: "payments",
       code: "LEASE_LOST"
```

**Why:** the lease is renewed by a timer every third of `lease`; while the
event loop is blocked, the timer cannot fire. Once the lease lapsed, a
repeat could take the key and run the route again — so the route may have
run twice, and neither response is kept.

**Fix:** yield inside long synchronous work, or move it to a `Worker`; or
raise `lease` above the longest block:

```ts
idempotency(connection.client, { name: 'reports', lease: 60_000 });
```

### ``RedisError: The lock "…" is held by somebody else, and this call did not wait for it — pass `wait` to keep trying``

**When:** `lock(key, work)` while another request or process holds `key`.
With `wait`, the message ends `and …ms was not long enough to wait for it`.

```text
RedisError: The lock "invoices" is held by somebody else, and this call did not wait for it — pass `wait` to keep trying
  key: "lock:invoices",
 code: "LOCK_HELD"
```

**Why:** a lock refuses at once by default. Nothing ran.

**Fix:** wait for it, or answer the refusal yourself
([Locks](guide/caches-and-locks.md#locks)):

```ts
await lock('invoices', sendInvoices, { wait: 5_000 });
```

### `RedisError: The lock "…" expired before its work finished: it ran longer than the …ms ttl, so it may have run beside another holder`

**When:** `work` took longer than the lock's `ttl` (30 s by default).

```text
RedisError: The lock "lost" expired before its work finished: it ran longer than the 100ms ttl, so it may have run beside another holder
  key: "lock:lost",
 code: "LOCK_LOST"
```

**Why:** Redis dropped the lock at `ttl`, so another holder may have taken
it while `work` still ran. `work` did finish; its result is lost to the
throw.

**Fix:** size `ttl` above the slowest run you accept:

```ts
await lock('invoices', sendInvoices, { ttl: 120_000 });
```

### `TypeError: undefined is not an object (evaluating 'cache.…')`

**When:** the old name at run time — the app runs without a typecheck, so
the [type error](#property-cache-does-not-exist-on-type---rediscontext-)
never showed. The route answers `500 {"error":"internal"}`:

```text
TypeError: undefined is not an object (evaluating 'cache.users')              ← redis() alone
TypeError: undefined is not an object (evaluating 'cache.users.remember')     ← with @alxia/cache's cache()
TypeError: undefined is not an object (evaluating 'caches.users')             ← with the old derive
```

**Why:** the Redis caches are `ctx.caches`. Nothing else in the context is
`cache` but `@alxia/cache`'s controls, and the old
`derive(({ cache }) => ({ caches: cache }))` now replaces the real `caches`
with `undefined`.

**Fix:** read `caches.<name>`, drop the `derive`, and typecheck:
`tsc --noEmit` finds every place.

## Runtime: a warning in the log

### `idempotency "…": no client scope could be derived (ctx.ip is undefined and no scope option returned one), so these requests run unguarded, nothing stored or replayed. Pass a scope option, (ctx) => a user id, or an ip option to alxia().`

**When:** a guarded request carries an `Idempotency-Key`, and the
middleware has no client to scope it by: `ctx.ip` is `undefined` — under
`app.request()` in a test, or a server that cannot see the address — and
there is no `scope` option, or it returned `undefined`. Printed once per
`idempotency(…)`, with its `name`.

**Why:** keys are scoped by the client, so two clients choosing the same key
never see each other's response. With no client, the request runs
unguarded: the route runs, nothing is stored, a repeat runs it again.
Sharing one key space between every client would replay one client's
response to another.

**Fix:** scope by the user where there is one, or give `alxia()` an `ip`
option that reads the address:

```ts
idempotency(connection.client, {
	name: 'payments',
	scope: ({ request }) => request.headers.get('x-user-id') ?? undefined,
});
```

or, behind a proxy you trust:

```ts
alxia({ ip: (request) => request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() });
```

## Calling the store yourself

A policy `rateLimit` would refuse at startup still reaches the store when
you call its `consume` directly; the promise rejects with the guard's
message.

### `TypeError: defineRateLimit: "…" has a per of …; it is a whole number of milliseconds, and must be at least 1`

**When:** `consume` rejects with it, on every call, when you call
`redisStore`'s `consume` yourself with a `windowMs` that is not a whole
number, or below 1.

```text
TypeError: defineRateLimit: "api:5/1.5" has a per of 1.5; it is a whole number of milliseconds, and must be at least 1
```

**Why:** `redisStore` hands each `limit`/`windowMs` to `@nxgt/redis`
the first time it counts under it, and the guard counts in whole
milliseconds. `rateLimit` never passes such a value: it refuses it at
startup, with [`TypeError: rateLimit: windowMs must be a whole number of 1 or more, not …`](https://github.com/softistx/alxia/blob/develop/packages/rate-limit/docs/troubleshooting.md#typeerror-ratelimit--must-be-a-whole-number-of-1-or-more-not-).

**Fix:** a whole number of milliseconds, at least 1:

```ts
import { redisStore } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);
const store = redisStore(connection.client, { name: 'api' });
const key = '203.0.113.7';

await store.consume(key, { limit: 5, windowMs: 1_500 });
```

### `TypeError: defineRateLimit: "…" has a limit of …; it is a whole number of requests, and must be at least 1`

**When:** `consume` rejects with it, on every call, when you call
`redisStore`'s `consume` yourself with a `limit` of 0, below 0, or with a
fraction.

```text
TypeError: defineRateLimit: "api:0/1000" has a limit of 0; it is a whole number of requests, and must be at least 1
```

**Why:** a limit of 0 would refuse everything; the guard refuses to count
it. `rateLimit` never passes such a value: it refuses it at startup, with
[`TypeError: rateLimit: limit must be a whole number of 1 or more, not …`](https://github.com/softistx/alxia/blob/develop/packages/rate-limit/docs/troubleshooting.md#typeerror-ratelimit--must-be-a-whole-number-of-1-or-more-not-).
To shut a route, answer it yourself.

**Fix:** a whole number, at least 1:

```ts
import { redisStore } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);
const store = redisStore(connection.client, { name: 'api' });
const key = '203.0.113.7';

await store.consume(key, { limit: 1, windowMs: 60_000 });
```

## Responses

What a client of a route behind `idempotency` may get back.

### `400 {"error":"idempotency_key_missing"}`

**When:** a guarded method without the key header, with `required: true`.

**Fix (client):** send one, new for each operation and the same on each
retry of it:

```ts
const key = crypto.randomUUID();
await fetch('/payments', { method: 'POST', headers: { 'idempotency-key': key }, body });
```

If the key travels under another header, set `header` on the server.

### `400 {"error":"idempotency_key_invalid"}`

**When:** the key is empty, longer than 255 characters, or has a space or
any character outside printable ASCII — an accented letter, a newline.

**Why:** the key is stored in a Redis key name and compared byte for byte;
it is refused rather than altered.

**Fix (client):** a UUID, or any token of printable ASCII up to 255
characters:

```ts
headers.set('idempotency-key', crypto.randomUUID());
```

### `409 {"error":"idempotency_in_progress","retryAfter":10}`

**When:** a repeat of a key whose first request is still running —
usually a client that retried on its own timeout, or a double click.

**Why:** the first request holds the key while it runs. `retryAfter` (and
`Retry-After`) is when its lease would lapse unless renewed: 10 seconds by
default, however short the route is.

**Fix:** the client retries the same request after `Retry-After` and gets
the replay. Or let the server wait for the first request instead:

```ts
idempotency(connection.client, { name: 'payments', wait: 2_000 });
```

### `422 {"error":"idempotency_key_reused"}`

**When:** a key already used is sent with another method, path, query or
body.

**Why:** the first request's method, path, query and raw body are hashed
with the key; a repeat must be the same request. A client that reuses one
key for every request, or serialises the same body differently on a retry
(key order, whitespace), hits this.

**Fix (client):** a new key for each new operation, and the exact same
bytes on each retry of it — serialise the body once, before the first
attempt:

```ts
const body = JSON.stringify(payment);
const key = crypto.randomUUID();
const send = () => fetch('/payments', { method: 'POST', headers: { 'idempotency-key': key, 'content-type': 'application/json' }, body });
```

## Traps

### A rate limit lets more than `limit` requests through

**When:** the store is `redisStore`, and a client that was idle sends
requests steadily: up to `2 × limit − 1` pass in the first `windowMs`.

**Why:** `redisStore` is GCRA, not the memory store's fixed window. A full
bucket holds `limit`, and it refills continuously at `limit` per
`windowMs`. Measured at `limit: 5, windowMs: 2_000`: five pass at once, two
are refused, and two more pass one second later.

**Fix:** none is needed for a rate; it never lets more than `limit`
through at once. For a smaller burst at the same rate, divide `limit` and
`windowMs` by the same factor:

```ts
rateLimit({ limit: 10, windowMs: 6_000, store });   // 100 a minute, at most 10 at once
```

### Two limits count each other's requests

**When:** two `rateLimit`s with the same `limit` and `windowMs` are given
stores with the same `name`.

**Why:** the key is `<name>:<limit>/<windowMs>:<key>`: the same three are
the same count, whichever route counts it.

**Fix:** one `name` per limit:

```ts
rateLimit({ limit: 5, windowMs: 60_000, store: redisStore(connection.client, { name: 'login' }) });
rateLimit({ limit: 5, windowMs: 60_000, store: redisStore(connection.client, { name: 'signup' }) });
```

### A `401` or a `429` is replayed, with `Idempotent-Replayed: true`, after the client fixed it

**When:** a request under a key was refused with a `4xx` — by the route, or
by a rate limit or an authentication check declared after `idempotency`,
or by an error handler —
and the client, once allowed, retries with the same key and body.

**Why:** every response below `500` is kept and replayed for `ttl`, not
only successes. Measured: a `429` from a rate limit declared after the
guard was replayed after its window had passed; a `401` was replayed after
the request was sent with a valid token.

**Fix:** declare the rate limit and the authentication check **before**
`idempotency`, so their refusals are not kept:

```ts
alxia()
	.use(rateLimit({ limit: 10, windowMs: 60_000, store: redisStore(connection.client, { name: 'pay' }) }))
	.use(idempotency(connection.client, { name: 'payments' }))
	.post('/payments', ({ reply }) => reply(201, { ok: true }));
```

For a refusal the route itself makes, the client sends a new key with the
corrected request ([Order](guide/idempotency.md#order-what-runs-inside-the-guard)).

### One client gets another client's response

**When:** two clients send the same `Idempotency-Key` with the same
request, and the second gets the first's response, replayed. Usually
behind a proxy, or with keys that are not random — `1`, `order-1`.

**Why:** keys are scoped by `scope(ctx)`, the client's address by default.
Behind a proxy that the app's `ip` option does not see through, every
client has the proxy's address, and they then share one key space. (With
no address at all and no `scope`, the request runs unguarded instead, with
a [warning](#runtime-a-warning-in-the-log).)

**Fix:** scope by the user where there is one, and have clients send
random keys:

```ts
idempotency(connection.client, {
	name: 'payments',
	scope: ({ request }) => request.headers.get('x-user-id') ?? undefined,
});
```

[Scope](guide/idempotency.md#scope-whose-key-it-is) shows the `ip` option
behind a proxy.

### Counts and kept responses vanish after moving to a handle with a `prefix`

**Symptom:** after `redisStore(client, …)` becomes `redisStore(handle, …)`,
rate-limit counts start from zero, kept responses miss and an idempotent
repeat runs again.

**Why:** the handle's `prefix` is in front of every key, so the keys are
new: `api:…` is now `shop:api:…`. The old ones expire on their own.

**Fix:** none is needed beyond waiting for the longest `ttl`; switch during a
quiet period, or keep the bare client until then.

### Counts restart after moving a rate limit to the wired form

**Symptom:** after `redisStore(handle, { name: 'api' })` becomes
`redisStore(handle.limits.api)`, every client's allowance starts full again.
An idempotent route does not do this: `idempotency(handle, { name: 'orders' })`
and `idempotency(handle.idempotency.orders)` write the same keys, so a kept
response is still replayed.

**Why:** the two layouts differ. The by-name store keeps one bucket per policy,
`shop:api:<limit>/<windowMs>:<key>` and `shop:api:policies`; the wired limit
is `@nxgt/redis`'s own, `shop:api:<key>`, the layout every other consumer of
the handle shares. The old buckets are not read any more and expire by
themselves.

**Fix:** none is needed but the wait, within `burst × per ÷ limit` of the
limit; switch at a quiet moment. `redisStore(handle.limits.api)` counts by the
definition's rate, not by the `limit` and `windowMs` the middleware is given,
which only write the headers: if the `RateLimit-Policy` header says another
rate than the limit enforces, give the definition as the second argument,
`redisStore(handle.limits.api, api)`, and leave `limit` and `windowMs` out of
`rateLimit`: the store declares the definition's rate and the headers come
from it. A `limit` or `windowMs` that differs from it throws
[`rateLimit: limit … differs from the store's policy of …`](https://github.com/softistx/alxia/blob/develop/packages/rate-limit/docs/troubleshooting.md#typeerror-ratelimit-limit--differs-from-the-stores-policy-of-)
at startup; a definition that is not the one that wired the limit throws
`redisStore: the definition "…" is not the one that wired this limit`.

### The handle is closed while something still uses it

**Symptom:** after the app stopped, or in a second app sharing the handle,
commands fail with `RedisError: Connection closed`.

**Why:** `redis(handle)` closes the handle when its app stops. Two apps
given one handle close it with the first.

**Fix:** pass `{ close: false }` to every `redis(handle, …)` but the one that
owns the handle's life, or close it yourself:

```ts
app.plugin(redis(handle, { close: false }));
```
