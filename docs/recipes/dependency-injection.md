# Dependency injection

**The problem.** The routes need a database, a logger, the signed-in user's
orders. Importing a module-level singleton makes them hard to test and hard
to close; building them in every handler repeats the wiring. You want each
value created once, or once per request, closed when it is done, and typed
where a route reads it.

`@alxia/di` is a middleware on [`@nxgt/di`](https://www.npmjs.com/package/@nxgt/di):
a Container of typed Tokens, a lazy Scope per request, disposed when the
request ends.

```sh
bun add @alxia/di @nxgt/di @alxia/core
bun add -d typescript
```

## The services

A Token names a value and its type. `provide` says how to make it, and
`dispose` how to close it. A singleton lives with the Container; a `scoped`
value lives with one request. A `slot` is a value each request brings:
the user, read from its headers.

```ts
// file: src/services.ts
import { container, token } from '@nxgt/di';

export interface Db {
	orders(user: string): Promise<string[]>;
	close(): Promise<void>;
}

export const closed: string[] = []; // what was disposed of, for the test

export function connect(): Promise<Db> {
	return Promise.resolve({
		orders: async (user) => [`${user}-1`, `${user}-2`],
		close: async () => {
			closed.push('db');
		},
	});
}

export const DbT = token<Db>()('db');
export const User = token<string>()('user');
export const Orders = token<string[]>()('orders');

export const services = container()
	.provide(DbT, () => connect(), { dispose: (db) => db.close() })
	.slot(User) // a value each request brings
	.provide(Orders, async ({ get }) => (await get(DbT)).orders(await get(User)), {
		lifetime: 'scoped',
		dispose: () => {
			closed.push('orders');
		},
	});
```

## The app

`di(container, { slots })` is given to `use`: the routes after it read
`scope`. Because the Container has a Slot, `slots` is required, and gives
each Slot's value from the request's context. `deps.expose` resolves Tokens
and puts them on the context of a group, under the names you choose.
`deps.lifecycle` disposes of the Container when the app stops.

```ts
// file: src/app.ts
import { alxia } from '@alxia/core';
import { di } from '@alxia/di';
import { Orders, User, services } from './services';

export const deps = di(services, {
	slots: ({ request }) => ({ user: request.headers.get('x-user') ?? 'anonymous' }),
});

export const app = alxia()
	.plugin(deps.lifecycle) // disposes of the Container when the app stops
	.use(deps) // a lazy Scope per request, as `scope`
	.group('/orders', (group) =>
		group
			.use(deps.expose({ orders: Orders })) // resolved, as `orders`
			.get('/', ({ orders, reply }) => reply(200, orders)),
	)
	.get('/whoami', async ({ scope, reply }) => reply(200, await scope.resolve(User)))
	.get('/health', ({ reply }) => reply(200, 'ok')); // no Scope made, `slots` not called
```

```ts
// file: src/server.ts
import { app } from './app';
import { services } from './services';

await services.init(); // the singletons, before listening: never in onStart
app.listen(3000);
```

- **The Scope is lazy.** It is created, and `slots` called, on the first
  `resolve`, from a route or an `expose`. `/health` costs nothing.
- **A Token the Container does not provide fails to compile**, in `expose`
  and in `scope.resolve`.
- **A scoped value is disposed of when the route has answered**, whether it
  replied or threw. A failing `dispose` goes to `onDisposeError`
  (`console.error` by default) and never replaces the response. A streamed
  body must not use scoped values: resolve what it needs before answering.
- **`services.init()` runs before `listen`**, so a failing connection stops
  the boot rather than the first request.

## Stop, and forks

On `SIGTERM`, `SIGINT` or `stop()`, after the requests in flight have
finished, `deps.lifecycle` disposes of the Container: every singleton's
`dispose`, in reverse creation order. It requires `@alxia/core` 0.14.

A fork copies the base's hooks, so each fork runs `deps.lifecycle` of its
own. The count is per Container: the Container is disposed of when the
**last** app that started under it stops, not the first, so stopping one
fork never breaks another that still serves.

```ts no-check
const base = alxia().plugin(deps.lifecycle).use(deps);
const publicApi = base.fork();
const adminApi = base.fork();
publicApi.listen(3000);
adminApi.listen(3001);

await publicApi.stop(); // adminApi keeps the Container
await adminApi.stop(); // the last one: the Container is disposed of
```

An app that never listened, as in a spec, disposes of nothing on `stop()`.
Without `deps.lifecycle` the Container is yours to dispose of, once, where
the application decides.

## Test it

`app.request` needs no server. The scoped value is disposed of with each
request; the singleton waits for the stop.

```ts
// file: src/app.spec.ts
import { alxia } from '@alxia/core';
import { di } from '@alxia/di';
import { expect, test } from 'bun:test';
import { Orders, closed, services } from './services';
import { app } from './app';

test('a route reads the user the request brought', async () => {
	const res = await app.request('/orders', { headers: { 'x-user': 'ada' } });
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual(['ada-1', 'ada-2']);
	expect(closed).toEqual(['orders']); // the Scope was disposed of with the request
});

test('a route that resolves nothing makes no Scope', async () => {
	closed.length = 0;
	expect((await app.request('/health')).status).toBe(200);
	expect(closed).toEqual([]);
});

test('a fake replaces a Provider', async () => {
	const deps = di(services.override(Orders, ['fake']), {
		slots: () => ({ user: 'test' }),
	});
	const fake = alxia()
		.use(deps)
		.get('/orders', async ({ scope, reply }) => reply(200, await scope.resolve(Orders)));
	expect(await (await fake.request('/orders')).json()).toEqual(['fake']);
});
```

## Reference

- [`@alxia/di`](../../packages/di/README.md) and its
  [guide](../../packages/di/docs/README.md): the Scope, Slots, `expose`,
  disposal, [the Container's lifecycle across forks](../../packages/di/docs/guide/lifecycle.md#forks),
  testing, troubleshooting
- [Health checks and graceful shutdown](health-and-shutdown.md): the stop
  `deps.lifecycle` hooks into
- [Test an alxia app](testing.md): `app.request` and the rest of the toolbox
