# Guide

This page covers what `contextStorage()` stores and when, how code outside
a handler reads it, how its type follows the app, where the plugin sits
among an app's hooks, and what `AsyncLocalStorage` does and does not carry.

```ts
import { alxia } from '@alxia/core';
import { contextStorage } from '@alxia/context-storage';

const base = alxia()
	.decorate({ greeting: 'Hello' })
	.derive(({ request }) => ({ user: request.headers.get('x-user') ?? 'anonymous' }));

const requestContext = contextStorage<typeof base>();

// three calls down, no context passed
function greet(): string {
	const { greeting, user } = requestContext.context(); // typed: greeting, user
	return `${greeting}, ${user}`;
}

const app = base.use(requestContext).get('/hello', ({ reply }) => reply(200, greet()));

app.listen(3000);
```

`curl -H 'x-user: Ada' localhost:3000/hello` answers `Hello, Ada`. `greet`
could live in another module, behind any number of `await`s: it reads the
context of the request that called it, and never another's.

## The signature

```ts
// `uncalled` takes nothing: it makes `use(contextStorage)` a compile error
function contextStorage<App = undefined>(...uncalled: readonly never[]): ContextStoragePlugin<App>;

type ContextStoragePlugin<App> = Alxia<Empty, Empty, '', never> & {
	context(): ContextOf<App> extends never ? BaseContext : ContextOf<App>;
	tryContext(): (ContextOf<App> extends never ? BaseContext : ContextOf<App>) | undefined;
};

function getContext<Ctx extends object = Empty>(): BaseContext & Ctx;
function tryGetContext<Ctx extends object = Empty>(): (BaseContext & Ctx) | undefined;
function getRequestContext(): RequestContext;
function tryGetRequestContext(): RequestContext | undefined;
function runWithContext<T>(ctx: BaseContext, work: () => T): T;

class ContextStorageError extends Error {
	readonly name: 'ContextStorageError';
	readonly code: ContextStorageErrorCode;
}

type ContextStorageErrorCode = 'OUTSIDE_REQUEST' | 'NOT_ROUTED';
```

`contextStorage()` returns an app plugin: pass it to `use`, called — `use(contextStorage)` fails `tsc` with `TS2769` and throws a `TypeError` at startup ([troubleshooting](troubleshooting.md#typeerror-contextstorage-is-a-factory-usecontextstorage-not-usecontextstorage)). It adds
nothing to the app's type. `BaseContext`, `RequestContext` and `ContextOf`
come from `@alxia/core`.

| Export | Returns | Where it would have nothing |
| --- | --- | --- |
| `requestContext.context()` | the route's context, typed by `App` | throws a `ContextStorageError` |
| `requestContext.tryContext()` | the same | `undefined` |
| `getContext<Ctx>()` | the route's context, as `BaseContext & Ctx`: `Ctx` is yours to state | throws a `ContextStorageError` |
| `tryGetContext<Ctx>()` | the same | `undefined` |
| `getRequestContext()` | the request as global hooks see it: `request`, `url`, `ip`, `server`, and once routing has run, `route` and `error` | throws a `ContextStorageError` coded `OUTSIDE_REQUEST` |
| `tryGetRequestContext()` | the same | `undefined` |
| `runWithContext(ctx, work)` | what `work` returns, with `ctx` as the current context while it runs | — |

There is one store per copy of the package: every `contextStorage()` writes
to it, and `getContext()` reads it wherever it is called. Two plugins on one
app read the same context.

## What it stores, and when

The plugin adds two hooks. A global `around` hook opens a store for every
request the app receives, wherever the plugin is used, holding the
request's `RequestContext`. A route hook records the route's context in
that store, for the routes declared after the plugin only. So what each
function reads depends on where the code runs:

| Code running in | `getRequestContext()` | `tryGetRequestContext()` | `getContext()` | `tryGetContext()` |
| --- | --- | --- | --- | --- |
| an `onRequest` hook | the request, `route` still `undefined` | the same | throws `NOT_ROUTED` | `undefined` |
| a route declared **before** the plugin, and its `onResponse` | the request | the same | throws `NOT_ROUTED` | `undefined` |
| a `derive` or `wrap` declared after the plugin | the request | the same | the route's context, **before validation**: no `params`, `query` or `body` yet | the same |
| the handler of a route declared after the plugin, and everything it calls | the request | the same | the context the handler receives — the same object | the same |
| that route's `onError` and `onResponse` hooks | the request, with `route` and `error` | the same | the same context | the same |
| an `onResponse` for a 404 | the request, `route` `undefined` | the same | throws `NOT_ROUTED` | `undefined` |
| a socket's handlers (`open`, `message`, `close`) | throws `OUTSIDE_REQUEST` | `undefined` | throws `OUTSIDE_REQUEST` | `undefined` |
| startup, a job, a timer started at startup | throws `OUTSIDE_REQUEST` | `undefined` | throws `OUTSIDE_REQUEST` | `undefined` |

The two errors carry these messages:

| `code` | `message` |
| --- | --- |
| `OUTSIDE_REQUEST` | `getContext(): called outside a request — use tryGetContext(), or runWithContext() in a job or a test` |
| `NOT_ROUTED` | `getContext(): this request reached no route declared after contextStorage() — use it earlier, or getRequestContext()` |

Thrown inside a route, either one answers a `500 {"error":"internal"}` and
is logged, like any other error. `code` tells them apart:

```ts
import { ContextStorageError, getContext } from '@alxia/context-storage';

try {
	getContext();
} catch (error) {
	if (error instanceof ContextStorageError) console.log(error.code); // 'OUTSIDE_REQUEST'
}
```

Code that runs both in and out of requests uses `tryContext()`,
`tryGetContext()` or `tryGetRequestContext()` instead of catching.

The context is the whole of what the handler reads: the request, `set` to
add a header or a cookie to the response, `reply` and `redirect`, and what
every hook added — so a service three calls down can set a response header,
as `listOrders` does below.

## Reading it from outside the handler

Keep the app's base and the plugin in a module of their own, and import the
plugin from every service, repository or logger that reads it. The handlers
then call those without passing anything down.

```ts
// context.ts
import { alxia } from '@alxia/core';
import { contextStorage } from '@alxia/context-storage';

export interface Order {
	readonly id: number;
	readonly userId: number;
	readonly total: number;
}

const db = { orders: [{ id: 1, userId: 1, total: 42 }] as Order[] };
const users = new Map([['Bearer ada', { id: 1, name: 'Ada' }]]);

export const base = alxia()
	.decorate({ db })
	.derive(({ request, reply }) => {
		const user = users.get(request.headers.get('authorization') ?? '');
		return user ? { user } : reply(401, { error: 'unauthenticated' as const });
	});

export const requestContext = contextStorage<typeof base>();
```

```ts
// orders.ts
import { requestContext } from './context';

export async function listOrders() {
	const { db, user, set } = requestContext.context();
	set.headers.set('cache-control', 'private');
	return db.orders.filter((order) => order.userId === user.id);
}
```

```ts
// app.ts
import { base, requestContext } from './context';
import { listOrders } from './orders';

export const app = base
	.use(requestContext)
	.get('/orders', async ({ reply }) => reply(200, await listOrders()));
```

A logger is the code that runs in and out of requests: at startup, in a 404,
in a route. `tryGetRequestContext()` gives it the request wherever there is
one, and `tryContext()` the user where a route was reached:

```ts
// log.ts
import { tryGetRequestContext } from '@alxia/context-storage';
import { requestContext } from './context';

export function log(message: string): void {
	const request = tryGetRequestContext(); // undefined outside a request
	console.log(
		JSON.stringify({
			message,
			method: request?.request.method,
			route: request?.route,
			user: requestContext.tryContext()?.user.id,
		}),
	);
}
```

`log('listing orders')` from `listOrders` prints the method, `/orders` and
the user's id; from startup, the message alone.

## Typing it

`contextStorage<App>()` takes the type of an app, and `context()` and `tryContext()`
return what a route declared next on that app would read: `ContextOf<App>`.

| `App` | `context()` returns |
| --- | --- |
| none: `contextStorage()` | `BaseContext`: the request, `set`, `reply`, `redirect`, `route`, `pathParams` |
| `typeof base` | `ContextOf<typeof base>`: `BaseContext` plus everything `base`'s `decorate`, `derive` and plugins added |

```ts
import { alxia } from '@alxia/core';
import { contextStorage } from '@alxia/context-storage';

const base = alxia()
	.decorate({ greeting: 'Hello' })
	.derive(({ request }) => ({ user: request.headers.get('x-user') ?? 'anonymous' }));

const typed = contextStorage<typeof base>();
const untyped = contextStorage();

export function whoIsAsking(): string {
	untyped.context().route;     // string: BaseContext only
	// untyped.context().user — error TS2339: Property 'user' does not exist on type 'BaseContext'.
	return typed.context().user; // string
}
```

Three rules follow from typing by an app:

- **Type it by the app before the plugin, never by the app that uses it.**
  `const app = alxia().use(requestContext)…` with
  `requestContext = contextStorage<typeof app>()` is a circular type, which
  `tsc` refuses with `TS7022`. Declare `base` first, as above.
- **What a hook after the plugin adds is there at runtime, not in the
  type.** `context()` knows `base`, so a `derive` added after
  `base.use(requestContext)` is missing from its type. Put the hooks whose
  values services read in `base`, or state the type with `getContext<Ctx>()`.
- **A route's own `params`, `query`, `body` and `headers` are not in it**:
  they belong to one route's `validate(…)`, not to the app. Read them in
  the handler and pass them down, or state them:

```ts
import { getContext } from '@alxia/context-storage';

// in code that only ever runs under GET /orders/:id, after its validate({ params })
const { params } = getContext<{ params: { id: number } }>();
```

`getContext<Ctx>()` and `tryGetContext<Ctx>()` believe what `Ctx` says,
as `hono/context-storage`'s do: nothing checks it against the route.

## Where it sits

The plugin's `around` hook is global: it applies to every request, wherever
`use` is called. Its route hook applies to the routes declared after it, in
the same app or group. So **use it before the routes whose code reads the
context**, and after the hooks whose values services read:

```ts
import { alxia } from '@alxia/core';
import { contextStorage, getContext } from '@alxia/context-storage';

const requestContext = contextStorage();

const app = alxia()
	.get('/health', ({ reply }) => reply(200, 'ok'))      // getContext() throws NOT_ROUTED here
	.use(requestContext)
	.derive(() => ({ startedAt: Date.now() }))            // after the plugin: may call code that reads it
	.get('/me', ({ reply }) => reply(200, getContext().route)); // '/me'
```

A hook declared before the plugin that ends the request — a `derive`
answering `401` — ends it before the plugin's route hook runs: in that
request's `onResponse`, `getContext()` throws `NOT_ROUTED`, and
`getRequestContext()` still answers.

| Placement | Effect |
| --- | --- |
| at the top of the chain | every route can read it; `context()` is typed `BaseContext` unless typed by an app declared before it |
| after `decorate` and `derive` | the usual place: typed by them, and every route after reads it |
| inside a `group` | the group's routes read it; a route outside the group throws `NOT_ROUTED` |
| twice | harmless: one store, one context per request |

The plugin is an app like any other: `requestContext.get('/x', handler)` is the
route method, and the context is read with `context()` and `tryContext()`.
Declare routes on the app rather than on the plugin, and pass
`contextStorage()` to `use` called — the uncalled form is
[refused](troubleshooting.md#typeerror-contextstorage-is-a-factory-usecontextstorage-not-usecontextstorage).

## What `AsyncLocalStorage` carries

The store follows the request's asynchronous work: every `await`, promise,
`setTimeout` and microtask started while the request runs reads the
context of that request, and concurrent requests never see each other's.

```ts
async function greet(): Promise<string> {
	await Bun.sleep(10);
	await new Promise((resolve) => setTimeout(resolve, 1));
	const { greeting, user } = requestContext.context(); // still this request's
	return `${greeting} ${user}`;
}
```

A server-sent event stream's generator runs while the response streams, and
reads the context too.

What it carries is decided where a callback is **scheduled**, not where it
runs:

| The callback | Sees |
| --- | --- |
| a `setTimeout` or promise started in the request, firing after the response is sent | that request's context, stale: `context()` does not throw, but `set` no longer reaches any response |
| a `setInterval`, queue consumer or pool started at startup | nothing: `context()` throws `OUTSIDE_REQUEST`, `tryContext()` is `undefined` |
| a function pushed into a queue in the request, and run by something started at startup | nothing, as above |
| an `EventEmitter` listener | the context of the code that called `emit`, since listeners run synchronously |
| a WebSocket's `open`, `message` and `close` | nothing: a socket's upgrade runs outside `around` |

So work that outlives the request — a write-behind, an e-mail, an audit
event — takes what it needs **before** it is detached, instead of reading
the context when it runs:

```ts
import { requestContext } from './context';

const pending: (() => Promise<void>)[] = [];

export function auditLater(action: string): void {
	const { user, route } = requestContext.context(); // read now, in the request
	pending.push(async () => {
		console.log(JSON.stringify({ action, user: user.id, route }));
	});
}

setInterval(() => {
	for (const job of pending.splice(0)) void job(); // runs outside any request
}, 1000);
```

For a socket, read what a message needs from `socket.data`, which holds the
upgrade's context.

## Jobs and tests: `runWithContext`

`runWithContext(ctx, work)` runs `work` with `ctx` as the current context,
for code that reads it outside any request: a queue consumer, a scheduled
job, a unit test of a service. `getContext()` and `getRequestContext()` both
return `ctx` while it runs, and `work`'s return value — a promise included
— comes back as it is.

`ctx` is a `BaseContext`. A job has no request to build one from, so give it
what the code reads, and say that is all it is:

```ts
import type { ContextOf } from '@alxia/core';
import { runWithContext } from '@alxia/context-storage';
import { type base } from './context';
import { listOrders } from './orders';

type Ctx = ContextOf<typeof base>;

const job = {
	db: { orders: [{ id: 7, userId: 0, total: 1 }] },
	user: { id: 0, name: 'nightly' },
	set: { headers: new Headers(), cookies: new Bun.CookieMap() },
} satisfies Partial<Ctx>;

const orders = await runWithContext(job as unknown as Ctx, () => listOrders());
```

`satisfies` checks the fields you give against the app's context; the cast
admits the ones you left out, which the code must not read.

A test covers both sides — the service through a real request, and alone:

```ts
import { describe, expect, test } from 'bun:test';
import type { ContextOf } from '@alxia/core';
import { runWithContext } from '@alxia/context-storage';
import { app } from './app';
import { type base } from './context';
import { listOrders } from './orders';

describe('listOrders', () => {
	test('reads the user of the request it runs in', async () => {
		const response = await app.request('/orders', {
			headers: { authorization: 'Bearer ada' },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private');
		expect(await response.json()).toEqual([{ id: 1, userId: 1, total: 42 }]);
	});

	test('concurrent requests never see each other', async () => {
		const answers = await Promise.all(
			['Bearer ada', 'Bearer nobody', 'Bearer ada'].map(
				async (authorization) =>
					(await app.request('/orders', { headers: { authorization } })).status,
			),
		);
		expect(answers).toEqual([200, 401, 200]);
	});

	test('runs alone, with a context of its own', async () => {
		const ctx = {
			db: { orders: [{ id: 2, userId: 9, total: 5 }] },
			user: { id: 9, name: 'test' },
			set: { headers: new Headers(), cookies: new Bun.CookieMap() },
		} satisfies Partial<ContextOf<typeof base>>;

		const orders = await runWithContext(ctx as unknown as ContextOf<typeof base>, listOrders);

		expect(orders).toEqual([{ id: 2, userId: 9, total: 5 }]);
		expect(ctx.set.headers.get('cache-control')).toBe('private');
	});
});
```

When `getContext()` throws, or a service reads the wrong context,
[Troubleshooting](troubleshooting.md) starts from the message.
