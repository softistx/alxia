# Getting started

This page takes an empty Bun project to a running, validated, tested app,
and points at the page that goes deeper at each step.

```sh
bun add @alxia/core zod
```

`@alxia/core` has no dependency and knows no validator: it reads any
[Standard Schema](https://standardschema.dev). Zod is used on these pages;
Valibot, ArkType or a schema written by hand work the same
([Routes](routes.md#any-standard-schema)).

## The smallest app

```ts
// src/app.ts
import { alxia } from '@alxia/core';

export const app = alxia().get('/health', ({ reply }) => reply(200, { ok: true }));

export type App = typeof app;
```

```ts
// src/server.ts
import { app } from './app';

const server = app.listen(3000);
console.log(`listening on ${server.url}`);
```

```sh
bun run src/server.ts
curl localhost:3000/health   # {"ok":true}
```

Every method returns the app, typed with what it added, so declare the app
in **one chain** and export its type. `App` is what
[`@alxia/client`](https://www.npmjs.com/package/@alxia/client) reads
([The app's type](types.md)).

## A route that validates

```ts
import { alxia } from '@alxia/core';
import { z } from 'zod';

const User = z.object({ id: z.number(), name: z.string() });
const NotFound = z.object({ error: z.literal('not_found') });

const users = new Map([[1, { id: 1, name: 'Ada', password: 'secret' }]]);

export const app = alxia()
	.decorate({ users })
	.get(
		'/users/:id',
		{
			params: z.object({ id: z.coerce.number().int() }),
			response: { 200: User, 404: NotFound },
		},
		({ params, users, reply }) => {
			const user = users.get(params.id); // params.id: number
			return user ? reply(200, user) : reply(404, { error: 'not_found' });
		},
	)
	.post(
		'/users',
		{ body: z.object({ name: z.string().min(1) }), response: { 201: User } },
		({ body, reply }) => reply(201, { id: 2, name: body.name }),
	);

export type App = typeof app;
```

What this buys:

- `GET /users/abc` is a **400** naming the refused value, before the handler
  runs ([Routes](routes.md#the-400)).
- The handler can only `reply` with 200 or 404, each with a body its schema
  accepts; anything else is a compile error ([Replies](replies.md)).
- The 200 is sent as the schema's **output**: `password` is not in `User`,
  so it never leaves the server.
- `decorate` puts `users` in the context of every route declared after it
  ([Hooks](hooks.md#decorate)).

## Testing it

`app.request(path, init?)` calls the app in process: no port, no server.

```ts
// src/app.spec.ts
import { expect, test } from 'bun:test';
import { app } from './app';

test('reads a user, without the password', async () => {
	const response = await app.request('/users/1');
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ id: 1, name: 'Ada' });
});

test('refuses an id that is not a number', async () => {
	const response = await app.request('/users/abc');
	expect(response.status).toBe(400);
	expect((await response.json()).issues[0].target).toBe('params');
});

test('creates a user from JSON', async () => {
	const response = await app.request('/users', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: 'Grace' }),
	});
	expect(response.status).toBe(201);
});
```

A body is read by its `content-type`: without `application/json`, the JSON
above would be read as bytes and refused. `@alxia/client`, given the app
itself, calls the same `fetch` with typed arguments.

## Where to go next

| You want to | Read |
| --- | --- |
| validate the query, headers, cookies, or a form | [Routes and schemas](routes.md) |
| set a header or a cookie, redirect, stream, send a file | [Replies](replies.md) |
| authenticate, add a database to the context, catch errors | [Hooks](hooks.md) |
| split the app into files or reusable plugins | [Groups and plugins](groups-and-plugins.md) |
| serve a directory, a favicon, a single-page app | [Static files](static-files.md) |
| push events or open a socket | [Server-sent events](server-sent-events.md), [WebSockets](websockets.md) |
| choose a port, TLS, run behind a proxy, stop cleanly | [Serving](serving.md) |
| type a client, a service, or a test from the app | [The app's type](types.md) |
