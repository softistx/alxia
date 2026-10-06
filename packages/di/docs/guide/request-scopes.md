# Request Scopes

`di` gives each request a Scope of your Container. This page covers how it
is created, how routes get their values, and when it is disposed of.

## The Scope on the context

```ts
import { alxia } from '@alxia/core';
import { di } from '@alxia/di';
import { container, token } from '@nxgt/di';

const RequestId = token<string>()('requestId');

const services = container().provide(RequestId, () => crypto.randomUUID(), {
	lifetime: 'scoped',
});

const deps = di(services); // no Slot, so no options needed

const app = alxia()
	.use(deps)
	.get('/id', async ({ scope, reply }) => reply(200, await scope.resolve(RequestId)));
```

`di` is a middleware: what it adds, `scope`, is read by the routes and the
middlewares declared after it, and only by those. A route declared before
it has no `scope`, and reading one fails to compile. Given to `use` on the
app, it runs on every request, a 404 included; in a group, on the group's
routes alone.

`scope` is a Scope of `@nxgt/di`: `resolve` takes any Token the Container
provides, singletons included, and always returns a Promise. Its `resolve`
is bound, so `({ scope: { resolve } })` works.

## The Scope is lazy

Nothing happens when the middleware runs. The Scope is created on the
first `resolve`, from a route or from an `expose`, and only then is `slots`
called. A `/health` route that resolves nothing creates no Scope and never
computes a Slot.

## Slots

When the Container has Slots, `slots` is required, and must give a value of
the right type for each. It receives the request's context:

```ts
import { alxia, defineMiddleware } from '@alxia/core';
import { di } from '@alxia/di';
import { container, token } from '@nxgt/di';

interface User { id: string }
const Principal = token<User>()('principal');
const Tenant = token<string>()('tenant');

const withSlots = container().slot(Principal).slot(Tenant);

const auth = defineMiddleware(({ request, reply }, next) => {
	const id = request.headers.get('x-user');
	return id === null ? reply(401, { error: 'unauthorized' as const }) : next({ user: { id } });
});

// Annotated: it reads `user`, so the middleware is refused where no `user` is.
const scoped = di(withSlots, {
	slots: ({ user, request }: { user: User; request: Request }) => ({
		principal: user,
		tenant: request.headers.get('x-tenant') ?? 'public',
	}),
});

const app = alxia().use(auth).use(scoped);
// alxia().use(scoped) alone: `user` is missing from the context, a compile error
```

- Unannotated, `slots` reads the base context (`request`, `url`, `cookies`…).
  Annotated, what it reads beyond it is required where the middleware is
  given. Annotated `any`, `di` is refused everywhere: annotate what it
  reads, or leave it unannotated.
- It runs at most once per request, even under concurrent resolves, and may
  be async. When it throws, every `resolve` of that request rejects with its
  error, and there is no Scope to dispose of.
- A key that is no Slot is ignored. TypeScript does not check a function's
  returned object for extra keys, so a misspelt Slot name shows up as the
  missing one.

## Exposing values

`deps.expose({ key: Token })` is a middleware that resolves each Token in
the request's Scope and adds it to the context under its key. Give it to a
group's `use`, or to one route:

```ts
import { alxia } from '@alxia/core';
import { di } from '@alxia/di';
import { container, token } from '@nxgt/di';

interface Report { rows(): Promise<unknown[]> }
declare const report: Report;
const ReportT = token<Report>()('report');
const RequestId = token<string>()('requestId');

const deps = di(
	container()
		.provide(ReportT, () => report)
		.provide(RequestId, () => crypto.randomUUID(), { lifetime: 'scoped' }),
);

const app = alxia()
	.use(deps)
	.group('/reports', (group) =>
		group
			.use(deps.expose({ report: ReportT, requestId: RequestId }))
			.get('/daily', async ({ report, requestId, reply }) =>
				reply(200, { requestId, rows: await report.rows() }),
			),
	)
	.get('/me', deps.expose({ requestId: RequestId }), ({ requestId, reply }) =>
		reply(200, requestId),
	);
```

- The Tokens are resolved together, before the route runs. A failing
  factory is a rejection like any other: answered 500, or caught by a
  `try`/`catch` middleware around it, and the Scope is still disposed of.
- A value is resolved in the request's Scope, so a route that also calls
  `scope.resolve(RequestId)` gets the same one.
- Each Token is checked against the Container at compile time. `scope` and
  the base context's keys (`reply`, `request`, `url`…) are refused as keys.
- It stands after a `di` of its Container: in the context it reads, `scope`
  must be that Container's Scope, or the `use` fails to compile.

There is no `app.services`: nothing is resolved by name from the app, and
no route reads a value nobody exposed to it.

## Two `di` on one request

The same `deps` given twice to one route makes one Scope: the first owns it
and disposes of it. Two `di` of different Containers may nest, the inner
one in a group: inside it `scope` is the inner Scope, and once the inner
middleware has disposed of it, `scope` is the outer one again, so the outer
middleware's code after its `await next()` reads its own.

## Disposal

The Scope is disposed of once the rest of the route has answered, whether it
replied or threw: its scoped values and the transients it resolved, in
reverse creation order. Singletons belong to the Container.

A failure while disposing goes to `onDisposeError`, after the response is
decided, so it never replaces the response nor the route's error:

```ts
import { di } from '@alxia/di';
import { container } from '@nxgt/di';

declare const logger: { error(message: string, error: unknown): void };

const logged = di(container(), {
	onDisposeError: (error, ctx) => logger.error(`dispose failed: ${ctx.url.pathname}`, error),
});
```

By default it is `console.error`. What `onDisposeError` itself throws is
ignored.

### Streaming

The Scope is disposed of when the route has answered, which for a streamed
body (server-sent events, a page rendered as it goes) is before the body
has been sent. Resolve what the stream needs before answering, and keep no
scoped value for the stream: a `resolve` made after disposal rejects with
`ScopeDisposedError`, and a scoped value may already be closed. A singleton
outlives the request and is safe to keep using.

## Testing a route

Build the app from the Container it is given, and send it requests with
`app.request()`: no server needed. `override` swaps a Provider for a fake:

```ts
import { alxia } from '@alxia/core';
import { di } from '@alxia/di';
import { container, token } from '@nxgt/di';

interface Db { query(sql: string): Promise<unknown[]> }
declare function connect(): Promise<Db>;
const DbT = token<Db>()('db');

const services = container().provide(DbT, () => connect());

export function makeApp(given: typeof services) {
	const deps = di(given);
	return alxia()
		.use(deps)
		.get('/rows', async ({ scope, reply }) =>
			reply(200, await (await scope.resolve(DbT)).query('select 1')),
		);
}

// In a test:
const fake: Db = { query: async () => [{ id: 1 }] };
const res = await makeApp(services.override(DbT, fake)).request('/rows');
// await res.json() → [{ id: 1 }]
```

A Slot is not overridden: give `slots` the value the test needs.
