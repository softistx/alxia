# Roadmap

What `@alxia/context-storage` gives an app, and what is coming. This page
is a direction, not a commitment: the version something shipped in is the
only number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/context-storage/CHANGELOG.md).

## Now

Nothing in progress.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/context-storage` declares no
  dependency, only peers: `@alxia/core` and `typescript`. It is built on
  `@alxia/core`'s public API and the runtime's own `AsyncLocalStorage`.

## Shipped

### 0.3.0

- **A middleware, not a plugin (0.4).** `app.use(contextStorage())` opens the store on every request, a 404 included: `getRequestContext()` works in every middleware after it, and an error is answered inside it, so a middleware that catches it still reads the context. `app.plugin(contextStorage())`, the deprecated plugin form, was removed with alxia 0.5: give it to `use`.

### 0.2.0

- **Typed by `Register`.** With `@alxia/core`'s `Register` naming the
  base, `contextStorage()` needs no type argument: `context()` reads the
  registered context. Typed either way, the middleware requires that context
  of the app that mounts it, a compile error otherwise.

### 0.1.0

- **The request's context anywhere it runs.** `alxia().use(contextStorage())`
  lets a service, a repository or a logger read the context of the route
  that called it with `getContext()`, without it being passed down, through
  every `await`, timer and promise, and never another request's.
- **Typed by the app.** `contextStorage<typeof base>()` gives `context()` and
  `tryContext()` what a route declared next on `base` reads: the values its
  `decorate` and `derive` added.
- **The request before routing.** `getRequestContext()` reads the request
  before routing and in a 404, with the route it
  reached and the error it failed with; `tryGetRequestContext()` returns
  `undefined` outside a request instead of throwing.
- **Jobs and tests.** `runWithContext(ctx, work)` runs code that reads the
  context outside a request.
- **A refusal that says why.** Where there is no context, `getContext()`
  throws a `ContextStorageError` coded `OUTSIDE_REQUEST` or `NOT_ROUTED`,
  and `tryGetContext()` returns `undefined`.
  `use(contextStorage)`, the factory uncalled, fails `tsc` and throws
  where it is declared (since alxia 0.5), rather than answering its routes 500.
- **Ported from `hono/context-storage`.** One store, and `getContext()`
  read wherever it is called, as Hono's is: code written against one ports
  to the other.
