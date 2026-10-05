# Troubleshooting

Each entry is headed by the text you see: an error in the server log, a
behaviour that prints nothing, or an error from `tsc`. A
`ContextStorageError` thrown inside a route also answers the request with
`500 {"error":"internal"}`; the message is in the server log.

**Runtime**

- [`use(): argument 1 looks like a factory (contextStorage): call it, use(contextStorage())`](#use-argument-1-looks-like-a-factory-contextstorage-call-it-usecontextstorage), and `TypeError: contextStorage is a factory: use(contextStorage()), not use(contextStorage)`
- [`ContextStorageError: getContext(): called outside a request — use tryGetContext(), or runWithContext() in a job or a test`](#contextstorageerror-getcontext-called-outside-a-request--use-trygetcontext-or-runwithcontext-in-a-job-or-a-test)
- [`ContextStorageError: getContext(): this request reached no route declared after contextStorage() — use it earlier, or getRequestContext()`](#contextstorageerror-getcontext-this-request-reached-no-route-declared-after-contextstorage--use-it-earlier-or-getrequestcontext)
- [A header set from a timer never reaches the response](#a-header-set-from-a-timer-never-reaches-the-response)

**Types**

- [`'requestContext' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.`](#requestcontext-implicitly-has-type-any-because-it-does-not-have-a-type-annotation-and-is-referenced-directly-or-indirectly-in-its-own-initializer)
- [`Property 'user' does not exist on type 'BaseContext'.`](#property-user-does-not-exist-on-type-basecontext)
- [`Property 'params' does not exist on type 'BaseContext & …'.`](#property-params-does-not-exist-on-type-basecontext--)
- [`Object literal may only specify known properties, and 'db' does not exist in type 'BaseContext'.`](#object-literal-may-only-specify-known-properties-and-db-does-not-exist-in-type-basecontext)
- [`Property 'user' is missing in type 'BaseContext & Empty' but required in type '{ user: string; }'`](#property-user-is-missing-in-type-basecontext--empty-but-required-in-type--user-string-)

## Runtime

### `use(): argument 1 looks like a factory (contextStorage): call it, use(contextStorage())`

`tsc` reports the same mistake first:

```text
error TS2345: Argument of type '<App = Alxia<Empty, "">>(...uncalled: readonly never[]) => ContextStorageMiddleware<App>' is not assignable to parameter of type '…'.
  Type '<App = Alxia<Empty, "">>(...uncalled: readonly never[]) => ContextStorageMiddleware<App>' is not assignable to type '(ctx: never, next: NextFunction) => … & "this looks like a factory given uncalled: call it, as use(cors()) and not use(cors)"'.
    Types of parameters 'uncalled' and 'next' are incompatible.
      Type 'NextFunction' is not assignable to type 'never'.
```

**When:** `.use(contextStorage)`, the factory given to `app.use` without
being called. It throws where the app is declared, since alxia 0.5; before,
each request the routes after it answered was a 500, with
`TypeError: contextStorage is a factory: use(contextStorage()), not use(contextStorage)`
in the server log, which a factory run past `use` still throws.

**Why:** `contextStorage` is marked as a factory, so `use`, a route and
`plugin` refuse it. Run as a middleware, it would make a new middleware
each time and store nothing.

**Fix:** call it, once, and keep the result:

```ts
export const requestContext = contextStorage<typeof base>();

const app = base.use(requestContext);
```

### `ContextStorageError: getContext(): called outside a request — use tryGetContext(), or runWithContext() in a job or a test`

`error.code` is `'OUTSIDE_REQUEST'`. `getContext()`, `requestContext.context()`
and `getRequestContext()` all throw it.

**When:** the code that reads the context runs where no request is:

- at the top level of a module, or in code run at startup;
- in a job, a queue consumer, or a callback run by a `setInterval` started
  at startup — including a function pushed onto a queue during a request
  and run later by such a timer;
- in a route declared **before** `use(requestContext)`, or outside the
  `group` it is used in: the middleware never ran on that request;
- in a middleware declared before it, which runs outside the store;
- in a WebSocket's `open`, `message` or `close`, since a socket's handlers
  run outside the chain;
- with two copies of `@alxia/context-storage` installed: each has its own
  store, so the middleware from one is invisible to `getContext()` from the other.

**Why:** the context lives in an `AsyncLocalStorage` that the middleware opens
for each request it runs on. A callback reads the store that was current where it was
**scheduled**; anything started outside a request has none.

**Fix:** in code that runs in and out of requests, use `tryContext()` —
or `tryGetRequestContext()` for the request alone:

```ts
const user = requestContext.tryContext()?.user; // undefined outside a request
const method = tryGetRequestContext()?.request.method; // the same
```

In a job, a consumer or a test, give the code a context to read:

```ts
import type { ContextOf } from '@alxia/core';
import { runWithContext } from '@alxia/context-storage';

type Ctx = ContextOf<typeof base>;

const job = {
	db,
	user: { id: 0, name: 'nightly' },
	set: { headers: new Headers(), cookies: new Bun.CookieMap() },
} satisfies Partial<Ctx>;

await runWithContext(job as unknown as Ctx, () => listOrders());
```

For work that outlives the request, read the context in the request and
hand the values over:

```ts
export function auditLater(action: string): void {
	const { user } = requestContext.context(); // in the request
	pending.push(() => audit(action, user.id)); // runs later, needs nothing
}
```

In a socket handler, read what the upgrade's middlewares added from
`socket.data`. For two copies, `bun pm ls --all | grep context-storage`
shows them; align the versions the app and its dependencies ask for.

### `ContextStorageError: getContext(): this request reached no route declared after contextStorage() — use it earlier, or getRequestContext()`

`error.code` is `'NOT_ROUTED'`.

**When:** in a request the middleware ran on, but that reached no route:
a 404 or a 405, in a middleware after `use(requestContext)`, or in code
that middleware calls.

**Why:** `use(requestContext)` on the app runs on every request, and records
the route's context only when a route matched: for an unmatched request
there is a request and no route.

**Fix:** in a middleware, or in code that also runs for a 404, read the
request instead, which holds wherever the middleware ran:

```ts
import { defineMiddleware } from '@alxia/core';
import { getRequestContext } from '@alxia/context-storage';

app.use(requestContext).use(
	defineMiddleware(async (_ctx, next) => {
		const response = await next();
		const { request, route } = getRequestContext(); // route is undefined for a 404
		console.log(request.method, route ?? 'unmatched', response.status);
		return response;
	}),
);
```

A route declared before the middleware, or outside its `group`, throws
`OUTSIDE_REQUEST` instead (see above): mount it before the routes whose
code reads it.

### A header set from a timer never reaches the response

**When:** a `setTimeout`, a promise that is not awaited, or a callback
started in a request calls `requestContext.context().set.headers.set(…)` — or
sets a cookie — after the handler has returned.

**Why:** the callback still reads the request's context — `context()` does not
throw — but the response was already sent. The context is stale, not gone.

**Fix:** await the work that shapes the response before replying, and
detach only what does not:

```ts
const app = base.use(requestContext).get('/orders', async ({ reply }) => {
	const orders = await listOrders(); // sets cache-control while the response is open
	void sendReceipt();                // detached: must not touch `set`
	return reply(200, orders);
});
```


## Types

### `'requestContext' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.`

```text
error TS7022: 'app' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
error TS7022: 'requestContext' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
```

Often with `TS2448: Block-scoped variable 'requestContext' used before its declaration.`

**When:** the middleware is typed by the app that mounts it:

```ts
export const app = alxia().decorate({ db }).use(requestContext).get(/* … */);
export const requestContext = contextStorage<typeof app>(); // circular
```

**Why:** `app`'s type depends on the middleware, and the middleware's on `app`.

**Fix:** type it by the app as it stands **before** the middleware:

```ts
export const base = alxia().decorate({ db });
export const requestContext = contextStorage<typeof base>();
export const app = base.use(requestContext).get('/orders', ({ reply }) => reply(200, 'ok'));
```

### `Property 'user' does not exist on type 'BaseContext'.`

```text
error TS2339: Property 'user' does not exist on type 'BaseContext'.
```

Also as `Property 'user' does not exist on type 'BaseContext & Empty & { readonly db: … }'.`

**When:** reading from `context()` a value a middleware adds, and either

- the middleware was made without an app type, `contextStorage()`, and
  `@alxia/core`'s `Register` names no base; or
- it is `contextStorage()` given to the registered `base` itself, which
  cannot read `Register` while `base` is being typed; or
- it is typed by `base`, and the middleware adding `user` comes after it:
  `base.use(requestContext).derive(() => ({ user }))`.

**Why:** `context()` returns `ContextOf<App>`: what a route declared next on
`App` reads. With no `App`, that is `BaseContext`; a middleware after `App` is
not in it. At runtime the value is there.

**Fix:** declare every middleware whose values services read in `base`, then type
it by `base` — or register `base` with `@alxia/core`'s `Register` and
give `contextStorage()` to the app after `base`, never to `base` itself:

```ts
const base = alxia()
	.decorate({ db })
	.derive(({ request }) => ({ user: request.headers.get('x-user') ?? 'anonymous' }));

export const requestContext = contextStorage<typeof base>();
// requestContext.context().user: string
```

### `Property 'params' does not exist on type 'BaseContext & …'.`

```text
error TS2339: Property 'params' does not exist on type 'BaseContext & Empty & { readonly db: … }'.
```

The same for `query`, `body` and `headers`.

**When:** reading a route's validated input from `requestContext.context()`.

**Why:** those belong to one route's `validate(…)`, not to the app, so the
app's context does not have them. The app's middlewares run before a
route's own, `validate` among them: a `derive` reads the request as it
arrived, the body `undefined`, even at runtime.

**Fix:** pass them from the handler, or, in code that only runs under one
route, state them:

```ts
import { getContext } from '@alxia/context-storage';

const { params } = getContext<{ params: { id: number } }>(); // nothing checks this
```

### `Object literal may only specify known properties, and 'db' does not exist in type 'BaseContext'.`

```text
error TS2353: Object literal may only specify known properties, and 'db' does not exist in type 'BaseContext'.
```

**When:** `runWithContext({ db, user }, work)`, with a context written by
hand for a job or a test.

**Why:** `runWithContext` takes a `BaseContext`: a whole request context.
A job has no request, so a literal has neither the fields it requires nor
room for the ones the app adds.

**Fix:** check the fields against the app's context with `satisfies`, and
cast — `work` must then read only what you gave:

```ts
import type { ContextOf } from '@alxia/core';

type Ctx = ContextOf<typeof base>;

const ctx = {
	db,
	user: { id: 0, name: 'job' },
	set: { headers: new Headers(), cookies: new Bun.CookieMap() }, // listOrders sets a header
} satisfies Partial<Ctx>;

runWithContext(ctx as unknown as Ctx, () => listOrders());
```

### `Property 'user' is missing in type 'BaseContext & Empty' but required in type '{ user: string; }'`

```text
error TS2769: No overload matches this call.
  …
          Type 'BaseContext & Empty' is not assignable to type 'MiddlewareContext<{ user: string; }>'.
            Property 'user' is missing in type 'BaseContext & Empty' but required in type '{ user: string; }'.
```

**When:** an app uses the middleware typed by another app, `contextStorage<typeof
base>()`, or by the registered one, `contextStorage()`, and does not give
what that app's middlewares add:

```ts
const base = alxia().derive(({ request }) => ({ user: request.headers.get('x-user') ?? 'anonymous' }));
const requestContext = contextStorage<typeof base>();

alxia().use(requestContext);
```

**Why:** `context()` would return a `user` that no middleware of this app adds:
at runtime it would be `undefined`.

**Fix:** mount it on the app it is typed by, after `base`:

```ts
base.use(requestContext);
```

