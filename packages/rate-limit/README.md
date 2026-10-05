# @alxia/rate-limit

Rate limiting for [alxia](https://www.npmjs.com/package/@alxia/core), as a
middleware: every request it runs on answers a 429 with `Retry-After` once a key has
spent its allowance, and reads what is left as a typed `ctx.rateLimit`. No
dependency.

```sh
bun add @alxia/rate-limit @alxia/core
bun add -d typescript
```

## Usage

```ts
import { rateLimit } from '@alxia/rate-limit';

const app = alxia()
	.get('/health', ...)                                  // not limited
	.use(rateLimit({ limit: 100, windowMs: 60_000 }))
	.get('/search', ({ rateLimit, reply }) => ...);      // limited; rateLimit.remaining

const response = await app.request('/search');
if (response.status === 429) (await response.json()).retryAfter; // seconds
```

Past the limit, a 429 with `Retry-After` and
`{ error: 'rate_limited', retryAfter }`. Every counted response carries the
IETF draft's `RateLimit-Limit`, `-Remaining`, `-Reset` and `-Policy`.

## Options

| option | default | |
| --- | --- | --- |
| `limit` | required, unless the store has a `policy` | requests per window: a whole number, 1 or more |
| `windowMs` | required, unless the store has a `policy` | the window, in milliseconds: a whole number, 1 or more |
| `key` | the client's address | what is counted: `(ctx) => string \| undefined`; `undefined` is not counted. `rateLimit<{ user: User }>(…)` lets it read a `user` an earlier middleware adds |
| `store` | `MemoryStore` | where: `redisStore` from `@alxia/redis`, or your own `RateLimitStore`. A store with a `policy` gives `limit` and `windowMs` |
| `skip` | none | requests not counted |
| `headers` | `'draft'` | `'legacy'` for `X-RateLimit-*`, or `false` |

## Order

`rateLimit` counts every request it runs on. Given to `app.use`, that is the
routes declared after it, and also a request no route matches: it is counted,
and past the limit answers the 429 before the 404. Put it in a `group` to
count only some routes: a path-scoped `use('/api', …)` cannot give `rateLimit` to the context.

Behind a proxy, the connection is the proxy: give the app an `ip` option that
reads the client from the header the proxy appends to, with core's `forwardedIp`:

```ts
import { alxia, forwardedIp } from '@alxia/core';

const app = alxia({ ip: forwardedIp({ trusted: 1 }) }) // one proxy in front
	.use(rateLimit({ limit: 100, windowMs: 60_000 }));
```

With `@alxia/core` 0.10 or later, one client is counted once however its
address is written (IPv4-mapped, IPv6 in any case or zero run, with a port or
brackets), since `ctx.ip` is its canonical text.

Never key by the first entry of `X-Forwarded-For` (`split(',')[0]`): the client
writes it, so a new value in each request is a new allowance. `forwardedIp`
reads the entry your proxy appended
([Serving](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/serving.md#the-clients-address-ip)).

## Across processes

`MemoryStore` counts in one process. Behind a load balancer, give every
process the same store: [`@alxia/redis`](https://www.npmjs.com/package/@alxia/redis)'s
`redisStore` counts in Redis, with GCRA timed by the Redis server's clock.

```ts
import { redisStore } from '@alxia/redis';

app.use(rateLimit({ limit: 100, windowMs: 60_000, store: redisStore(redis, { name: 'api' }) }));
```

A store that counts by a rate of its own declares it as `policy: { limit,
windowMs }`, and `rateLimit({ store })` reads both from it, headers included:
the numbers are written once. `redisStore(handle.limits.api)` does, from
the bound limit's definition. A `limit` or `windowMs` given beside it that differs
throws at declaration.

```ts
app.use(rateLimit({ store: redisStore(handle.limits.api) }));
```

A store of your own implements `RateLimitStore` (and, to count by a rate of
its own, the optional `policy`): `consume(key, { limit, windowMs })` decides — `allowed`, `remaining`, `resetAfter` and
`retryAfter`, delays in milliseconds — and a refused request counts
nothing.

## API

| export | |
| --- | --- |
| `rateLimit(options)` | the middleware: gives `rateLimit` to what runs after it, or answers the 429 |
| `MemoryStore` | a fixed window in one process's memory |
| `RateLimitStore`, `Decision`, `Policy`, `PolicyStore` | a store's contract; `PolicyStore` is a store with its own `policy`, which `rateLimit` reads `limit` and `windowMs` from |
| `RateLimit`, `RateLimitedBody`, `RateLimitInfo`, `RateLimitOptions` | its types: `RateLimit<Requires>` is the middleware `rateLimit()` returns |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/rate-limit/docs): the options and their defaults, which requests are counted, the headers, the 429 on the wire, stores, and testing.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/rate-limit/docs/troubleshooting.md): an error message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/rate-limit/docs/roadmap.md): what is coming, and what is not planned.
- [Recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md): [Caching and rate limiting with Redis](https://github.com/softistx/alxia/blob/develop/docs/recipes/caching-and-rate-limiting.md).
