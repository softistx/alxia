# Idempotency

This page covers `idempotency`: a middleware, given to `app.use`, that runs a `POST` or `PATCH`
once per `Idempotency-Key`, replays its response to every repeat, and
refuses the repeats it cannot answer — across every process sharing a
Redis.

```ts
import { alxia, validate } from '@alxia/core';
import { idempotency, type IdempotencyErrorBody } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';
import { z } from 'zod';

const connection = await connectRedis(Bun.env['REDIS_URL']!);
const Payment = z.object({ amount: z.number().int().positive() });

const app = alxia()
	.use(idempotency(connection.client, { name: 'payments' }))
	.post('/payments', validate({ body: Payment }), ({ body, reply }) =>
		reply(201, { id: crypto.randomUUID(), amount: body.amount }),
	);
```

```sh
curl -X POST localhost:3000/payments -H 'idempotency-key: 4f1c' -H 'content-type: application/json' -d '{"amount":10}'
# 201 {"id":"9a…","amount":10}
curl -X POST localhost:3000/payments -H 'idempotency-key: 4f1c' -H 'content-type: application/json' -d '{"amount":10}'
# 201 {"id":"9a…","amount":10}     Idempotent-Replayed: true — the route did not run
```

Only the routes declared **after** `use(idempotency(…))` are guarded. A request
no route matches is not: there is no route to scope its key by, so it passes
to the 404.

## The signature

```ts
function idempotency(client: RedisClient, options: IdempotencyOptions);  // a middleware

interface IdempotencyOptions {
	readonly name: string;
	readonly ttl?: number;
	readonly lease?: number;
	readonly wait?: number;
	readonly methods?: readonly string[];
	readonly header?: string;
	readonly required?: boolean;
	readonly scope?: (ctx: BaseContext) => string | undefined;
}
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `name` | `string` | required | the prefix of every key it stores |
| `ttl` | `number` | `86_400` (a day) | **seconds** a finished response is replayed. A whole number, at least 1 |
| `lease` | `number` | `10_000` | **milliseconds** a running request holds its key unless renewed; renewed every third of it while the route runs. A whole number, at least 1 |
| `wait` | `number` | `0` | **milliseconds** a repeat waits for a running first request before its `409`. A whole number, 0 or more |
| `methods` | `readonly string[]` | `['POST', 'PATCH']` | the methods it guards; the others pass through |
| `header` | `string` | `'idempotency-key'` | the request header the key is read from (any case) |
| `required` | `boolean` | `false` | refuse a guarded request with no key, with a `400` |
| `scope` | `(ctx: BaseContext) => string \| undefined` | `ctx.ip` | whose key it is; `undefined` leaves the request unguarded, with a warning |

`name`, `ttl` and `lease` are checked when `idempotency(…)` is called, so a
wrong one throws at startup:

```text
TypeError: defineIdempotency: "payments" has a ttl of 1.5; it is a whole number of seconds, and must be at least 1
TypeError: defineIdempotency: "payments" has a lease of 500.5; it is a whole number of milliseconds, and must be at least 1
TypeError: defineIdempotency: an idempotent operation needs a name, for its keys
```

`wait` is checked on the first guarded request: a wrong one makes every
guarded request a `500`, logging
`TypeError: run on "payments": wait is a whole number of milliseconds, 0 or more`.

## What each request gets

| Request | Answer |
| --- | --- |
| a guarded method with a new key | the route runs; its response is kept and sent |
| the same key, method, path, query and body again, within `ttl` | the first response — status, headers, body — with `Idempotent-Replayed: true`; the route does not run |
| the same key while the first still runs | `409 { error: 'idempotency_in_progress', retryAfter }`, with `Retry-After` — after up to `wait` ms |
| the same key with another method, path, query or body | `422 { error: 'idempotency_key_reused' }` |
| a key that is not 1 to 255 printable ASCII characters (no space) | `400 { error: 'idempotency_key_invalid' }` |
| no key, with `required: true` | `400 { error: 'idempotency_key_missing' }` |
| no key, without `required` | the route runs, unguarded |
| a method not in `methods` | the route runs, unguarded |

Every refusal's body is an `IdempotencyErrorBody`; declare the statuses in
your OpenAPI document, and the client you generate from it (with
`@nxgt/openapi-codegen`, say) reads them typed:

```ts
interface IdempotencyErrorBody {
	readonly error:
		| 'idempotency_key_missing'
		| 'idempotency_key_invalid'
		| 'idempotency_in_progress'
		| 'idempotency_key_reused';
	/** Seconds until a running request should be over: with `idempotency_in_progress`. */
	readonly retryAfter?: number;
}
```

```ts
import { alxia, validate } from '@alxia/core';
import { idempotency, type IdempotencyErrorBody } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';
import { z } from 'zod';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

const app = alxia()
	.use(idempotency(connection.client, { name: 'payments', required: true }))
	.post('/payments', validate({ body: z.object({ amount: z.number() }) }), ({ body, reply }) =>
		reply(201, { id: crypto.randomUUID(), amount: body.amount }),
	);

const result = await app.request('/payments', {
	method: 'POST',
	headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
	body: JSON.stringify({ amount: 10 }),
});
// result.status: 201, or 400, 409, 422 from the guard, or 500
if (result.status === 409) {
	const { retryAfter } = (await result.json()) as IdempotencyErrorBody;
	await Bun.sleep(retryAfter! * 1000);   // then send the same request again
}
```

### What is replayed

The status, every header but `Set-Cookie`, `Date` and `Content-Length`,
and the body, byte for byte. A cookie belongs to the response that set it:
a repeat never receives a session.

### What is not kept

- **A `5xx`** — a thrown error included — is answered and not kept: the key
  is free again, and the next repeat runs the route.
- **A `text/event-stream` response** is answered and not kept.
- **Everything else is kept**, `4xx` included: a `400`, a `401`, a `404`
  or a `429` answered under a key is replayed to every repeat for `ttl`
  seconds — see [Order](#order-what-runs-inside-the-guard) below.

### `409` and `Retry-After`

`retryAfter` is when the running request's lease lapses **unless it is
renewed**, rounded up to the second — 10 by default, however short the
route actually is. A client that waits that long and repeats gets the
replay. With `wait`, the repeat waits on the server instead, and usually
gets the replay rather than the `409`:

```ts
import { alxia } from '@alxia/core';
import { idempotency, type IdempotencyErrorBody } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

const app = alxia()
	.use(idempotency(connection.client, { name: 'orders', wait: 2_000 }))   // keep it under your HTTP timeout
	.post('/orders', async ({ reply }) => reply(201, { id: crypto.randomUUID() }));
```

## Scope: whose key it is

Clients choose their keys, so two clients can choose the same one. The
stored key is `<name>:<route>:<scope>:<key>`, where `scope(ctx)` is the
client's address by default. When it is `undefined` — no address, as with
`app.request()` in a test or a server that cannot see one, and no `scope`
option, or one that returns `undefined` — the request runs unguarded:
nothing is stored, nothing replayed, and each repeat runs the route again.
Sharing one key space between every client would replay one client's
response to another. The middleware warns once:

```
idempotency "payments": no client scope could be derived (ctx.ip is undefined and no scope option returned one), so these requests run unguarded, nothing stored or replayed. Pass a scope option, (ctx) => a user id, or an ip option to alxia().
```

Behind a proxy, the address is the proxy's unless the app's `ip` option
reads the forwarded header. Where requests carry a user, scope by the user:

```ts
import { alxia } from '@alxia/core';
import { idempotency, type IdempotencyErrorBody } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

const app = alxia({ ip: (request) => request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() })
	.use(
		idempotency(connection.client, {
			name: 'payments',
			scope: ({ request }) => request.headers.get('x-user-id') ?? undefined,
		}),
	)
	.post('/payments', ({ reply }) => reply(201, { ok: true }));
```

`scope` receives `BaseContext` — `request`, `url`, `ip`, `route` and the
rest — not what an earlier `derive` added; read the user from the request.
Read the forwarded header only behind a proxy you trust.

A key is also scoped by route: the same key on `/payments` and `/refunds`
is two keys.

## Order: what runs inside the guard

The middleware wraps the routes declared after it, and every middleware
declared after it too. Whatever those answer is kept like the route's
answer: so is what a try/catch middleware, an `HttpError` or a validation
refusal answers, because `idempotency` settles the rest of the request before
it keeps it. A rate limit or an authentication check declared **after**
`idempotency` has its `429` or `401` kept and replayed — even once the
client is allowed through. Declare them **before**:

```ts
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import { idempotency, redisStore } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL']!);

const app = alxia()
	.use(rateLimit({ limit: 10, windowMs: 60_000, store: redisStore(connection.client, { name: 'pay' }) }))  // its 429 is never kept
	.use(idempotency(connection.client, { name: 'payments' }))
	.post('/payments', ({ reply }) => reply(201, { ok: true }));
```

Measured: with the rate limit after `idempotency`, a key refused with a
`429` answered `429` again, `Idempotent-Replayed: true`, after the window
had passed; with it before, the same repeat ran the route and answered
`201`.

Declared on the app, a rate limit or a guard also runs on a request no route
matches, and answers it before `idempotency` is reached; that is not a
concern here, since `idempotency` skips that request anyway.

A route that refuses a request it might accept later — a `401` before the
client signs in again, a `409` on a state that changes — should answer it
before the guard, or the client should send a new key when it retries.

## The fingerprint

The first request's method, path, query and raw body are hashed and stored
with the key. A repeat whose hash differs is the `422`. Headers are not
part of it: a repeat with another `Authorization` and the same body is a
replay, within the same scope.

## When the route outlives its lease

The lease is renewed by a timer while the route runs. A route that blocks
the event loop — a synchronous loop, `Bun.sleepSync` — cannot renew it:
after a whole `lease`, a repeat can take the key and run the route again,
and the first request ends in a `500`, logging

```text
GuardError: run on "payments": the key was taken from this run before it finished (forgotten, or its lease of 10000ms went unrenewed), so a repeat may have run it too; its result was not stored
```

Yield (`await Bun.sleep(0)`) inside long synchronous work, or move it to a
`Worker`.

## Next

- [Rate limits](rate-limits.md) — `redisStore`.
- [Testing](testing.md) — specs for a guarded route.
- [`@nxgt/redis-guard`](https://www.npmjs.com/package/@nxgt/redis-guard) —
  the primitive underneath, for idempotency outside HTTP.
