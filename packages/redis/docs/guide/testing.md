# Testing

This page covers specs for routes that use `@alxia/redis`: against a real
Redis, emptied between tests, with the app built once the client is
connected.

```ts
// payments.spec.ts
import { beforeAll, beforeEach, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { idempotency } from '@alxia/redis';
import { connectRedis, type RedisConnection } from '@nxgt/redis';

let connection: RedisConnection;
let app: ReturnType<typeof makeApp>;

const makeApp = (client: RedisConnection['client']) =>
	alxia({ ip: () => '1.2.3.4' })
		.plugin(idempotency(client, { name: 'payments' }))
		.post('/payments', ({ reply }) => reply(201, { id: crypto.randomUUID() }));

beforeAll(async () => {
	connection = await connectRedis(Bun.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379');
	app = makeApp(connection.client);
});
beforeEach(async () => {
	await connection.client.send('FLUSHDB', []);
});

test('a repeat replays the first response', async () => {
	const pay = () => app.request('/payments', { method: 'POST', headers: { 'idempotency-key': 'k-1' } });
	const first = await pay();
	const again = await pay();
	expect(await again.json()).toEqual(await first.json());
	expect(again.headers.get('idempotent-replayed')).toBe('true');
});
```

## A Redis to test against

There is no in-memory fake: the stores and the guard run Lua scripts and
read the Redis server's clock, which only a Redis answers. Point
`REDIS_URL` at a disposable one:

```sh
docker run --rm -d -p 6379:6379 redis:8-alpine
REDIS_URL=redis://127.0.0.1:6379 bun test
```

In CI, a Redis service container and `REDIS_URL` do the same. Use a
database nothing else uses: `FLUSHDB` empties all of it.

## Build the app after connecting

Each export binds the client it is given when it is called. An app built
at the top of the file, while the variable that `beforeAll` fills is still
unset, binds `undefined`, and its first request fails. Build it in
`beforeAll`, as above, or connect with a top-level `await` before building
it, as below.

## Give each test a client address

`app.request()` has no socket, so `ctx.ip` is `undefined`. A rate limit
then counts nothing, and idempotency scopes every key to `anyone`. Pass the
app an `ip` that answers, as above, or one per test to stand for two
clients:

```ts
import { expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import { redisStore } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379');

test('two processes share one count', async () => {
	await connection.client.send('FLUSHDB', []);
	const make = () =>
		alxia({ ip: () => '1.2.3.4' })
			.plugin(rateLimit({ limit: 2, windowMs: 60_000, store: redisStore(connection.client, { name: 'api' }) }))
			.get('/', ({ reply }) => reply(200, 'ok'));
	const [one, two] = [make(), make()];             // two apps stand for two processes
	expect((await one.request('/')).status).toBe(200);
	expect((await two.request('/')).status).toBe(200);
	expect((await one.request('/')).status).toBe(429);
});
```

## Refusals behind the plugin only

The `409`, `422` and `400` of `idempotency` are answered by the routes
declared after it alone. Send a key it refuses to both:

```ts
import { expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { idempotency } from '@alxia/redis';
import { connectRedis } from '@nxgt/redis';

const connection = await connectRedis(Bun.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379');

const app = alxia()
	.post('/open', ({ reply }) => reply(201, 'ok'))
	.plugin(idempotency(connection.client, { name: 'payments' }))
	.post('/payments', ({ reply }) => reply(201, 'ok'));

test('only the routes after the plugin refuse a bad key', async () => {
	const init = { method: 'POST', headers: { 'idempotency-key': 'not a key' } };
	expect((await app.request('/payments', init)).status).toBe(400);
	expect((await app.request('/open', init)).status).toBe(201);
});
```

## Close at the end

Close the connections once the file is done:

```ts
import { afterAll } from 'bun:test';
import { closeRedis } from '@nxgt/redis';

afterAll(async () => {
	await closeRedis();
});
```

## Next

- [Connecting](connecting.md).
- [Idempotency](idempotency.md) — what each request gets.
