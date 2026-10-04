# Roadmap

What `@alxia/context-storage` gives an app, and what is coming. This page
is a direction, not a commitment: the version something shipped in is the
only number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/context-storage/CHANGELOG.md).

## Now

- **Typed by `Register`.** With `@alxia/core`'s `Register` naming the
  base, `contextStorage()` needs no type argument: `context()` reads the
  registered context. Typed either way, the plugin requires that context
  of the app that uses it, a compile error otherwise.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/context-storage` declares no
  dependency, only peers: `@alxia/core` and `typescript`. It is built on
  `@alxia/core`'s public API and the runtime's own `AsyncLocalStorage`.

## Shipped

### 0.1.0

- **The request's context anywhere it runs.** `alxia().use(contextStorage())`
  lets a service, a repository or a logger read the context of the route
  that called it with `getContext()`, without it being passed down, through
  every `await`, timer and promise, and never another request's.
- **Typed by the app.** `contextStorage<typeof base>()` gives `context()` and
  `tryContext()` what a route declared next on `base` reads: the values its
  `decorate` and `derive` hooks added.
- **The request in global hooks.** `getRequestContext()` reads the request
  before routing, in a 404 and in an `onResponse`, with the route it
  reached and the error it failed with; `tryGetRequestContext()` returns
  `undefined` outside a request instead of throwing.
- **Jobs and tests.** `runWithContext(ctx, work)` runs code that reads the
  context outside a request.
- **A refusal that says why.** Where there is no context, `getContext()`
  throws a `ContextStorageError` coded `OUTSIDE_REQUEST` or `NOT_ROUTED`,
  and `tryGetContext()` returns `undefined`.
  `use(contextStorage)`, the factory uncalled, fails `tsc` and throws a
  `TypeError` at startup, rather than leaving the routes after it unserved.
- **Ported from `hono/context-storage`.** One store, and `getContext()`
  read wherever it is called, as Hono's is: code written against one ports
  to the other.
