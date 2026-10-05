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

const base = alxia().decorate({ db }).use(session(auth, { required: true }));

export const requestContext = contextStorage<typeof base>();

const app = base
	.use(requestContext)
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
base.use(requestContext);                       // ok
alxia().use(requestContext);                    // compile error: Property 'db' is missing in type 'BaseContext & Empty'
```

Requiring that context of the app is new in 0.4.0: a middleware used on an app
that does not give it, which read `undefined` at runtime, is now a compile
error ([Upgrading](https://github.com/softistx/alxia/blob/develop/packages/core/docs/upgrading.md#the-context-registered-once-register-and-defineroutes)).

## Reading it

| | |
| --- | --- |
| `requestContext.context()` | the route's context, typed by the app the middleware was given: the request, `set`, `reply`, and what every middleware before it added. Throws outside |
| `requestContext.tryContext()` | the same, or `undefined`: code that runs in and out of requests |
| `getContext<Ctx>()`, `tryGetContext<Ctx>()` | untyped, as `hono/context-storage`'s: `Ctx` is yours to state |
| `getRequestContext()`, `tryGetRequestContext()` | the request as a middleware after it sees it — in a 404 too — with the `route` it reached (`undefined` when none) and its `error`; the `try` form returns `undefined` outside a request |
| `runWithContext(ctx, work)` | runs `work` with a context: a job, a queue consumer, a test of a service |

Give it to `use` before the routes whose code reads it, and before the
middlewares that read the context: it runs on every request the app takes,
a 404 included. `getRequestContext()` works in every middleware after it;
`getContext()` only in a request that reached a route. Outside a request,
or where the middleware did not run (a route declared before it),
`getContext()` throws a `ContextStorageError` coded `OUTSIDE_REQUEST`; in
a request that reached no route, `NOT_ROUTED`.

Pass it to `app.use` called: `use(contextStorage)`, uncalled, is refused by
`tsc` (`TS2345`), and each request it runs on throws a `TypeError`,
answered with a 500
([troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/context-storage/docs/troubleshooting.md#typeerror-contextstorage-is-a-factory-usecontextstorage-not-usecontextstorage)).

## API

| export | |
| --- | --- |
| `contextStorage<App>()` | the middleware, given to `app.use`, with `context()` and `tryContext()` typed by `App` — by default the app `@alxia/core`'s `Register` names, `BaseContext` when none — and required of the app that mounts it |
| `StoredContext<App>` | what `context()` returns: `ContextOf<App>`, or `BaseContext` when `App` is no app |
| `ContextStorageMiddleware<App>` | its type: a middleware with `context()` and `tryContext()` |
| `getContext`, `tryGetContext`, `getRequestContext`, `tryGetRequestContext`, `runWithContext` | the store, untyped |
| `ContextStorageError`, `ContextStorageErrorCode` | why there is no context |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/context-storage/docs): what the middleware stores and when, reading it from a service or a logger, its typing, where it sits among the other middlewares, what a timer or a detached callback sees, and jobs and tests with `runWithContext`.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/context-storage/docs/troubleshooting.md): a `ContextStorageError`, the `TypeError` of `use(contextStorage)`, or a `tsc` error, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/context-storage/docs/roadmap.md): what is coming, and what is not planned.
