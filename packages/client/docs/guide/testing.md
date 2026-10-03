# Testing

This page covers testing an app through its client: in process with no
server, over HTTP when a socket needs one, and the compile errors that
prove the contract holds.

```ts
// users.spec.ts
import { expect, test } from 'bun:test';
import { client } from '@alxia/client';
import { app } from './server';

const api = client(app);

test('a user is created, then read back', async () => {
	const created = await api.post('/users', {
		headers: { 'x-tenant': 'acme' },
		body: { name: 'Grace' },
	});
	expect(created.status).toBe(201);
	expect(created.data).toEqual({ name: 'Grace', tenant: 'acme' });
});
```

## In process: `client(app)`

Given the app itself, the client calls `app.fetch(request)`: the request
runs through every hook, schema and handler as it would behind a server,
without a port, a socket or a `listen`. Its type is inferred from the app,
so there is nothing to import as a type.

What differs from a server:

| | In process | Over HTTP |
| --- | --- | --- |
| request URL | `http://alxia.local/<path>` | the base URL |
| `signal`, `AbortSignal.timeout` | rejects the call, as `fetch` does; the handler runs on to its end | aborts the call |
| a redirect | the `302` itself | followed by `fetch`, unless `init: { redirect: 'manual' }` |
| `api.ws()` | throws: a socket needs a server | opens the socket |
| `ClientOptions.fetch` | ignored | the `fetch` called |

## Over HTTP

`listen({ port: 0 })` takes a free port; `server.url` is the base URL.

```ts
import { expect, test } from 'bun:test';
import { client } from '@alxia/client';
import { app } from './server';

test('over HTTP, through a base URL', async () => {
	const server = app.listen({ port: 0 });
	try {
		const api = client<typeof app>(server.url);
		const result = await api.get('/users/:id', { params: { id: 1 } });
		expect(result.status).toBe(200);
	} finally {
		await server.stop(true);
	}
});
```

### Sockets

`client(app).ws()` throws
`TypeError: client(app).ws(): a socket needs a server. Give the client its URL.`
A socket test listens:

```ts
import { expect, test } from 'bun:test';
import { client } from '@alxia/client';
import { app } from './server';

test('a socket echoes in its room', async () => {
	const server = app.listen({ port: 0 });
	try {
		const socket = client<typeof app>(server.url).ws('/echo/:room', {
			params: { room: 'lobby' },
		});
		const messages = socket[Symbol.asyncIterator]();
		socket.send({ text: 'hi' });
		const first = await messages.next();
		expect(first.value).toEqual({ room: 'lobby', text: 'hi' });
		socket.close();
	} finally {
		await server.stop(true);
	}
});
```

Start the iterator — or call `on` — **before** the server can answer: a
message that arrives with nobody listening is not kept
([Events and sockets](events-and-sockets.md#listening)).

## Server-sent events

In process, the stream is read like any other:

```ts
test('three ticks, then the end', async () => {
	const result = await client(app).get('/ticks', { query: { count: 3 } });
	if (result.status !== 200) throw new Error(`got ${result.status}`);
	const ticks: number[] = [];
	for await (const tick of result.data) ticks.push(tick.n);
	expect(ticks).toEqual([1, 2, 3]);
});
```

## Testing the types

The client's types are the contract a front end compiles against. Bun's
`expectTypeOf` pins what a call reads, and `@ts-expect-error` pins what it
must refuse — `tsc` fails if the line ever compiles:

```ts
import { expect, expectTypeOf, test } from 'bun:test';
import { client } from '@alxia/client';
import { app } from './server';

const api = client(app);

test('GET /users/:id reads a user, its dates as strings', async () => {
	const result = await api.get('/users/:id', { params: { id: 1 } });
	if (result.status === 200) {
		expectTypeOf(result.data).toEqualTypeOf<{ id: number; name: string; createdAt: string }>();
	}
	if (!result.ok) {
		expectTypeOf(result.status).toEqualTypeOf<404 | 400 | 500>();
	}
});

test('mistakes are compile errors', () => {
	// Never called: only compiled.
	const mistakes = () => {
		// @ts-expect-error: no such route
		void api.get('/nope');
		// @ts-expect-error: the params are required
		void api.get('/users/:id');
		// @ts-expect-error: the body must have a name
		void api.post('/users', { headers: { 'x-tenant': 'a' }, body: {} });
		// @ts-expect-error: the app has no PUT route
		void api.put;
	};
	expect(mistakes).toBeFunction();
});
```

`bun test` does not typecheck: run `tsc --noEmit` beside it, or the
`@ts-expect-error` lines prove nothing.

## A fake `fetch`

To test a front end without its server, give a URL target a `fetch` that
answers what the test needs:

```ts
import { expect, test } from 'bun:test';
import { client } from '@alxia/client';
import type { App } from './server';

test('a missing user renders nothing', async () => {
	const api = client<App>('http://api.test', {
		fetch: async () => Response.json({ error: 'not_found' }, { status: 404 }),
	});
	const result = await api.get('/users/:id', { params: { id: 7 } });
	expect(result.status).toBe(404);
});
```

The fake is not checked against the route: a body the server could never
send still type-checks as the route's.

## See also

- [Calling routes](calls.md): the target, the options.
- `@alxia/core`'s
  [Serving](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/serving.md):
  `listen`, `fetch`, `request` and stopping.
