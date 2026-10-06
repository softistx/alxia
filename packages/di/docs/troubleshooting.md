# Troubleshooting

One entry for each error you can hit, headed by the message you will search
for. Runtime errors carry a stable `code`: match on the `code` or the class,
never on the message. The errors of `@nxgt/di` itself, such as
`Token 'db' is not provided` on `scope.resolve`, are in
[its troubleshooting page](https://github.com/softistx/nxgt-di/blob/develop/packages/di/docs/troubleshooting.md).

## Compile errors

### `Expected 2 arguments, but got 1` on `di(container)`

**When:** the Container has a Slot, and `di` was given no options.

**Fix:** compute the Slots from the request, with `slots`:

```ts
const deps = di(services, {
	slots: ({ request }) => ({ tenant: request.headers.get('x-tenant') ?? 'public' }),
});
```

### `Type '() => {}' is not assignable to type 'undefined'` on `slots`

**When:** you passed `slots` for a Container that has no Slot.

**Fix:** drop `slots`, which nothing would read; or declare a Slot with
`.slot(Token)` first.

### `` `user` is missing from the context: add a middleware that gives it before this one `` on `use(deps)`

**When:** `slots` is annotated to read `user`, and the `di` is given to a
`use` where no earlier middleware adds it.

**Fix:** give the middleware that adds `user` first, `alxia().use(auth).use(deps)`,
or let `slots` read what the base context holds.

### `` `scope` is missing from the context `` on `use(deps.expose(...))`

**When:** an `expose` stands where no `di` stands before it: the `di` is
missing, comes after it, or is in another group.

**Fix:** give the `di` to `use` first, on the app or in an enclosing group.

### `` `scope` is in the context with another type than this middleware reads ``

**When:** the `expose` comes from the `di` of another Container than the one
whose Scope is on the context.

**Fix:** expose from the `di` whose Container provides those Tokens.

### `Token 'orders' is not provided` on `expose`

**When:** an `expose` map holds a Token the Container does not provide, or
provides with another value type.

**Fix:** provide it in the Container given to `di`.

### `'reply' is a key of the context: expose under another name`

**When:** an `expose` map uses `scope`, or a key of the base context such as
`reply`, `request`, `url`, `cookies` or `set`.

**Fix:** pick another key: `deps.expose({ replies: RepliesT })`.

### `Argument of type 'SlotsReadAny' is not assignable` on `use(deps)`

**When:** `slots` reads its context as `any`: `(ctx: any) => …`. `any` would
let the middleware stand where what it reads is not given.

**Fix:** annotate what it reads, `({ user }: { user: User }) => …`, or leave
it unannotated.

### `Property 'scope' does not exist`

**When:** a route reads `scope` but is declared before the `di`'s `use`, or
outside the group the `di` was given to.

**Fix:** declare the route after `use(deps)`, inside its group.

## Runtime errors

### `expose('orders') ran on a request with no Scope: give its di() middleware to use() before it`

`ScopeNotMountedError`, code `DI_SCOPE_NOT_MOUNTED`. It extends `@nxgt/di`'s
`DiError`; `token` is `undefined`, and `keys` lists the keys of the map.

**When:** an `expose` ran with no Scope on its context. The types refuse
that, so it is reached through a cast, or a middleware that replaced
`scope` with something else.

**Fix:** remove the cast, and give the `di` to `use` before the `expose`.

### `Cannot resolve Token 'orders': the Scope has been disposed`

`ScopeDisposedError`, from `@nxgt/di`, code `DI_SCOPE_DISPOSED`.

**When:** something resolved from the Scope after its route had answered:
usually a streamed body, or a promise left running after the route.

**Fix:** resolve what the stream needs before answering. See
[Streaming](guide/request-scopes.md#streaming).

### `Cannot create a Scope: the Container has been disposed`

`ContainerDisposedError`, from `@nxgt/di`, code `DI_CONTAINER_DISPOSED`, on
a request's first `resolve`.

**When:** the Container was disposed of while an app still serves from it:
an `onStop` of yours disposed of it on a base that is forked, or the app
listened again after the stop that disposed of it.

**Fix:** dispose of it through `app.plugin(deps.lifecycle)`, which waits for
the last app to stop, and build a new Container for an app that listens
again. See [Lifecycle](guide/lifecycle.md#forks).

### `@alxia/di: disposing the Scope of GET /orders failed`

Logged by the default `onDisposeError`, followed by the error, often a
`DisposeError` (`DI_DISPOSE_FAILED`) from `@nxgt/di` holding each failure.

**When:** a scoped value's `dispose` threw. The response was sent unchanged.

**Fix:** fix the `dispose` that threw, and pass `onDisposeError` to send the
error to your own logger.

### Every resolve of a request rejects with the same error

**When:** `slots` threw or rejected. The Scope was never created, so each
`resolve` of that request rejects with that error, and nothing is disposed
of.

**Fix:** make `slots` total (default a missing header), or refuse the
request in an earlier middleware, before anything resolves.
