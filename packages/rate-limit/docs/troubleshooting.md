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

**Responses**

- [`429 {"error":"rate_limited","retryAfter":…}`](#429-errorrate_limitedretryafter)

**Counting**

- [Every client is refused at once](#every-client-is-refused-at-once)
- [Nothing is limited, and no `RateLimit-*` header is sent](#nothing-is-limited-and-no-ratelimit--header-is-sent)
- [A client makes more than `limit` requests](#a-client-makes-more-than-limit-requests)
- [A client is refused before `limit` requests](#a-client-is-refused-before-limit-requests)

## Types

### `Property 'user' does not exist on type 'BaseContext & Empty'`

**When:** a `key` (or `skip`) reads something an earlier `derive` or plugin
added to the context, and `rateLimit` is not told about it.

```text
error TS2339: Property 'user' does not exist on type 'BaseContext & Empty'.
```

**Why:** `key` and `skip` are typed with `BaseContext`, what every route hook
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

alxia().plugin(auth).plugin(perUser); // auth derives user
```

On an app that does not give `user`, `plugin(perUser)` is a compile error:
[`the plugin reads "user", which this app's context does not give`](https://github.com/softistx/alxia/blob/develop/packages/core/docs/troubleshooting.md#the-plugin-reads--which-this-apps-context-does-not-give-add-the-plugin-or-middleware-that-gives-it-first).

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
app.plugin(
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
	.plugin(rateLimit({ limit: 100, windowMs: 60_000 }))
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
app.plugin(rateLimit({ limit: Number(Bun.env.RATE_LIMIT ?? 100), windowMs: 60_000 }));
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
}).plugin(rateLimit({ limit: 100, windowMs: 60_000 }));
```

### Nothing is limited, and no `RateLimit-*` header is sent

**When:** requests past `limit` still answer 200, without a rate-limit
header, and `ctx.rateLimit` is `undefined` — typically in a test calling
the app through `app.fetch` or `app.request`.

**Why:** a request whose key is `undefined` is not counted. Without a server
there is no connection, so the default `ip` is `undefined`, and so is the
default key. A custom `key` returning `undefined`, or a `skip` returning
`true`, does the same. (A route declared before the limit is not counted
either, and never answers a 429.)

**Fix:** in tests, read the address from a header you send:

```ts
const app = alxia({ ip: (request) => request.headers.get('x-ip') ?? undefined })
	.plugin(rateLimit({ limit: 2, windowMs: 60_000 }))
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

app.plugin(rateLimit({ limit: 100, windowMs: 60_000, store: redisStore(redis, { name: 'api' }) }));
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
	.plugin(rateLimit({ limit: 10, windowMs: 1_000 }))
	.plugin(rateLimit({ limit: 1_000, windowMs: 60 * 60_000, headers: false }));
```
