# Troubleshooting

Each entry is headed by the text you see: an error in the server log, a
behaviour that prints nothing, or an error from `tsc`. A
`ContextStorageError` thrown inside a route also answers the request with
`500 {"error":"internal"}`; the message is in the server log.

**Runtime**

- [`TypeError: contextStorage is a factory: use(contextStorage()), not use(contextStorage)`](#typeerror-contextstorage-is-a-factory-usecontextstorage-not-usecontextstorage)
- [`ContextStorageError: getContext(): called outside a request — use tryGetContext(), or runWithContext() in a job or a test`](#contextstorageerror-getcontext-called-outside-a-request--use-trygetcontext-or-runwithcontext-in-a-job-or-a-test)
- [`ContextStorageError: getContext(): this request reached no route declared after contextStorage() — use it earlier, or getRequestContext()`](#contextstorageerror-getcontext-this-request-reached-no-route-declared-after-contextstorage--use-it-earlier-or-getrequestcontext)
- [A header set from a timer never reaches the response](#a-header-set-from-a-timer-never-reaches-the-response)

**Types**

- [`'requestContext' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.`](#requestcontext-implicitly-has-type-any-because-it-does-not-have-a-type-annotation-and-is-referenced-directly-or-indirectly-in-its-own-initializer)
- [`Property 'user' does not exist on type 'BaseContext'.`](#property-user-does-not-exist-on-type-basecontext)
- [`Property 'params' does not exist on type 'BaseContext & …'.`](#property-params-does-not-exist-on-type-basecontext--)
- [`Object literal may only specify known properties, and 'db' does not exist in type 'BaseContext'.`](#object-literal-may-only-specify-known-properties-and-db-does-not-exist-in-type-basecontext)

## Runtime

### `TypeError: contextStorage is a factory: use(contextStorage()), not use(contextStorage)`

`tsc` reports the same mistake first:

```text
error TS2769: No overload matches this call.
  …
    Argument of type '<App = undefined>(...uncalled: readonly never[]) => ContextStoragePlugin<App>' is not assignable to parameter of type '(app: Alxia<Empty, Empty, "", never>) => ContextStoragePlugin<undefined>'.
```

**When:** at startup, on `.use(contextStorage)`: the factory given to `use`
without being called.

**Why:** `use` takes a function as a plugin and calls it with the app.
Called that way, `contextStorage` would return a new, empty plugin app,
and every route declared after it would land on an app nobody serves; it
refuses the argument instead.

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
- in a WebSocket's `open`, `message` or `close`, since a socket's upgrade
  runs outside the plugin's hook;
- with two copies of `@alxia/context-storage` installed: each has its own
  store, so a plugin from one is invisible to `getContext()` from the other.

**Why:** the context lives in an `AsyncLocalStorage` that the plugin opens
for each request. A callback reads the store that was current where it was
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

In a socket handler, read what the upgrade's hooks added from
`socket.data`. For two copies, `bun pm ls --all | grep context-storage`
shows them; align the versions the app and its dependencies ask for.

### `ContextStorageError: getContext(): this request reached no route declared after contextStorage() — use it earlier, or getRequestContext()`

`error.code` is `'NOT_ROUTED'`.

**When:** in a request, but not inside a route declared after the plugin:

- in a route declared **before** `use(requestContext)`, or outside the
  `group` it is used in;
- in an `onRequest` hook, which runs before routing;
- in an `onResponse` hook, for a `404`, or for a request a hook declared
  before the plugin refused — a `derive` answering `401`;
- in code those call.

**Why:** the plugin opens the store for every request, but records the
route's context only for the routes declared after it: until then there is
a request and no route.

**Fix:** use the plugin before the routes whose code reads it:

```ts
const app = base
	.use(requestContext) // before every route that reads it
	.get('/orders', async ({ reply }) => reply(200, await listOrders()));
```

In a global hook, or in code that also runs for a 404, read the request
instead, which holds wherever there is one:

```ts
import { getRequestContext } from '@alxia/context-storage';

app.onResponse((response) => {
	const { request, route } = getRequestContext(); // route is undefined for a 404
	console.log(request.method, route ?? 'unmatched', response.status);
});
```

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

**When:** the plugin is typed by the app that uses it:

```ts
export const app = alxia().decorate({ db }).use(requestContext).get(/* … */);
export const requestContext = contextStorage<typeof app>(); // circular
```

**Why:** `app`'s type depends on the plugin, and the plugin's on `app`.

**Fix:** type it by the app as it stands **before** the plugin:

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

**When:** reading from `context()` a value a hook adds, and either

- the plugin was made without an app type, `contextStorage()`; or
- it is typed by `base`, and the hook adding `user` comes after it:
  `base.use(requestContext).derive(() => ({ user }))`.

**Why:** `context()` returns `ContextOf<App>`: what a route declared next on
`App` reads. With no `App`, that is `BaseContext`; a hook after `App` is
not in it. At runtime the value is there.

**Fix:** declare every hook whose values services read in `base`, then type
the plugin by it:

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

**Why:** those belong to one route's schema, not to the app, so the app's
context does not have them. Hooks run before validation: a `derive` reads
them as `undefined` even at runtime.

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
