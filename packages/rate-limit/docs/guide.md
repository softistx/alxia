# Guide

This page covers everything `rateLimit` does: which requests it counts, what
it answers past the limit, the headers it sets, what a route and a client
read, and where the counts are kept. It is a middleware: `app.use(rateLimit(…))`.

```ts
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';

const app = alxia()
	.get('/health', ({ reply }) => reply(200, 'ok'))      // not limited
	.use(rateLimit({ limit: 100, windowMs: 60_000 }))
	.get('/search', ({ rateLimit, reply }) =>             // limited
		reply(200, { remaining: rateLimit?.remaining }),
	);

app.listen({ port: 3000 });
// the 101st GET /search from one address within a minute
// → 429 {"error":"rate_limited","retryAfter":…}
```

## The signature

```ts
function rateLimit<Requires extends object = Empty>(
	options: RateLimitOptions<Requires>,
): RateLimit<Requires>; // a middleware, given to `app.use`, which checks `Requires`

type RateLimitOptions<Requires extends object = Empty> = {
	readonly key?: (ctx: BaseContext & Requires) => string | undefined | Promise<string | undefined>;
	readonly skip?: (ctx: BaseContext & Requires) => boolean;
	readonly headers?: 'draft' | 'legacy' | false;
} & (
	| { readonly limit: number; readonly windowMs: number; readonly store?: RateLimitStore }
	| { readonly limit?: number; readonly windowMs?: number; readonly store: PolicyStore } // a store with a policy
);

type PolicyStore = RateLimitStore & { readonly policy: { limit: number; windowMs: number } };
```

`rateLimit` returns a middleware that counts the request. Given to `app.use`,
it adds `rateLimit` to the context of every route declared after it, and each
of those routes may answer its 429; it also counts a request no route
matches, and answers its 429 before the 404 (see [Which requests are
counted](#which-requests-are-counted)). `Requires` is what `key` and `skip`
read beyond `BaseContext`; see [Reading the app's context](#reading-the-apps-context).

```ts
type RateLimit<Requires extends object = Empty> = Middleware<
	Requires,
	Promise<Reply<429, RateLimitedBody> | Next<{ rateLimit: RateLimitInfo | undefined }>>
>;
```

## Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `limit` | `number` | required, unless the store has a `policy` | requests one key may make in a window: a whole number, 1 or more |
| `windowMs` | `number` | required, unless the store has a `policy` | the window, in milliseconds: a whole number, 1 or more |
| `key` | `(ctx: BaseContext & Requires) => string \| undefined \| Promise<…>` | `ctx.ip` | what is counted; `undefined` is not counted |
| `store` | `RateLimitStore` | a new `MemoryStore` | where the counts are kept; with a `policy`, it gives `limit` and `windowMs` |
| `skip` | `(ctx: BaseContext & Requires) => boolean` | none | requests not counted at all |
| `headers` | `'draft' \| 'legacy' \| false` | `'draft'` | which rate-limit headers each counted response carries |

A `limit` or a `windowMs` that is not a whole number of 1 or more makes
`rateLimit()` throw a `TypeError` when it is called, so the app fails at
startup ([troubleshooting](troubleshooting.md#typeerror-ratelimit--must-be-a-whole-number-of-1-or-more-not-)).

### A store with a policy

A store that counts by a rate of its own — a rate limit defined elsewhere —
declares it as `policy?: { limit: number; windowMs: number }`. With one,
`limit` and `windowMs` are optional in the type and read from the store, the
`RateLimit-*` headers and `ctx.rateLimit.limit` included, so the rate is
written once. Without one they are required, and a type error says so.

```ts
import { redisStore } from '@alxia/redis';

// `api` is the defineRateLimit definition the handle wired.
app.use(rateLimit({ store: redisStore(handle.limits.api) })); // 100 per 60 s, from `api`
```

A `limit` or a `windowMs` given beside a policy must equal it, or
`rateLimit()` throws at declaration
([troubleshooting](troubleshooting.md#typeerror-ratelimit-limit--differs-from-the-stores-policy-of-)).

A store may refuse larger values than `rateLimit` does: `redisStore`
refuses a `limit × windowMs` above 9,007,199,254,740 and a `windowMs`
above ten 365-day years (315,360,000,000), on the first request it counts rather than at startup
([`@alxia/redis`: Policies Redis refuses](https://github.com/softistx/alxia/blob/develop/packages/redis/docs/guide/rate-limits.md#policies-redis-refuses)).

### `key`

By default a limit counts per client address, `ctx.ip`, which is what the
app's [`ip` option](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/serving.md#the-clients-address-ip)
reads. Behind a proxy, that is the proxy's address unless you set `ip`, and
the header to read it from is the client's to write: the first entry of
`X-Forwarded-For` is whatever the client sent, so a limit keyed by it is
bypassed with a new value in each request. Use core's `forwardedIp`, which
reads the entry your own proxies appended, from the right:

```ts
import { alxia, forwardedIp } from '@alxia/core';

const app = alxia({
	ip: forwardedIp({ trusted: 1 }), // or ['10.0.0.0/8'], the proxies' own ranges
}).use(rateLimit({ limit: 100, windowMs: 60_000 }));
```

`trusted` is the number of proxies in front of the app (`2` for a CDN and a
load balancer), or their CIDR ranges, in which case a client that reaches the
app directly is counted by its own address, whatever header it sends
([Serving](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/serving.md#the-clients-address-ip)).

One client is one key however its address is written: core gives `ctx.ip`
in one canonical text, from the socket or the header alike — an
IPv4-mapped `::ffff:203.0.113.9` as `203.0.113.9`, IPv6 as RFC 5952 writes
it (`2001:DB8:0:0:0:0:0:1` as `2001:db8::1`) — so a client cannot buy a
new allowance by writing its address another way, nor reach the app by
socket and by proxy under two keys
([One text per address](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/serving.md#one-text-per-address)).
A `key` of your own that reads an address elsewhere gets the same form
from core's `canonicalIp`.

Count by something else — an API key, a token — by returning it from `key`.
It may be async. A request whose key is `undefined` is not counted: it passes,
gets no rate-limit header, and its route reads `rateLimit` as `undefined`.

```ts
app.use(
	rateLimit({
		limit: 1_000,
		windowMs: 60 * 60_000,
		key: ({ request }) => request.headers.get('x-api-key') ?? undefined, // no key: not counted
	}),
);
```

`key` is typed with `BaseContext`, what every middleware reads: the request,
`url`, `ip`, `server`, `route` (`undefined` on a request no route matches) and `pathParams`, and with `Requires`, empty
by default. To read what an earlier middleware added, see [Reading the app's
context](#reading-the-apps-context).

### `skip`

A request `skip` returns `true` for is not counted, exactly like one whose
key is `undefined`. It is synchronous.

```ts
app.use(
	rateLimit({
		limit: 100,
		windowMs: 60_000,
		skip: ({ ip }) => ip === '127.0.0.1', // the local health checker, IPv4-mapped or not
	}),
);
```

### Reading the app's context

To count by what an earlier middleware added, such as a signed-in `user`,
name it as `rateLimit`'s type argument. `key` and `skip` then read it, and
the app that uses the limit must give it first: an app that does not give
`user` before it cannot use it.

```ts
const perUser = rateLimit<{ user: { id: string; role: string } }>({
	limit: 100,
	windowMs: 60_000,
	key: ({ user }) => user.id,
	skip: ({ user }) => user.role === 'admin',
});

const app = alxia()
	.plugin(auth) // derives user, or answers 401
	.use(perUser)
	.get('/search', handler);

alxia().use(perUser);
// error: Property 'user' is missing in type 'BaseContext & Empty' but required in type '{ user: { id: string; role: string; }; }'
```

### `headers`

Every counted response — the route's own and the 429 alike — carries the
headers of the style you choose:

| `headers` | Sent | Values |
| --- | --- | --- |
| `'draft'` (default) | `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `RateLimit-Policy` | the limit; what is left; seconds until the allowance is whole again; `<limit>;w=<window in seconds>` |
| `'legacy'` | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` | the limit; what is left; the Unix time, in seconds, at which the allowance is whole again |
| `false` | none | — |

With `limit: 1, windowMs: 60_000`, the first request answers:

```text
ratelimit-limit: 1
ratelimit-remaining: 0
ratelimit-reset: 60
ratelimit-policy: 1;w=60
```

The 429 carries `Retry-After` whatever `headers` says.

### `store`

Each `rateLimit` call without a `store` creates its own `MemoryStore`: the
counts live in that process and are lost when it stops. See
[Stores](#stores) for sharing them across processes, and for resetting a key.

## Which requests are counted

The limit is a middleware, so order decides, at runtime and in the types:

- a route declared **before** `use(rateLimit(…))` is not counted, and
  never answers the 429;
- a route declared **after** it is counted, and may answer the 429;
- a request **no route matches** (a 404, a 405) is counted too, when the limit
  is on the app: every top-level `use()` runs on it, wherever declared, and
  past the limit the 429 comes before the 404. Spamming missing paths spends
  the allowance;
- inside a [group](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/groups-and-plugins.md#groups),
  the limit stays inside it: its routes, and an unmatched request under the
  group's prefix, never a route declared after the group nor a path outside
  the prefix;
- a path-scoped `use('/api', rateLimit(…))` does not compile: a middleware
  given a path may add nothing to the context, and the limit adds
  `rateLimit`. A group is the scope.

A guard on the app answers an anonymous caller of a missing path with its
refusal, not the 404: that is the same rule for a rate limit.

```ts
const app = alxia()
	.get('/health', ({ reply }) => reply(200, 'ok'))                 // never counted
	.group('/auth', (auth) =>
		auth
			.use(rateLimit({ limit: 5, windowMs: 15 * 60_000 }))         // 5 per 15 minutes
			.post('/login', ({ reply }) => reply(200, 'ok')),
	)
	.use(rateLimit({ limit: 100, windowMs: 60_000 }))               // 100 per minute
	.get('/search', ({ reply }) => reply(200, []));                  // the group's limit does not reach it
```

The limit runs before the request is validated: a request the route
refuses with a 400 has already been counted.

Two limits on the same routes both count, and either may answer the 429 —
a burst limit and an hourly one, say. Each sets its own headers on the
response, so with two `'draft'` limits the later one's values win; give the
other `headers: false`. A route reads the `rateLimit` of the later one.

```ts
app
	.use(rateLimit({ limit: 10, windowMs: 1_000 }))                      // a burst
	.use(rateLimit({ limit: 1_000, windowMs: 60 * 60_000, headers: false })) // an hour
	.get('/search', ({ rateLimit, reply }) => reply(200, rateLimit ?? null)); // the hourly limit's info
```

## What a route reads

Every route after the limit reads `ctx.rateLimit`:

```ts
interface RateLimitInfo {
	readonly limit: number;
	readonly remaining: number;   // after this request
	readonly resetAfter: number;  // milliseconds until the allowance is whole again
}
```

It is `RateLimitInfo | undefined`: `undefined` when the request was not
counted, by `skip` or an `undefined` key.

```ts
app
	.use(rateLimit({ limit: 100, windowMs: 60_000 }))
	.get('/quota', ({ rateLimit, reply }) =>
		rateLimit === undefined
			? reply(200, { limited: false as const })
			: reply(200, { limited: true as const, remaining: rateLimit.remaining }),
	);
```

## The 429

Past the limit the middleware ends the request before the route runs:

```text
HTTP/1.1 429 Too Many Requests
retry-after: 60
ratelimit-limit: 100
ratelimit-remaining: 0
ratelimit-reset: 60
ratelimit-policy: 100;w=60

{"error":"rate_limited","retryAfter":60}
```

```ts
interface RateLimitedBody {
	readonly error: 'rate_limited';
	readonly retryAfter: number; // seconds until a request would be allowed, at least 1
}
```

`retryAfter` and `Retry-After` are the same number. A refused request
counts nothing: retrying after `retryAfter` seconds succeeds.

## On the wire

Every route after the limit may answer `429 { error: 'rate_limited',
retryAfter }`; a route declared before it never does. Declare the 429 in
your OpenAPI document, and the client you generate from it (with
`@nxgt/openapi-codegen`, say) reads it typed. A caller waits, then tries
again:

```ts
async function search() {
	for (;;) {
		const response = await fetch('http://localhost:3000/search');
		if (response.status !== 429) return response;
		const { retryAfter } = await response.json();
		await Bun.sleep(retryAfter * 1000); // wait, then try again
	}
}
```

## Stores

A store counts and decides. `rateLimit` asks it once per counted request,
and never knows which store it was given.

```ts
interface RateLimitStore {
	/** Counts one request for `key` under `policy`; a refused one counts nothing. */
	consume(key: string, policy: Policy): Decision | Promise<Decision>;
	/** Forgets `key`. */
	reset(key: string): void | Promise<void>;
}

interface Policy {
	readonly limit: number;
	readonly windowMs: number;
}

interface Decision {
	readonly allowed: boolean;
	readonly remaining: number;   // requests still allowed now, after this one
	readonly resetAfter: number;  // ms until the allowance is whole again
	readonly retryAfter: number;  // ms until a refused request would be allowed; 0 when allowed
}
```

### `MemoryStore`

A fixed window per key, in one process's memory. The first request of a key
opens a window of `windowMs`; the key may make `limit` requests in it; the
next request after it ends opens a new one. Ended windows are swept on a
timer that does not keep the process alive.

```ts
import { MemoryStore } from '@alxia/rate-limit';

const store = new MemoryStore();
const policy = { limit: 2, windowMs: 60_000 };

store.consume('a', policy); // { allowed: true,  remaining: 1, resetAfter: 60000, retryAfter: 0 }
store.consume('a', policy); // { allowed: true,  remaining: 0, … }
store.consume('a', policy); // { allowed: false, remaining: 0, retryAfter: 60000, … }
store.reset('a');
store.consume('a', policy); // { allowed: true,  remaining: 1, … }
store.size;                 // 1: the keys it counts
```

A `MemoryStore` keys its counts by `key` alone, not by policy: give each
limit its own store, as `rateLimit` does when you pass none.

### Across processes

Behind a load balancer each process would count on its own, and a client
would get `limit` requests per process. Give every process the same store:
[`@alxia/redis`](https://www.npmjs.com/package/@alxia/redis)'s `redisStore`
counts in Redis, with GCRA timed by the Redis server's clock.

```ts
import { redisStore } from '@alxia/redis';

app.use(
	rateLimit({
		limit: 100,
		windowMs: 60_000,
		store: redisStore(redis, { name: 'api' }), // redis: a Bun RedisClient
	}),
);
```

### Resetting a key

Keep a reference to the store to forget a key — the failed logins of an
address that has just logged in:

```ts
import { alxia, validate } from '@alxia/core';
import { MemoryStore, rateLimit } from '@alxia/rate-limit';
import { z } from 'zod';

const attempts = new MemoryStore();
const passwords = new Map([['ada', 'lovelace']]);

export const app = alxia()
	.group('/auth', (auth) =>
		auth
			.use(rateLimit({ limit: 5, windowMs: 15 * 60_000, store: attempts }))
			.post(
				'/login',
				validate({ body: z.object({ name: z.string(), password: z.string() }) }),
				async ({ body, ip, reply }) => {
					if (passwords.get(body.name) !== body.password) {
						return reply(401, { error: 'invalid_credentials' as const });
					}
					if (ip !== undefined) await attempts.reset(ip); // the key is ctx.ip by default
					return reply(200, { name: body.name });
				},
			),
	);
```

The key to reset is the one `key` returned: `ctx.ip` by default.

### A store of your own

Implement `RateLimitStore`. `consume` decides — `allowed`, `remaining`,
`resetAfter` and `retryAfter`, each delay in milliseconds — and must count
nothing for a refused request, or a client that retries on time is refused
again. `rateLimit` rounds the delays up to seconds for the headers and the
429 body.

## Testing

Without a server, `ctx.ip` is `undefined`, so the default key counts
nothing. Give the app an `ip` that reads a header, and send it:

```ts
import { expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';

const app = alxia({ ip: (request) => request.headers.get('x-ip') ?? undefined })
	.use(rateLimit({ limit: 2, windowMs: 60_000 }))
	.get('/limited', ({ rateLimit, reply }) => reply(200, rateLimit?.remaining ?? -1));

test('answers 429 past the limit, per address', async () => {
	const from = (ip: string) => app.request('/limited', { headers: { 'x-ip': ip } });
	expect(await (await from('1.1.1.1')).json()).toBe(1);
	await from('1.1.1.1');
	const third = await from('1.1.1.1');
	expect(third.status).toBe(429);
	expect(third.headers.get('retry-after')).toBe('60');
	expect((await from('2.2.2.2')).status).toBe(200);
});
```

The counts live as long as the app: build a new app per test, or use a
distinct `x-ip` in each, so one test does not spend another's allowance.

## See also

- [Troubleshooting](troubleshooting.md): a message, and what to do about it.
- [`@alxia/core`'s middleware guide](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/middleware.md):
  how `use`, groups and their order work, and which requests a middleware runs on.
