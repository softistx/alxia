# The app's type

This page covers what `typeof app` carries: the route table a client is
typed from, the context a service can be typed with, and the helpers that
read them.

```ts
import { alxia, type RoutesOf } from '@alxia/core';
import { z } from 'zod';

const app = alxia().get(
	'/users/:id',
	{
		params: z.object({ id: z.coerce.number() }),
		response: { 200: z.object({ id: z.number(), name: z.string() }) },
	},
	({ params, reply }) => reply(200, { id: params.id, name: 'Ada' }),
);

export type App = typeof app;

type GetUser = RoutesOf<App>['/users/:id']['GET'];
type Input = GetUser['input'];   // { readonly params: { readonly id: string | number } }
type Output = GetUser['output'];
// | { status: 200; data: { id: number; name: string } }
// | { status: 400; data: ValidationErrorBody }
// | { status: 500; data: InternalErrorBody }
```

Export `typeof app` from the server, and import it **as a type** wherever
it is read — a client bundle then holds none of the server's code:

```ts
import { client } from '@alxia/client';
import type { App } from './server';

const api = client<App>('http://localhost:3000');
```

## `RoutesOf<App>`

```ts
type RoutesOf<App> = /* routes by path, then by method */;
interface RouteRecord<Input = unknown, Output = unknown> {
	readonly input: Input;
	readonly output: Output;
}
type RouteTable = {
	readonly [path: string]: { readonly [method in Method]?: RouteRecord };
};
```

The paths are the full paths — prefixes, groups and plugins applied — as
declared, `/users/:id`. A socket is under `WS`, with a `SocketRecord`
([WebSockets](websockets.md#in-the-apps-type)).

### `input`: what a client sends

| Part | In `input` when | Typed as |
| --- | --- | --- |
| `params` | the path has parameters | `{ [name]: string \| number }`, whatever the schema |
| `query`, `headers`, `body` | the route has that schema | the schema's **input**; optional when it accepts `undefined` or `{}` |
| `cookies` | the route has that schema | the schema's input, always optional: a browser sends its own |

The input of a schema that coerces with `z.coerce` is `unknown`; `zq` in
[`@alxia/zod`](https://www.npmjs.com/package/@alxia/zod) keeps it the value
a client means to send.

### `output`: every outcome a client may read

A union of `Outcome<Status, Data>`, one per status the route may answer:

```ts
interface Outcome<Status extends number = number, Data = unknown> {
	readonly status: Status;
	readonly data: Data;
}
```

| Outcome | When |
| --- | --- |
| each declared `response` status, its data the schema's **output** | the route has `response` schemas |
| each reply the handler can return | it has none |
| a redirect the handler returns | always |
| each reply a `derive`, `wrap` or `onError` before the route can return | always |
| `400`, `ValidationErrorBody` | the route validates a part of its request, and no `onRefusal` hook is declared before it |
| each reply the `onRefusal` hook before the route can return, in place of the 400 and the 413 | the route validates a part of its request, or has a `bodyLimit`; the default of each kind too when the hook may return nothing |
| `413`, `ContentTooLargeBody` | the route has a `bodyLimit` of its own, or a `bodyLimit()` was called before it ([Routes](routes.md#body-size-bodylimit)), and no `onRefusal` hook is declared before it, or one that may return nothing |
| `500`, `InternalErrorBody` | always |

```ts
const guarded = alxia()
	.derive(({ request, reply }) =>
		request.headers.get('authorization') === 'Bearer ada'
			? { user: 'ada' }
			: reply(401, { error: 'unauthenticated' as const }),
	)
	.get('/me', ({ user, reply }) => reply(200, { user }));

type Me = RoutesOf<typeof guarded>['/me']['GET']['output'];
type Unauthenticated = Extract<Me, { status: 401 }>['data']; // { error: 'unauthenticated' }
```

This is why the client is honest: checking `status` narrows `data`, and a
status the server can answer is never missing from the union. The 404, 405
and 426 the app answers outside every route (`RoutingErrorBody`) and a
`Response` from a global hook are not in it.

## `Jsonify<T>`

What a value reads as once it has crossed the wire: `JSON.stringify`, then
`JSON.parse`. Every `data` in `output` goes through it.

| Server sends | Client reads |
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

## Testing the types

Bun's `expectTypeOf` checks the contract the same way the client will
read it:

```ts
import { expectTypeOf, test } from 'bun:test';
import type { RoutesOf } from '@alxia/core';

test('GET /users/:id answers 200, 400 or 500', () => {
	type Route = RoutesOf<typeof app>['/users/:id']['GET'];
	expectTypeOf<Route['output']['status']>().toEqualTypeOf<200 | 400 | 500>();
	expectTypeOf<Extract<Route['output'], { status: 200 }>['data']>().toEqualTypeOf<{
		id: number;
		name: string;
	}>();
});
```

## Other exported types

| Types | Name |
| --- | --- |
| `RouteInput`, `RouteOutput`, `OutcomeOf`, `RouteEntryOf` | the pieces of one route's record |
| `Context`, `BaseContext`, `RequestContext`, `ResponseSettings` | what handlers and hooks read ([Hooks](hooks.md#what-each-hook-reads)) |
| `RouteSchema`, `ResponseSchemas`, `RouteDetail`, `ValidSchema` | what a route declares, and the checks on it ([Routes](routes.md#what-the-types-refuse)) |
| `StandardSchemaV1`, `StandardResult`, `StandardIssue`, `InferInput`, `InferOutput` | the Standard Schema interface |
| `ValidationErrorBody`, `ValidationIssue`, `ValidationTarget`, `InternalErrorBody`, `RoutingErrorBody` | the bodies the framework answers |
| `RoutePath`, `JoinPath`, `PathParams`, `PathParamName` | paths: `PathParams<'/users/:id/files/*'>` is `{ readonly id: string; readonly '*': string }` |
| `StatusCode`, `InformationalStatus`, `SuccessStatus`, `RedirectStatus`, `ClientErrorStatus`, `ServerErrorStatus` | the statuses a route may declare |
| `Method`, `Empty`, `MaybePromise`, `Simplify` | small helpers |

## See also

- [`@alxia/client`](https://www.npmjs.com/package/@alxia/client): the
  client this type is for.
- [Routes](routes.md): what each schema part adds to `input`.
