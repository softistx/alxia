# @alxia/di

Dependency injection for [alxia](https://www.npmjs.com/package/@alxia/core),
on [`@nxgt/di`](https://www.npmjs.com/package/@nxgt/di): typed Tokens, no
decorators, no dependency. Each request gets its own Scope, created only if
the request uses it and disposed of when it ends. A route reads what it
needs from its context, exposed by name, and a Token the Container does
not provide fails to compile.

```sh
bun add @alxia/di @nxgt/di @alxia/core
bun add -d typescript
```

The peers are `@alxia/core` (`^0.14.0`: `deps.lifecycle` reads the server `onStop` is given), `@nxgt/di` (`^0.2.0`) and `typescript`
(`^6.0.3 || ^7.0.0`): the Container is the app's own, built with its copy of
`@nxgt/di`. Your `tsconfig.json` needs:

```jsonc
{
	"compilerOptions": {
		"moduleResolution": "bundler", // `nodenext` is not supported
		"strict": true // the provide-order checks of @nxgt/di need strictFunctionTypes
	}
}
```

## Usage

```ts
import { alxia } from '@alxia/core';
import { di } from '@alxia/di';
import { container, token } from '@nxgt/di';

interface Db {
	orders(user: string): Promise<string[]>;
	close(): Promise<void>;
}
declare function connect(): Promise<Db>;

const DbT = token<Db>()('db');
const User = token<string>()('user');
const Orders = token<string[]>()('orders');

const services = container()
	.provide(DbT, () => connect(), { dispose: (db) => db.close() })
	.slot(User) // a value each request brings
	.provide(Orders, async ({ get }) => (await get(DbT)).orders(await get(User)), {
		lifetime: 'scoped',
	});

// The Container has a Slot, so `slots` is required: the request's values.
const deps = di(services, {
	slots: ({ request }) => ({ user: request.headers.get('x-user') ?? 'anonymous' }),
});

const app = alxia()
	.plugin(deps.lifecycle) // disposes of the Container when the app stops
	.use(deps) // a lazy Scope per request, as `scope`
	.group('/orders', (group) =>
		group
			.use(deps.expose({ orders: Orders })) // resolved, as `orders`
			.get('/', ({ orders, reply }) => reply(200, orders)),
	)
	.get('/health', ({ reply }) => reply(200, 'ok')); // no Scope made, no `slots` called

await services.init(); // the singletons, before listening: never in onStart
app.listen(3000);
```

- **`di(container, options)`** is a middleware: given to `use`, the routes
  after it read `scope`, the request's Scope, typed by the Container:
  `await scope.resolve(Orders)`.
- **The Scope is lazy.** It is created, and `slots` called, on its first
  `resolve`. A request that resolves nothing costs nothing.
- **`slots`** is required exactly when the Container has Slots, and
  refused when it has none. Annotate its parameter to read what an earlier
  middleware adds, `({ user }: { user: User }) => …`: every `use` of the
  middleware is then checked for it.
- **`deps.expose({ key: Token })`** resolves each Token in the request's
  Scope and adds it to the context under its key. It stands after the
  `di`, which the types check, and each Token is checked against the
  Container. `scope` and the base context's keys (`reply`, `request`…) are
  refused.
- **Disposal** runs once the route has answered, whether it replied or
  threw. A failure goes to `onDisposeError` (by default `console.error`)
  and never replaces the response. A streamed body must not use scoped
  values once its route has answered.
- **`deps.lifecycle`** disposes of the Container when the last app it was
  given to that started stops: forks of one base share it safely, and a
  `stop()` of an app that never listened disposes of nothing
  ([Lifecycle](https://github.com/softistx/alxia/blob/develop/packages/di/docs/guide/lifecycle.md#forks)).
  Without it, the Container is yours to dispose of.

There is no `app.services` and no registry: a route reads the Scope, or
what an `expose` before it put on its context by name.

## API

| export | |
| --- | --- |
| `di(container, options?)` | the middleware, given to `use`; adds `scope`, with `.expose(tokens)` and `.lifecycle` on it |
| `DiMiddleware` | what `di` returns |
| `DiOptions` | its options: `slots`, required exactly when the Container has Slots, and `onDisposeError` |
| `SlotsFn` | the type of `slots`: the request's context to its Slot values |
| `ScopeContext` | what `di` adds to the context: `scope` |
| `Exposed` | what an `expose` map adds to the context |
| `SlotsReadAny` | what `di` returns when `slots` reads its context as `any`: refused by `use` |
| `ScopeNotMountedError` | an `expose` that ran with no Scope on its context; code `DI_SCOPE_NOT_MOUNTED`, a `DiError` |

## Errors

The runtime errors carry a stable `code`: match on it or on the class,
never on the message. Each message, its cause and its fix are in
[Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/di/docs/troubleshooting.md).

| class | `code` | meaning |
| --- | --- | --- |
| `ScopeNotMountedError` (this package, a `DiError`) | `DI_SCOPE_NOT_MOUNTED` | an `expose` ran with no Scope on its context, past the types |
| `ScopeDisposedError` (`@nxgt/di`) | `DI_SCOPE_DISPOSED` | a `resolve` after the request's route had answered: a streamed body, a promise left running |
| `ContainerDisposedError` (`@nxgt/di`) | `DI_CONTAINER_DISPOSED` | the Container was disposed of while an app still serves from it |
| `DisposeError` (`@nxgt/di`) | `DI_DISPOSE_FAILED` | a `dispose` threw; handed to `onDisposeError`, never answered |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/di/docs): the request's Scope, Slots from the context, `expose` in groups and routes, disposal and streaming, the Container's lifecycle across forks, and testing.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/di/docs/troubleshooting.md): a `tsc` error on `di`, `use` or `expose`, and each runtime error.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/di/docs/roadmap.md): what is coming, and what is not planned.
