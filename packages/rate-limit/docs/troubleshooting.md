# Troubleshooting

Each entry is headed by what you see: a TypeScript error, a response, or a
limit that does not count the way you expected. `@alxia/rate-limit` throws
nothing of its own; past the limit it answers a 429.

**Types**

- [`Property 'user' does not exist on type 'BaseContext'`](#property-user-does-not-exist-on-type-basecontext)
- [`Type '() => Promise<boolean>' is not assignable to type '(ctx: BaseContext) => boolean'`](#type---promiseboolean-is-not-assignable-to-type-ctx-basecontext--boolean)
- [`'rateLimit' is possibly 'undefined'`](#ratelimit-is-possibly-undefined)
- [`This comparison appears to be unintentional because the types '200 | 500' and '429' have no overlap`](#this-comparison-appears-to-be-unintentional-because-the-types-200--500-and-429-have-no-overlap)

**Startup**

- [`TypeError: rateLimit: … must be a whole number of 1 or more, not …`](#typeerror-ratelimit--must-be-a-whole-number-of-1-or-more-not-)

**Responses**

- [`429 {"error":"rate_limited","retryAfter":…}`](#429-errorrate_limitedretryafter)

**Counting**

- [Every client is refused at once](#every-client-is-refused-at-once)
- [Nothing is limited, and no `RateLimit-*` header is sent](#nothing-is-limited-and-no-ratelimit--header-is-sent)
- [A client makes more than `limit` requests](#a-client-makes-more-than-limit-requests)
- [A client is refused before `limit` requests](#a-client-is-refused-before-limit-requests)

## Types

### `Property 'user' does not exist on type 'BaseContext'`

**When:** a `key` (or `skip`) reads something an earlier `derive` added to
the context.

```text
error TS2339: Property 'user' does not exist on type 'BaseContext'.
```

**Why:** `key` and `skip` are typed with `BaseContext`, what every route hook
reads — `request`, `url`, `ip`, `server`, `route`, `pathParams` — and not
with the context of the app they are mounted on.

**Fix:** derive the key from the request itself:

```ts
app.use(
	rateLimit({
		limit: 100,
		windowMs: 60_000,
		key: ({ request }) => request.headers.get('authorization') ?? undefined,
	}),
);
```

### `Type '() => Promise<boolean>' is not assignable to type '(ctx: BaseContext) => boolean'`

**When:** `skip` is an `async` function.

```text
error TS2322: Type '() => Promise<boolean>' is not assignable to type '(ctx: BaseContext) => boolean'.
  Type 'Promise<boolean>' is not assignable to type 'boolean'.
```

**Why:** `skip` is synchronous: a promise is always truthy, so an async
`skip` would skip every request. `key` may be async; `skip` may not.

**Fix:** decide synchronously, or move the async part into `key` and return
`undefined` for a request that should not be counted:

```ts
app.use(
	rateLimit({
		limit: 100,
		windowMs: 60_000,
		key: async ({ ip }) => ((await isTrusted(ip)) ? undefined : ip), // undefined: not counted
	}),
);
```

### `'rateLimit' is possibly 'undefined'`

**When:** a route reads `ctx.rateLimit.remaining` directly.

```text
error TS18048: 'rateLimit' is possibly 'undefined'.
```

**Why:** `ctx.rateLimit` is `RateLimitInfo | undefined`. It is `undefined`
for a request that was not counted: `skip` returned `true`, or `key`
returned `undefined` — which the default key does when `ctx.ip` is
`undefined`.

**Fix:**

```ts
app
	.use(rateLimit({ limit: 100, windowMs: 60_000 }))
	.get('/quota', ({ rateLimit, reply }) => reply(200, { remaining: rateLimit?.remaining ?? null }));
```

### `This comparison appears to be unintentional because the types '200 | 500' and '429' have no overlap`

**When:** client code checks for a 429 on a route that cannot answer one.
The left-hand union is that route's statuses.

```text
error TS2367: This comparison appears to be unintentional because the types '200 | 500' and '429' have no overlap.
```

**Why:** the limit applies to the routes declared after
`use(rateLimit(…))`, in the types as at runtime. This route was declared
before it, or outside the group that holds the limit, so it is never
limited and its type has no 429.

**Fix:** declare the route after the limit, if it should be limited — or
drop the check, if it should not:

```ts
const app = alxia()
	.use(rateLimit({ limit: 100, windowMs: 60_000 }))
	.get('/search', ({ reply }) => reply(200, [])); // now 200 | 429 | 500
```

## Startup

### `TypeError: rateLimit: … must be a whole number of 1 or more, not …`

**When:** `rateLimit()` is called with a `limit` or a `windowMs` of 0, a
negative or fractional number, or `NaN`, often from an environment variable
that is unset. It throws at once, so the app fails at startup:

```text
TypeError: rateLimit: limit must be a whole number of 1 or more, not 0
TypeError: rateLimit: windowMs must be a whole number of 1 or more, not NaN
```

**Why:** a `limit` of 0 would refuse every request, and a window of 0 or
less would never end one.

**Fix:** pass whole numbers. A value read from the environment is a
string, or `undefined` when the variable is unset: give it a default, and
let an empty or non-numeric value still fail at startup, as it should:

```ts
app.use(rateLimit({ limit: Number(Bun.env.RATE_LIMIT ?? 100), windowMs: 60_000 }));
```

## Responses

### `429 {"error":"rate_limited","retryAfter":…}`

**When:** a key has made `limit` counted requests within the window.

**Why:** that is the limit working. `retryAfter` and the `Retry-After`
header are the seconds until a request would be allowed, at least 1. The
refused request counted nothing.

**Fix:** on the client, wait that long; the 429 is in the route's type, so
`data` is typed:

```ts
const result = await api.get('/search');
if (result.status === 429) {
	await Bun.sleep(result.data.retryAfter * 1000);
}
```

If it arrives sooner than you expect, see the entries below.

## Counting

### Every client is refused at once

**When:** in production, behind a reverse proxy or a load balancer: one
busy client, or a handful of ordinary ones, and everyone gets the 429.

**Why:** the default key is `ctx.ip`, the connection's address — the
proxy's, the same for every request. All clients share one allowance.

**Fix:** give the app an `ip` option that reads the header your proxy sets,
and only from a proxy you trust:

```ts
const app = alxia({
	ip: (request, server) =>
		request.headers.get('x-real-ip') ?? server?.requestIP(request)?.address,
}).use(rateLimit({ limit: 100, windowMs: 60_000 }));
```

### Nothing is limited, and no `RateLimit-*` header is sent

**When:** requests past `limit` still answer 200, without a rate-limit
header, and `ctx.rateLimit` is `undefined` — typically in a test calling
the app through `client(app)`, `app.fetch` or `app.request`.

**Why:** a request whose key is `undefined` is not counted. Without a server
there is no connection, so the default `ip` is `undefined`, and so is the
default key. A custom `key` returning `undefined`, or a `skip` returning
`true`, does the same. (A route declared before the limit is not counted
either, and has no 429 in its type.)

**Fix:** in tests, read the address from a header you send:

```ts
const app = alxia({ ip: (request) => request.headers.get('x-ip') ?? undefined })
	.use(rateLimit({ limit: 2, windowMs: 60_000 }))
	.get('/limited', ({ reply }) => reply(200, 'ok'));

await client(app).get('/limited', { init: { headers: { 'x-ip': '1.1.1.1' } } });
```

### A client makes more than `limit` requests

**When:** the app runs as several processes or instances, or restarts.

**Why:** the default store is a `MemoryStore`, which counts in one process's
memory. Each process grants `limit` on its own, and a restart forgets
every count.

**Fix:** give every process the same store, such as `@alxia/redis`'s:

```ts
import { redisStore } from '@alxia/redis';

app.use(rateLimit({ limit: 100, windowMs: 60_000, store: redisStore(redis, { name: 'api' }) }));
```

### A client is refused before `limit` requests

**When:** a 429 comes earlier than `limit` suggests.

**Why:** one of these:

- **Two limits share one `MemoryStore`.** It keys its counts by key alone,
  not by policy, so both limits spend the same count, and the smaller
  `limit` refuses first.
- **Two limits apply to the route.** A group's limit and an app-wide one
  both count; either may refuse. With two `'draft'` limits, the headers
  show the later one's numbers.
- **Refused requests are counted.** The limit runs before the route
  validates the request, so a request answered 400 has spent one.

**Fix:** give each limit its own `MemoryStore` — or none, and `rateLimit`
creates one — and give all but one limit `headers: false`:

```ts
app
	.use(rateLimit({ limit: 10, windowMs: 1_000 }))
	.use(rateLimit({ limit: 1_000, windowMs: 60 * 60_000, headers: false }));
```
