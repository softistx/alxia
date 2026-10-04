# @alxia/rate-limit

Rate limiting for [alxia](https://www.npmjs.com/package/@alxia/core): every
route behind the limit answers a 429 with `Retry-After` once a key has
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

const result = await api.get('/search');
if (result.status === 429) result.data.retryAfter;      // seconds
```

Past the limit, a 429 with `Retry-After` and
`{ error: 'rate_limited', retryAfter }`. Every counted response carries the
IETF draft's `RateLimit-Limit`, `-Remaining`, `-Reset` and `-Policy`.

## Options

| option | default | |
| --- | --- | --- |
| `limit` | required | requests per window: a whole number, 1 or more |
| `windowMs` | required | the window, in milliseconds: a whole number, 1 or more |
| `key` | the client's address | what is counted: `(ctx) => string \| undefined`; `undefined` is not counted. `rateLimit<{ user: User }>(…)` lets it read a `user` an earlier plugin adds |
| `store` | `MemoryStore` | where: `redisStore` from `@alxia/redis`, or your own `RateLimitStore` |
| `skip` | none | requests not counted |
| `headers` | `'draft'` | `'legacy'` for `X-RateLimit-*`, or `false` |

Behind a proxy, give the app an `ip` option that reads the header it sets:
`alxia({ ip: (request) => request.headers.get('x-real-ip') ?? undefined })`.

## Across processes

`MemoryStore` counts in one process. Behind a load balancer, give every
process the same store: [`@alxia/redis`](https://www.npmjs.com/package/@alxia/redis)'s
`redisStore` counts in Redis, with GCRA timed by the Redis server's clock.

```ts
import { redisStore } from '@alxia/redis';

app.use(rateLimit({ limit: 100, windowMs: 60_000, store: redisStore(redis, { name: 'api' }) }));
```

A store of your own implements `RateLimitStore`: `consume(key, { limit,
windowMs })` decides — `allowed`, `remaining`, `resetAfter` and
`retryAfter`, delays in milliseconds — and a refused request counts
nothing.

## API

| export | |
| --- | --- |
| `rateLimit(options)` | the plugin: an app that derives `rateLimit` |
| `MemoryStore` | a fixed window in one process's memory |
| `RateLimitStore`, `Decision`, `Policy` | a store's contract |
| `RateLimitedBody`, `RateLimitInfo`, `RateLimitOptions` | its types |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/rate-limit/docs): the options and their defaults, which requests are counted, the headers, the 429 on the wire, stores, and testing.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/rate-limit/docs/troubleshooting.md): an error message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/rate-limit/docs/roadmap.md): what is coming, and what is not planned.
