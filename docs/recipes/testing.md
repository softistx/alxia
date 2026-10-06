# Test an alxia app

**The problem.** You want tests that are fast, need no port and no mocks of
the framework, and fail when the contract moves: the status, the body, a
header, the type of a route's context. And some tests need more: a real
server for a WebSocket, a real Redis for a store.

An alxia app is a value with a `fetch` handler. A test calls it **in
process**, through the same middlewares, validation and error handling as a
request on the wire, and gets a `Response`. The test runner is `bun test`.

```sh
bun add @alxia/core @alxia/env zod
```

## The app under test

The module exports `app`, and listens only when it is the entry file, so a
test imports it without opening a port. (The templates are written so.)

```ts
// file: src/app.ts
import { alxia, defineMiddleware, validate } from '@alxia/core';
import { z } from 'zod';

const auth = defineMiddleware(({ request, reply }, next) => {
	const token = request.headers.get('authorization');
	return token === 'Bearer secret' ? next({ user: 'ada' }) : reply(401, { error: 'unauthorized' as const });
});

export const app = alxia()
	.get('/ping', ({ reply }) => reply(200, 'pong'))
	.post(
		'/notes',
		auth,
		validate({ body: z.object({ title: z.string().min(1) }) }),
		({ user, body, reply }) => reply(201, { title: body.title, author: user }),
	);

// Only when this file is the entry: no port in a test.
if (import.meta.main) app.listen(3000);
```

## `app.request`

`app.request(path, init?)` takes what `fetch` takes and answers a `Response`.
Send JSON, headers and cookies as a client would; read the status, the
headers and the body.

```ts
// file: src/app.spec.ts
import { describe, expect, test } from 'bun:test';
import { app } from './app';

const post = (body: unknown, authorization?: string): RequestInit => ({
	method: 'POST',
	headers: {
		'content-type': 'application/json',
		...(authorization === undefined ? {} : { authorization }),
	},
	body: JSON.stringify(body),
});

describe('POST /notes', () => {
	test('creates a note for the signed-in user', async () => {
		const response = await app.request('/notes', post({ title: 'Hello' }, 'Bearer secret'));
		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ title: 'Hello', author: 'ada' });
	});

	test('asks for the token before it reads the body', async () => {
		// The body is invalid too: the 401 comes first, because `auth` stands before `validate`.
		const response = await app.request('/notes', post({ title: '' }));
		expect(response.status).toBe(401);
	});

	test('a body the schema refuses is a 400 naming every issue', async () => {
		const response = await app.request('/notes', post({ title: '' }, 'Bearer secret'));
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: 'validation',
			issues: [{ target: 'body', path: ['title'] }],
		});
	});
});

test('a path no route has is a 404, a method it does not allow a 405', async () => {
	expect((await app.request('/nowhere')).status).toBe(404);
	const wrong = await app.request('/ping', { method: 'DELETE' });
	expect(wrong.status).toBe(405);
	expect(wrong.headers.get('allow')).toContain('GET');
});
```

Keep a request the client could never send, a malformed body, a missing
header, in `app.request` tests: it sends what it is told.

## A middleware alone

A middleware is a plain function: test it on an app of its own, with one
route that shows what it adds.

```ts
// file: src/auth.spec.ts
import { expect, test } from 'bun:test';
import { alxia, defineMiddleware } from '@alxia/core';

const tenant = defineMiddleware(({ request }, next) =>
	next({ tenant: request.headers.get('x-tenant') ?? 'public' }),
);

const probe = alxia()
	.use(tenant)
	.get('/', ({ tenant, reply }) => reply(200, { tenant }));

test('reads the tenant from the header, public by default', async () => {
	expect(await (await probe.request('/', { headers: { 'x-tenant': 'acme' } })).json()).toEqual({ tenant: 'acme' });
	expect(await (await probe.request('/')).json()).toEqual({ tenant: 'public' });
});
```

## The environment

`defineEnv` reads `Bun.env`; a `source` leaves it alone, so a test makes
its own, and a bad one is an `EnvError` naming every variable.

```ts
// file: src/env.spec.ts
import { expect, test } from 'bun:test';
import { defineEnv } from '@alxia/env';
import { z } from 'zod';

const shape = { PORT: z.coerce.number().default(3000), API_KEY: z.string().min(1) };

test('defaults and secrets', () => {
	const env = defineEnv(shape, { source: { API_KEY: 'k' }, secret: ['API_KEY'] });
	expect(env.PORT).toBe(3000);
	expect(JSON.stringify(env)).not.toContain('"k"');
});

test('a missing variable stops the process, with the issue', () => {
	expect(() => defineEnv(shape, { source: {} })).toThrow('API_KEY');
});
```

## A typed client, from the OpenAPI document

For a [spec-first](spec-first-crud.md) app, the generator also writes
`paths.ts`, and `openapi-fetch` gives a client whose every call is typed by
the document. Its `fetch` is the app's: still in process, no port. A test
that no longer matches the document stops compiling.

```ts excerpt
import createClient from "openapi-fetch";
const api = createClient<paths>({
  baseUrl: "http://alxia.test",
  fetch: (request) => app.fetch(request),
});
```

The whole test, with `matchesSpec` beside it, is in
[spec-first CRUD](spec-first-crud.md#3-prove-it).

## When a test needs a server

`app.request` has no socket. A **WebSocket** route answers it
`426 upgrade_required`, and the client address (`ctx.ip`) is `undefined`.
For these, start the app on a free port, and stop it:

```ts
// file: src/server.spec.ts
import { expect, test } from 'bun:test';
import { app } from './app';

test('over a real socket', async () => {
	const server = app.listen({ port: 0, signals: false }); // port 0: a free one; no process handlers
	try {
		expect(await (await fetch(`${server.url.href}ping`)).text()).toBe('pong');
	} finally {
		await app.stop(); // graceful: in-flight requests finish, onStop hooks run
	}
});
```

Server-sent events work through `app.request`: read the stream with
`response.text()` when it ends, or a reader when it does not. Sockets and
streams are in [SSE and WebSockets](sse-and-websockets.md); behind a proxy,
give the app an `ip` option so a rate limit has someone to count:
`alxia({ ip: () => '10.0.0.1' })`.

## Redis

There is no in-memory fake of Redis: the stores run Lua scripts and read the
server's clock. Run a disposable Redis, open the handle **in the test**, with
a prefix of its own, and build the app after it is connected:

```sh
docker run -d --rm --name redis-test -p 6379:6379 redis:8-alpine
REDIS_URL=redis://127.0.0.1:6379 bun test
```

```ts
// file: src/redis.spec.ts
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import { redisStore } from '@alxia/redis';
import { defineCache, defineRedis, openRedis } from '@nxgt/redis';
import { z } from 'zod';

const sessions = defineCache({ name: 'session', key: (id: string) => id, ttl: 60, schema: z.object({ id: z.string() }) });
let handle: Awaited<ReturnType<typeof open>>;
const open = () =>
	openRedis(
		defineRedis({
			uri: Bun.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379',
			prefix: `test-${crypto.randomUUID()}`, // tests never see each other's keys
			caches: { sessions },
		}),
	);

beforeEach(async () => {
	handle = await open();
});
afterEach(() => handle.close());

test('the allowance is shared by two apps, as by two processes', async () => {
	const make = () =>
		alxia({ ip: () => '10.0.0.1' }) // app.request has no socket: say who the client is
			.use(rateLimit({ limit: 2, windowMs: 60_000, store: redisStore(handle, { name: 'api' }) }))
			.get('/', ({ reply }) => reply(200, 'ok'));
	const [one, two] = [make(), make()];
	expect((await one.request('/')).status).toBe(200);
	expect((await two.request('/')).status).toBe(200);
	expect((await one.request('/')).status).toBe(429);
});
```

More in [caching and rate limiting](caching-and-rate-limiting.md) and
[`@alxia/redis`'s testing guide](../../packages/redis/docs/guide/testing.md).

## Type tests

What an app refuses at compile time is a test too: `bun run typecheck`
runs it. `@ts-expect-error` states the refusal, and fails the typecheck when
the line stops being an error:

```ts
// file: src/types.spec.ts
import { test } from 'bun:test';
import { alxia, responds } from '@alxia/core';
import { z } from 'zod';

test('a reply is typed by responds', () => {
	alxia().get('/a', responds({ 200: z.object({ id: z.number() }) }), ({ reply }) => reply(200, { id: 1 }));
	// @ts-expect-error: 201 is not declared
	alxia().get('/b', responds({ 200: z.object({ id: z.number() }) }), ({ reply }) => reply(201, { id: 1 }));
	// @ts-expect-error: the body its schema refuses
	alxia().get('/c', responds({ 200: z.object({ id: z.number() }) }), ({ reply }) => reply(200, { id: '1' }));
});
```

## GraphQL

A GraphQL endpoint is a route: `graphqlClient(app)` from
`@alxia/graphql/testing` POSTs to `/graphql` through `app.fetch` and returns
`{ status, data, errors, response }`
([the guide](../../packages/graphql/docs/guide/testing.md)). The
[GraphQL recipe](graphql-api.md#6-test-it-in-process) uses it, and reads a
subscription over server-sent events.

## Reference

- [Getting started](../../packages/core/docs/guide/getting-started.md): testing a first app
- [Serving](../../packages/core/docs/guide/serving.md): `fetch`, `listen`, `stop`
- [Testing with the generated client](../../packages/openapi/docs/guide/testing.md)
- [`@alxia/redis` testing](../../packages/redis/docs/guide/testing.md)
- [The app's type](../../packages/core/docs/guide/types.md)
