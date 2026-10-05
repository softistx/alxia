# Troubleshooting

Each entry is headed by what you see: a TypeScript error, a response, or a
limit that does not count the way you expected. `@alxia/rate-limit` throws
nothing of its own; past the limit it answers a 429.

**Types**

- [`Property 'user' does not exist on type 'BaseContext & Empty'`](#property-user-does-not-exist-on-type-basecontext--empty)
- [`Type '() => Promise<boolean>' is not assignable to type '(ctx: BaseContext & Empty) => boolean'`](#type---promiseboolean-is-not-assignable-to-type-ctx-basecontext--empty--boolean)
- [`'rateLimit' is possibly 'undefined'`](#ratelimit-is-possibly-undefined)

**Startup**

- [`TypeError: rateLimit: … must be a whole number of 1 or more, not …`](#typeerror-ratelimit--must-be-a-whole-number-of-1-or-more-not-)
- [`TypeError: rateLimit: limit … differs from the store's policy of …`](#typeerror-ratelimit-limit--differs-from-the-stores-policy-of-)

**Responses**

- [`429 {"error":"rate_limited","retryAfter":…}`](#429-errorrate_limitedretryafter)

**Counting**

- [Every client is refused at once](#every-client-is-refused-at-once)
- [Nothing is limited, and no `RateLimit-*` header is sent](#nothing-is-limited-and-no-ratelimit--header-is-sent)
- [A client makes more than `limit` requests](#a-client-makes-more-than-limit-requests)
- [A client is refused before `limit` requests](#a-client-is-refused-before-limit-requests)
- [A missing path answers 429](#a-missing-path-answers-429)

## Types

### `Property 'user' does not exist on type 'BaseContext & Empty'`

**When:** a `key` (or `skip`) reads something an earlier `derive` or middleware
added to the context, and `rateLimit` is not told about it.

```text
error TS2339: Property 'user' does not exist on type 'BaseContext & Empty'.
```

**Why:** `key` and `skip` are typed with `BaseContext`, what every middleware
reads — `request`, `url`, `ip`, `server`, `route`, `pathParams` — plus what
you name as `rateLimit`'s type argument, and nothing else. `rateLimit` is
built before it is used, so it cannot see the app it will be used on.

**Fix:** name what `key` reads. The app that uses the limit must then give
it, before the limit:

```ts
const perUser = rateLimit<{ user: { id: string } }>({
	limit: 100,
	windowMs: 60_000,
	key: ({ user }) => user.id,
});

alxia().plugin(auth).use(perUser); // auth derives user
```

On an app that does not give `user`, `use(perUser)` is a compile error:
`Property 'user' is missing in type 'BaseContext & Empty' but required in type '{ user: { id: string; }; }'`.

### `Type '() => Promise<boolean>' is not assignable to type '(ctx: BaseContext & Empty) => boolean'`

**When:** `skip` is an `async` function.

```text
error TS2322: Type '() => Promise<boolean>' is not assignable to type '(ctx: BaseContext & Empty) => boolean'.
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

### `TypeError: rateLimit: limit … differs from the store's policy of …`

**When:** `rateLimit()` is given a `store` that declares its own `policy`
(`redisStore(handle.limits.api, api)`) and a `limit` or a `windowMs` that is
not the store's. It throws at declaration, so the app fails at startup:

```text
TypeError: rateLimit: limit 50 differs from the store's policy of 100 per 60000ms. Leave limit and windowMs out to use the store's, or give the same numbers.
```

**Why:** the store counts by its policy, and the `RateLimit-*` headers are
written from the numbers `rateLimit` holds: two values would make the headers
say what the store does not enforce. (`windowMs` reads the same way.)

**Fix:** leave `limit` and `windowMs` out; they come from the store. To change
the rate, change the definition the store reads it from:

```ts
app.use(rateLimit({ store: redisStore(handle.limits.api, api) }));
```

## Responses

### `429 {"error":"rate_limited","retryAfter":…}`

**When:** a key has made `limit` counted requests within the window.

**Why:** that is the limit working. `retryAfter` and the `Retry-After`
header are the seconds until a request would be allowed, at least 1. The
refused request counted nothing.

**Fix:** on the client, wait that long, then try again:

```ts
const response = await fetch('http://localhost:3000/search');
if (response.status === 429) {
	await Bun.sleep((await response.json()).retryAfter * 1000);
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
the app through `app.fetch` or `app.request`.

**Why:** a request whose key is `undefined` is not counted. Without a server
there is no connection, so the default `ip` is `undefined`, and so is the
default key. A custom `key` returning `undefined`, or a `skip` returning
`true`, does the same. (A route declared before the limit is not counted
either, and never answers a 429; nor is a request a group's limit does not
run on.)

**Fix:** in tests, read the address from a header you send:

```ts
const app = alxia({ ip: (request) => request.headers.get('x-ip') ?? undefined })
	.use(rateLimit({ limit: 2, windowMs: 60_000 }))
	.get('/limited', ({ reply }) => reply(200, 'ok'));

await app.request('/limited', { headers: { 'x-ip': '1.1.1.1' } });
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
- **Unmatched requests are counted.** On the app, the limit runs on a
  request no route matches too, so a client probing missing paths spends
  its allowance: see [A missing path answers 429](#a-missing-path-answers-429).

**Fix:** give each limit its own `MemoryStore` — or none, and `rateLimit`
creates one — and give all but one limit `headers: false`:

```ts
app
	.use(rateLimit({ limit: 10, windowMs: 1_000 }))
	.use(rateLimit({ limit: 1_000, windowMs: 60 * 60_000, headers: false }));
```

### A missing path answers 429

**When:** a request to a path no route serves answers `429`, not `404`, once
the client is past the limit.

**Why:** a limit given to `app.use` runs on every request, a request no
route matches included, and answers before the 404. Declared after a route,
it still runs for unmatched requests: only the routes before it are spared.
A limit inside a `group` does not.

**Fix:** that is the limit working. To count only some routes, scope it:

```ts
const app = alxia()
	.get('/health', ({ reply }) => reply(200, 'ok'))
	.group('/api', (api) =>
		api
			.use(rateLimit({ limit: 100, windowMs: 60_000 })) // /api routes only
			.get('/search', ({ reply }) => reply(200, [])),
	);
```
