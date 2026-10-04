# The app's type

This page covers what `typeof app` carries: the context its routes read,
which a service can be typed with, and the helpers that read it.

alxia is **OpenAPI spec first**: the OpenAPI document is the contract
between a server and its clients, and a client is generated from it with
the generator of your choice — the examples use
[`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen).
A route adds nothing to the app's type: `typeof app` holds no route
table, and no client is typed from it. What the types check is the
server itself: what each handler reads, the replies `responds` declares,
the paths and their parameters ([Routes](routes.md#what-the-types-refuse)).

```ts
class Alxia<Ctx extends object = Empty, Prefix extends string = '', Shortcuts extends AnyReply = never>;
```

| Parameter | What it holds |
| --- | --- |
| `Ctx` | what `decorate`, `derive` and plugins added to the context of the routes declared next |
| `Prefix` | the prefix every route declared on the app is under |
| `Shortcuts` | the replies the hooks before the next route may answer with, and the `onRefusal` hooks in force |

## `ContextOf<App>`

What a route declared next on `App` reads: `BaseContext`, plus everything
`decorate`, `derive` and plugins added. A service or a GraphQL resolver
outside the chain types its context with it:

```ts
import { alxia, type ContextOf } from '@alxia/core';

const base = alxia()
	.decorate({ greeting: 'Hello' })
	.derive(({ request }) => ({ user: request.headers.get('x-user') ?? 'anonymous' }));

type Ctx = ContextOf<typeof base>; // BaseContext, with `greeting` and `user`

function greet(ctx: Ctx): string {
	return `${ctx.greeting}, ${ctx.user}`;
}

const app = base.get('/hello', (ctx) => ctx.reply(200, greet(ctx)));
```

## `Register` and `AppContext`

`ContextOf<typeof base>` needs `base`. A file that should not import the
app — a file of routes, a service three calls down — reads the context
`Register` names instead. Augment it once, beside the chain that builds
the context:

```ts
// src/context.ts
import { alxia } from '@alxia/core';

export const base = alxia()
	.decorate({ greeting: 'Hello' })
	.derive(({ request }) => ({ user: request.headers.get('x-user') ?? 'anonymous' }));

declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}
```

```ts
// src/greet.ts — no import of the app
import type { AppContext } from '@alxia/core';

export function greet({ greeting, user }: AppContext): string {
	return `${greeting}, ${user}`;
}
```

| Export | What it is |
| --- | --- |
| `Register` | the interface to augment, with `context: typeof base` |
| `AppContext` | `ContextOf` of the registered app: `BaseContext` when nothing is registered |
| `defineRoutes(prefix?)` | routes built on that context, requiring it of the app that mounts them ([Groups and plugins](groups-and-plugins.md#splitting-the-app-across-files)) |
| `RegisteredBase` | the registered app, or `Alxia<Empty, '', never>` |
| `RegisteredOf<R>` | the app a `Register`-shaped interface names: what a test reads without augmenting |
| `InvalidRegister` | what a `context` that is not an alxia app reads as: an app whose only key is the message `Register.context must be typeof base, …`, so reading anything of it is a compile error |

What it types, and what it does not:

- **`AppContext`**, for a service, a resolver, a job's context.
- **`defineRoutes`**: its routes read the context, and `use` checks that
  the app mounting them gives it.
- **`contextStorage()`** from `@alxia/context-storage`, with no type
  argument: its `context()` reads `AppContext`, and an app that does not
  give it cannot use it.
- **`alxiaOf(context)`** from `@alxia/react-router`, when that package's
  own `Register` names no server.
- **Not `defineMiddleware(fn)`**: a middleware may run before `base` gives
  anything, so it reads `BaseContext`. One that needs the registered
  context names it, `defineMiddleware<AppContext>()(fn)`, and a route or a
  `use` whose context does not give it refuses it.

**Register `base`, not the app.** The app mounts the route files, and their
type reads `Register`: registered, the app would be typed by itself, and
TypeScript gives it `any` with `TS7022`. For the same reason the chain you
register cannot read `Register` either: no `defineMiddleware<AppContext>()`
and no `contextStorage()` in `base` itself; give them to the app, after it.

**One `Register` per program.** A second declaration with another
`context` is `TS2717`. In a monorepo, each app has its own `tsconfig.json`;
a package meant for several apps names what it reads with
[`definePlugin<Requires>()`](writing-a-plugin.md#a-plugin-that-needs-an-earlier-one)
instead.

## `Jsonify<T>`

What a value reads as once it has crossed the wire: `JSON.stringify`, then
`JSON.parse`. A reply's body is sent so.

| Server sends | A client reads |
| --- | --- |
| `Date`, anything with `toJSON()` | what `toJSON` returns: a `string` for a `Date` |
| `Blob`, `ReadableStream`, `ArrayBuffer`, a typed array | `Blob` |
| an async iterable of `T` | `AsyncIterable<Jsonify<T>>` |
| `Map`, `Set` | `Record<string, never>` |
| a function, a `bigint`, a `symbol` property | dropped |

```ts
import type { Jsonify } from '@alxia/core';

type Wire = Jsonify<{ at: Date; tags: Set<string>; save(): void }>;
// { at: string; tags: Record<string, never> }
```

## Testing

Call the app in process with `app.request()` — or `app.fetch`, given a
`Request` — and check what it answers; check what a handler reads with
Bun's `expectTypeOf`, inside it:

```ts
import { expect, expectTypeOf, test } from 'bun:test';
import { alxia, responds, validate } from '@alxia/core';
import { z } from 'zod';

const app = alxia().get(
	'/users/:id',
	validate({ params: z.object({ id: z.coerce.number() }) }),
	responds({ 200: z.object({ id: z.number(), name: z.string() }) }),
	({ params, reply }) => {
		expectTypeOf(params.id).toEqualTypeOf<number>();
		return reply(200, { id: params.id, name: 'Ada' });
	},
);

test('GET /users/:id answers 200, or 400 for an id that is not a number', async () => {
	const found = await app.request('/users/1');
	expect(found.status).toBe(200);
	expect(await found.json()).toEqual({ id: 1, name: 'Ada' });
	expect((await app.request('/users/x')).status).toBe(400);
});
```

## Other exported types

| Types | Name |
| --- | --- |
| `Context`, `BaseContext`, `RequestContext`, `ResponseSettings`, `ResponseCookies` | what handlers and hooks read ([Hooks](hooks.md#what-each-hook-reads)) |
| `RequestSchemas`, `Validated`, `ResponseSchemas`, `RouteOptions`, `RouteDetail`, `RouteSchema`, `ValidSchema` | what a route declares — `validate`'s and `responds`' arguments, its options — and the checks on it ([Routes](routes.md#what-the-types-refuse)) |
| `StandardSchemaV1`, `StandardResult`, `StandardIssue`, `InferInput`, `InferOutput` | the Standard Schema interface |
| `ValidationErrorBody`, `ValidationIssue`, `ValidationTarget`, `InternalErrorBody`, `RoutingErrorBody` | the bodies the framework answers |
| `RoutePath`, `JoinPath`, `PathParams`, `PathParamName`, `PathAt`, `CheckedPath` | paths: `PathParams<'/users/:id/files/*'>` is `{ readonly id: string; readonly '*': string }` |
| `StatusCode`, `InformationalStatus`, `SuccessStatus`, `RedirectStatus`, `ClientErrorStatus`, `ServerErrorStatus` | the statuses a route may declare |
| `Method`, `Empty`, `MaybePromise`, `Simplify` | small helpers |

## See also

- [Upgrading](../upgrading.md#no-more-client-spec-first): the route table and the typed client, removed in 0.4.
- [Routes](routes.md): what each middleware adds to what the handler reads.
