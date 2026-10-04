# @alxia/context-storage

The request's context, anywhere it runs — a service, a repository, a logger
three calls down — without passing it: [alxia](https://www.npmjs.com/package/@alxia/core)'s
`hono/context-storage`, on `AsyncLocalStorage`, **typed by the app**. No
dependency.

```sh
bun add @alxia/context-storage @alxia/core
bun add -d typescript
```

## Usage

```ts
import { alxia } from '@alxia/core';
import { contextStorage } from '@alxia/context-storage';
import { session } from '@alxia/janus';

const base = alxia().decorate({ db }).plugin(session(auth, { required: true }));

export const requestContext = contextStorage<typeof base>();

const app = base
	.plugin(requestContext)
	.get('/orders', async ({ reply }) => reply(200, await listOrders()));
```

```ts
// orders.ts — no context passed down
import { requestContext } from './app';

export async function listOrders() {
	const { db, user, set } = requestContext.context();   // typed: user, db
	set.headers.set('cache-control', 'private');
	return db.orders.forUser(user.id);
}
```

The context holds through every `await`, timer and promise of the
request, and never leaks into another's: twenty concurrent requests read
twenty contexts.

With `@alxia/core`'s `Register` naming `base`, `contextStorage()` needs no
type argument: it reads the registered context, `AppContext`. Either way
the app that mounts it must give that context, a compile error otherwise:

```ts
declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}

export const requestContext = contextStorage(); // context(): AppContext
base.plugin(requestContext);                       // ok
alxia().plugin(requestContext);                    // compile error: the plugin reads "db" | "user", which this app's context does not give
```

Requiring that context of the app is new in 0.4.0: a plugin used on an app
that does not give it, which read `undefined` at runtime, is now a compile
error ([Upgrading](https://github.com/softistx/alxia/blob/develop/packages/core/docs/upgrading.md#the-context-registered-once-register-and-defineroutes)).

## Reading it

| | |
| --- | --- |
| `requestContext.context()` | the route's context, typed by the app the plugin was given: the request, `set`, `reply`, and what every hook before it added. Throws outside |
| `requestContext.tryContext()` | the same, or `undefined`: code that runs in and out of requests |
| `getContext<Ctx>()`, `tryGetContext<Ctx>()` | untyped, as `hono/context-storage`'s: `Ctx` is yours to state |
| `getRequestContext()`, `tryGetRequestContext()` | the request as global hooks see it — in a 404, an `onResponse` — with the `route` it reached and its `error`; the `try` form returns `undefined` outside a request |
| `runWithContext(ctx, work)` | runs `work` with a context: a job, a queue consumer, a test of a service |

Outside a request, `getContext()` throws a `ContextStorageError` coded
`OUTSIDE_REQUEST`; in a request that reached no route declared after the
plugin, `NOT_ROUTED`. Declare it before the routes whose code reads it.

Pass the plugin to `app.plugin` called: `plugin(contextStorage)`, uncalled, is refused by
`tsc` (`TS2769`) and throws a `TypeError` at startup
([troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/context-storage/docs/troubleshooting.md#typeerror-contextstorage-is-a-factory-usecontextstorage-not-usecontextstorage)).

## API

| export | |
| --- | --- |
| `contextStorage<App>()` | the plugin, with `context()` and `tryContext()` typed by `App` — by default the app `@alxia/core`'s `Register` names, `BaseContext` when none — and required of the app that mounts it |
| `StoredContext<App>` | what `context()` returns: `ContextOf<App>`, or `BaseContext` when `App` is no app |
| `ContextStoragePlugin<App>` | its type |
| `getContext`, `tryGetContext`, `getRequestContext`, `tryGetRequestContext`, `runWithContext` | the store, untyped |
| `ContextStorageError`, `ContextStorageErrorCode` | why there is no context |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/context-storage/docs): what the plugin stores and when, reading it from a service or a logger, its typing, where it sits among hooks, what a timer or a detached callback sees, and jobs and tests with `runWithContext`.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/context-storage/docs/troubleshooting.md): a `ContextStorageError`, the `TypeError` of `plugin(contextStorage)`, or a `tsc` error, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/context-storage/docs/roadmap.md): what is coming, and what is not planned.
