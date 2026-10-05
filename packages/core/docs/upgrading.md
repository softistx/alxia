# Upgrading to the next release

This page lists what each release changes for an app built on
`@alxia/core`, the next one first: what changed, the code before and
after, and whether it can break yours.

## 0.5.0

The next release, `@alxia/core` 0.5.0, removes every form 0.4 deprecated,
and keeps one: a middleware is a plain `(ctx, next)` function.

| Change | Package | Can it break your code |
| --- | --- | --- |
| [One middleware form](#one-middleware-form) | core | no: new; a plain function is now a middleware wherever one is given |
| [Readable type errors](#readable-type-errors) | core | no: the same mistakes, one error each, naming the key |
| [`defineMiddleware(fn)` reads the registered context](#definemiddlewarefn-reads-the-registered-context) | core | yes, for a middleware the registered base is built with: `defineMiddleware<Empty>()(fn)` |
| [The request hooks are removed](#the-request-hooks-are-removed) | core | yes: `onRequest`, `onResponse`, `around`, `wrap`, `onError` and `onRefusal` are gone |
| [The forms of 0.3 are removed](#the-forms-of-03-are-removed) | core | yes: a list of hooks, `defineHook`, `defineWrap`, a schema before the handler or in the options |
| [`use` takes middlewares, `plugin` takes plugins](#use-takes-middlewares-plugin-takes-plugins) | core, and every package middleware | yes: `use(plugin)`, `plugin(middleware)` and `app.plugin(cors())` throw |
| [Types removed](#types-removed) | core, context-storage, secure-headers, zod | yes: `Alxia<Ctx, Prefix, Shortcuts>`, `MiddlewareMark`, `MadeByDefineMiddleware`, the hook types, `ContextStoragePlugin`, `NoncePlugin`, `zodConverter` |
| [`@alxia/openapi-routes` leaves the repository](#alxiaopenapi-routes-leaves-the-repository) | openapi, openapi-routes | yes, for an import of `@alxia/openapi-routes` or of `exactly` |
| [Problem details, opt in](#problem-details-opt-in) | core, jwt, janus | no: `errors: 'json'` stays the default |
| [Probes: `health()`](#probes-health) | core | no: new |
| [A graceful shutdown on `SIGTERM`](#a-graceful-shutdown-on-sigterm) | core, react-router, graphql | yes, for a process with signal handlers of its own: `listen` installs its own |
| [What behaves differently](#what-behaves-differently) | core | yes, for a middleware that relied on a hook answering an error or a refusal first |

### One middleware form

**What changed.** `use(...)`, a route's middlewares, `ws(path, ...)` and
`route(operation, ...)` take a plain `(ctx, next)` function, written
inline. What it passes `next({ … })` is inferred, and the middlewares after
it and the handler read it typed. Up to 8 middlewares per call; they
accumulate: what one adds, the next one reads.

```ts
// 0.4: use() took only what defineMiddleware had marked
const auth = defineMiddleware(({ request, reply }, next) => {
	const id = request.headers.get('x-user');
	return id ? next({ user: { id } }) : reply(401, { error: 'unauthorized' as const });
});
alxia().use(auth).get('/me', ({ user, reply }) => reply(200, user));

// 0.5: a plain function anywhere
alxia()
	.use(({ request, reply }, next) => {
		const id = request.headers.get('x-user');
		return id ? next({ user: { id } }) : reply(401, { error: 'unauthorized' as const });
	})
	.use(({ user }, next) => next({ greeting: `hello ${user.id}` }))
	.get('/me', ({ user, greeting, reply }) => reply(200, { user, greeting }));
```

`defineMiddleware(fn)` and `defineMiddleware<Requires>()(fn)` stay, to
share a typed middleware: one kept in a module, or one that reads keys an
earlier middleware gives. It no longer marks the function: it types it and
returns it.

**Can it break your code.** No.

### Readable type errors

**What changed.** A middleware that reads a key the context in force does
not give is one TypeScript error, on that middleware — not "No overload
matches this call" — on TypeScript 6 as on 7. Its last line names the key:

```text
Type 'Promise<Next<Empty, Empty>>' is not assignable to type '"`user` is missing from the context: add a middleware that gives it before this one"'.
```

The other messages: `` "`user` is in the context with another type than
this middleware reads" ``, and, for a `validate({ params })` naming a
parameter the path lacks, `` "the path parameter `id` is not in this
route's path" `` ([Troubleshooting](troubleshooting.md#types)).

**Can it break your code.** No: what compiled still compiles. A
`@ts-expect-error` stays an error.

### `defineMiddleware(fn)` reads the registered context

**What changed.** Given no `Requires`, `defineMiddleware(fn)` reads the
context the app's `Register` names, as `defineRoutes` and `AppContext` do,
and a route or a `use` whose context does not give it refuses it. Nothing
registered, it reads `BaseContext`, as before. The workaround of 0.4 goes:

```ts
// before
import { type AppContext, defineMiddleware } from '@alxia/core';

export const profile = defineMiddleware<AppContext>()(async ({ db, user }, next) =>
	next({ profile: await db.users.find(user.id) }),
);

// after
import { defineMiddleware } from '@alxia/core';

export const profile = defineMiddleware(async ({ db, user }, next) =>
	next({ profile: await db.users.find(user.id) }),
);
```

**Can it break your code.** Yes, for a middleware the registered base is
itself built with: its type would read the base's, and the registration
then resolves to nothing — every middleware elsewhere fails with
`Property 'db' does not exist on type 'BaseContext'.` Say it reads nothing
of the registered context:

```ts
// src/context.ts
import { alxia, defineMiddleware, type Empty } from '@alxia/core';

const requestId = defineMiddleware<Empty>()((ctx, next) =>
	next({ requestId: ctx.request.headers.get('x-request-id') ?? 'none' }),
);

export const base = alxia().decorate({ db }).use(requestId);

declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}
```

A middleware a package publishes for any app says what it reads the same
way, `defineMiddleware<Empty>()(fn)` or `defineMiddleware<Requires>()(fn)`.

### The request hooks are removed

**What changed.** `onRequest`, `onResponse`, `around`, `wrap`, `onError`
and `onRefusal`, deprecated in 0.4, are gone from `Alxia`. Each is a
middleware given to `use`, which acts before and/or after `await next()`.
An error that escapes the route is answered at the route boundary: an
`HttpError` with its status and body, anything else with a 500. To answer
errors yourself, a middleware wraps `await next()` in `try`/`catch`;
`refusalOf(error)` reads a validation refusal. `settle(ctx, next())`
still gives an observer the response the client gets.

#### `onRequest`

```ts
// before
alxia().onRequest(({ request }) =>
	request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : undefined,
);

// after: first, so it answers before everything after it
alxia().use(({ request }, next) =>
	request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : next(),
);
```

An `onRequest` ran before routing; a middleware runs once the route is
known, so it reads `ctx.route` — `undefined` on a request no route matches.

#### `onResponse`

```ts
// before
alxia().onResponse((response) => {
	response.headers.set('x-powered-by', 'alxia');
});

// after: settle, so a 404 and a 500 carry it too
alxia().use(async (ctx, next) => {
	const response = await settle(ctx, next());
	response.headers.set('x-powered-by', 'alxia');
	return response;
});
```

#### `around`

```ts
// before
alxia().around(async (ctx, next) => {
	const started = performance.now();
	const response = await next();
	console.log(ctx.url.pathname, response.status, performance.now() - started);
	return response;
});

// after
alxia().use(async (ctx, next) => {
	const started = performance.now();
	const response = await settle(ctx, next());
	console.log(ctx.route ?? ctx.url.pathname, response.status, performance.now() - started);
	return response;
});
```

A WebSocket upgrade skipped an `around`; a `use()` middleware runs on it, as
a socket's own middlewares do.

#### `wrap`

```ts
// before
alxia().wrap(async ({ request, reply }, next) =>
	busy(request) ? reply(409, { error: 'busy' as const }) : next(),
);

// after
alxia().use(({ request, reply }, next) =>
	busy(request) ? reply(409, { error: 'busy' as const }) : next(),
);
```

Unlike a `wrap`, the middleware runs on a request no route matches too, and
its `next()` rejects with a refusal rather than resolving to the 400.

#### `onError`

```ts
// before
alxia().onError((error, { reply }) =>
	error instanceof PaymentError ? reply(402, { error: 'payment_required' as const }) : undefined,
);

// after: rethrow what is not yours, and the route boundary answers it
alxia().use(async ({ reply }, next) => {
	try {
		return await next();
	} catch (error) {
		if (!(error instanceof PaymentError)) throw error;
		return reply(402, { error: 'payment_required' as const });
	}
});
```

Give it after the observers (`logger()`, `telemetry()`, …), so they see its
reply.

#### `onRefusal`

```ts
// before
alxia()
	.onRefusal('validation', (refusal, { reply }) => reply(422, { detail: `the ${refusal.part} is invalid` }))
	.onRefusal('body_limit', (refusal, { reply }) => reply(413, { limit: refusal.limit }));

// after: before the routes that validate
alxia().use(async ({ reply }, next) => {
	try {
		return await next();
	} catch (error) {
		const refusal = refusalOf(error);
		if (refusal?.kind === 'validation') return reply(422, { detail: `the ${refusal.part} is invalid` });
		if (refusal?.kind === 'body_limit') return reply(413, { limit: refusal.limit });
		throw error; // anything else: the default answer
	}
});
```

`onRefusal(hook)`, of every kind, is the same middleware without the
branch on `refusal.kind`.

### The forms of 0.3 are removed

**What changed.** A route takes `(path, options?, ...middlewares,
handler)` alone.

#### A list of hooks, `[hooks]`

```ts
// before
app.delete('/posts/:id', [auth, canView], handler);
app.route(operations.deletePost, [auth], handler);

// after: drop the brackets
app.delete('/posts/:id', auth, canView, handler);
app.route(operations.deletePost, auth, handler);
```

A list throws where the route is declared:
`DELETE /posts/:id: a route takes its middlewares after the path, not in a list: drop the brackets`.

#### `defineHook`

```ts
// before
const auth = defineHook(async ({ request, reply }) => {
	const user = await session(request);
	return user ? { user } : reply(401, { error: 'unauthorized' as const });
});

// after: next(added) where the hook returned what it added, next() where it returned nothing
const auth = defineMiddleware(async ({ request, reply }, next) => {
	const user = await session(request);
	return user ? next({ user }) : reply(401, { error: 'unauthorized' as const });
});
```

`defineHook<Requires>()(hook)` is `defineMiddleware<Requires>()(fn)`, and a
hook that read `params` as strings reads `pathParams`.

#### `defineWrap`

```ts
// before
const exclusive = defineWrap<{ params: { id: string } }>()(
	async ({ params, reply }, next) =>
		(await locks.tryRun(params.id, next)) ?? reply(409, { error: 'busy' as const }),
);

// after
const exclusive = defineMiddleware<{ pathParams: { id: string } }>()(
	async ({ pathParams, reply }, next) =>
		(await locks.tryRun(pathParams.id, next)) ?? reply(409, { error: 'busy' as const }),
);
```

#### The 0.3 route form, `(path, schema, handler)`

```ts
// before
app.get('/users/:id', { params: UserId, response: { 200: User } }, handler);

// after
app.get('/users/:id', validate({ params: UserId }), responds({ 200: User }), handler);
```

#### A schema in the options

```ts
// before
app.post('/upload', { body: Upload, response: { 201: Stored }, bodyLimit: 25 * 1024 * 1024 }, auth, handler);

// after: the options keep bodyLimit and detail
app.post('/upload', { bodyLimit: 25 * 1024 * 1024 }, auth, validate({ body: Upload }), responds({ 201: Stored }), handler);
```

Either does not compile, and throws where the route is declared, naming
the keys:
`POST /upload: the options hold no schema (body, response): give validate(…) and responds(…) among the middlewares`.
A socket's options keep `message`, `send` and `detail`; its upgrade's
`params`, `query`, `headers` and `cookies` go to `validate`.

### `use` takes middlewares, `plugin` takes plugins

#### `use(plugin)`

```ts
// before
alxia().use(usersApp);

// after
alxia().plugin(usersApp);
```

It throws `use(): argument 1 is an app: a plugin is given to app.plugin(), use() takes middlewares`.

#### `plugin(middleware)`

```ts
// before: app-wide, as 0.3's global hooks, on the routes declared before it too
alxia().get('/health', health).plugin(timing);

// after: before the routes it should run on
alxia().use(timing).get('/health', health);
```

A middleware given to `plugin` is called once, with the app, and throws
`plugin(): the plugin function returned a promise, not an app: a plugin returns the app it is given; a middleware is given to use()`
— or `returned undefined`, for one that returns nothing. A `plugin(fn)`
takes exactly one function that returns the app it is given.

#### `app.plugin(cors())` and the other package middlewares

Every package middleware — `logger()`, `telemetry()`, `cors()`,
`secureHeaders()`, `compress()`, `rateLimit()`, `cache()`,
`idempotency()`, `contextStorage()`, `language()`, `createI18n()`,
`bearer()`, `session()`, `janusErrors()` — goes to `use`; its
`app.plugin(x())` path is gone.

```ts
// before
alxia().plugin(logger()).plugin(secureHeaders()).plugin(cors());

// after
alxia().use(logger(), secureHeaders(), cors());
```

### Types removed

| Removed | Instead |
| --- | --- |
| `Alxia<Ctx, Prefix, Shortcuts>`, three type arguments | `Alxia<Ctx, Prefix>`: drop the third. `Alxia<A, B, C>` fails with `Generic type 'Alxia<Ctx, Prefix>' requires between 0 and 2 type arguments.` |
| `MiddlewareMark`, and `Middleware<…> & MiddlewareMark` | `Middleware<Requires, Result>` alone: nothing is marked |
| `MadeByDefineMiddleware` | nothing: `use` takes any `(ctx, next)` function |
| `RequestHook`, `ResponseHook`, `AroundHook`, `RequestHookMethod`, `ResponseHookMethod`, `AroundMethod`, `WrapMethod`, `ErrorMethod`, `RefusalMethod` | a middleware, `Middleware<Requires, Result>` |
| `RouteHook`, `RouteWrap`, `AnyRouteHook`, `HookContext`, `RawRequestParts`, `ThreadHooks`, `RouteHookBase`, `HookProvided`, `AddedBy`, `RepliesBy`, `MaxRouteHooks`, `NoHookYet` | `Middleware`, `MiddlewareContext<Requires>`, `NoMiddlewareYet` |
| `RefusalHook`, `RefusalHandler`, `RefusalHandlersByKind`, `RefusalSchema`, `RefusalResponses`, `Refusing`, `FallsBack`, `RefusalsOf`, `DeclaredRefusal`, `ThenShortcuts`, `BodyLimited`, `BodyLimitShortcut`, `RefusingKind`, `KindFallsBack`, `KindRefusalsOf`, `OneKind` | `Refusal`, `RefusalOfKind<Kind>`, read by `refusalOf(error)` |
| `DeprecatedForms`, `DeprecatedSocketForms`, `PluginForms` | `MiddlewareForms`, `OptionsForms`, `SocketForms`, `SocketOptionsForms`, `UseForms`, `PluginMethod` |
| `ContextStoragePlugin<App>` (`@alxia/context-storage`) | `ContextStorageMiddleware<App>` |
| `NoncePlugin` (`@alxia/secure-headers`) | `NonceMiddleware` |
| `zodConverter` (`@alxia/zod`) | Zod's own `z.toJSONSchema(schema, { io: 'output' })`, or the schema written in the OpenAPI document, which is the source |

```ts
// before
type App = Alxia<{ db: Db }, '/api', never>;
import type { ContextStoragePlugin } from '@alxia/context-storage';
import type { NoncePlugin } from '@alxia/secure-headers';

// after
type App = Alxia<{ db: Db }, '/api'>;
import type { ContextStorageMiddleware } from '@alxia/context-storage';
import type { NonceMiddleware } from '@alxia/secure-headers';
```

```ts
// before
import { zodConverter } from '@alxia/zod';
const schema = zodConverter(Todo, 'output');

// after
import { z } from 'zod';
const schema = z.toJSONSchema(Todo, { io: 'output' });
```

### `@alxia/openapi-routes` leaves the repository

**What changed.** `@alxia/openapi-routes`, renamed `@alxia/openapi` at 0.4
and kept as a deprecated re-export, is deleted from the repository: no
release follows its 0.3.0. `@alxia/openapi` drops its own deprecated
names: `exactly` is `matchesSpec`, `ExactlyOptions` is `MatchesSpecOptions`.

```sh
bun remove @alxia/openapi-routes
bun add -d @alxia/openapi
```

```ts
// before
import { exactly, type ExactlyOptions } from '@alxia/openapi-routes';

// after
import { matchesSpec, type MatchesSpecOptions } from '@alxia/openapi';
```

`matchesSpec`'s messages start with `matchesSpec():`, where `exactly`'s
started with `exactly():`.

### Problem details, opt in

**What changed.** `alxia({ errors: 'problem' })` answers what alxia
answers on its own — an escaped `HttpError`, a refusal's 400 and 413, a
500, the router's 404, 405 and 426 — as RFC 9457 problems sent as
`application/problem+json`. `HttpError` takes an options object as its
third argument — `type`, `title`, `detail`, `extensions`, `message`,
`cause` — what its problem is made of; a string is still its message.
`errorFormat(ctx)` and `problemOf(ctx, init)` answer a middleware's own
error in the app's format; `@alxia/jwt`'s 401 and `@alxia/janus`'s
answers follow it.

```ts
// before, and still the default
alxia().get('/users/:id', () => {
	throw new HttpError(404, { error: 'no_user' }, 'no user');
}); // 404 {"error":"no_user"}

// 0.5, opted in
alxia({ errors: 'problem' }).get('/users/:id', () => {
	throw new HttpError(404, { error: 'no_user' }, { detail: 'No user 7' });
}); // 404 application/problem+json {"type":"about:blank","title":"Not Found","status":404,"detail":"No user 7","instance":"/users/7"}
```

A client generated with `@nxgt/openapi-codegen`'s `validationErrors`
(on by default) expects the old 400: under `errors: 'problem'`, set it to
`false` and declare the problems in the document
([Errors](guide/errors.md#declaring-problems-in-the-openapi-document)).

**Can it break your code.** No: nothing changes until an app sets
`errors: 'problem'`. A later release may make `problem` the default; an
app that wants the bodies of today then says `errors: 'json'`
([Errors](guide/errors.md#making-it-the-default)).

### Probes: `health()`

**What changed.** `app.plugin(health({ checks }))` adds `GET /health`,
liveness, and `GET /ready`, readiness: the checks run at once, each
within `timeout`, their report cached for `cache` ms, 503 when one fails
and from the moment the app starts shutting down. `isHealthRoute` leaves
them out of `matchesSpec`.

```ts
// before: a route of your own, which knew nothing of the shutdown
alxia().get('/health', ({ reply }) => reply(200, 'ok'));

// 0.5
alxia().plugin(health({ checks: { db: () => sql`select 1` } }));
```

**Can it break your code.** No.

### A graceful shutdown on `SIGTERM`

**What changed.** `listen` handles `SIGINT` and `SIGTERM`: readiness turns
503, new connections are refused, open sockets close with 1001, the
requests in flight finish within `shutdownTimeout` (10 000 ms by
default), streams of events end, the `onStop` hooks run, then the
process exits 0 — 1 when a hook throws. `stop()` runs the same shutdown
without the exit, and returns the same promise when called twice.
`@alxia/react-router`'s `start` now relies on it rather than on handlers
of its own, and `@alxia/graphql` ends its subscriptions when the shutdown
starts. `shutdownSignal(ctx)` ends a long response of your own.

```ts
// before
app.listen(3000);
process.on('SIGTERM', async () => {
	await app.stop();
	process.exit(0);
});

// 0.5: nothing to write; cleanup goes in onStop
app.onStop(() => pool.end()).listen(3000);
```

**Can it break your code.** Yes, for a process that handles its signals
itself: `listen`'s handler runs beside yours and exits once the `onStop`
hooks ran, so code after `await app.stop()` in your handler may not run.
Move that code into `onStop`, or keep the signals yours with
`listen({ signals: false })`. A `stop()` now waits at most
`shutdownTimeout` for the requests in flight, where it waited for them
indefinitely, and closes the open sockets with 1001
([Health and shutdown](guide/health-and-shutdown.md#graceful-shutdown)).

### What behaves differently

- **A refusal is a thrown error, for every middleware.** No hook answers a
  refusal inside the route any more: a middleware that awaits `next()`
  behind a `validate`, or a body past `bodyLimit`, gets the
  `ValidationError` or the `ContentTooLargeError` as the rejection of
  `next()`. To read the 400 or the 413 the client gets, `settle(ctx,
  next())`; to answer it, `try`/`catch` with `refusalOf(error)`.
- **A client that left reaches a `try`/`catch` middleware as an error.** A
  client that hangs up mid-request rejects `next()` with the abort's error,
  an `AbortError` (`ctx.request.signal.aborted` is `true`): rethrow it. Nothing is logged,
  and the route boundary answers it with a 499 nobody reads, which an
  observer that settles `next()` sees.
- **Errors default at the route boundary.** What no middleware catches is
  answered where the route ends, outermost: an `HttpError` with its status
  and body, anything else with a logged 500 that leaks nothing. There are
  no `onError` hooks before it.
- **No code runs before routing.** What `onRequest` and `around` ran before
  the router a `use()` middleware runs after it, with `ctx.route` set; a
  request no route matches still runs every top-level `use()` middleware,
  then its 404, 405 or 426.

## 0.4.0

| Change | Package | Can it break your code |
| --- | --- | --- |
| [One middleware model](#one-middleware-model) | core | no: the forms of 0.3 still work, deprecated |
| [Middlewares for every request: `use`](#middlewares-for-every-request-use) | core | no: new; `use` now runs on unmatched requests too |
| [Middlewares replace the request hooks](#middlewares-replace-the-request-hooks) | core, logger, telemetry, compress, cors, secure-headers, rate-limit, cache, redis, context-storage, language, i18n, jwt, janus | yes, for an app that relies on a `use()`, `derive` or `decorate` not running on a 404, or on `ctx.route` being a `string` in a middleware: see the runtime changes |
| [Plugins are apps: `app.plugin`](#plugins-are-apps-appplugin) | core | no: `plugin(middleware)` and `use(plugin)` still work, deprecated; a function given to `use` that returns no app now throws |
| [How a middleware settles, and the details](#how-a-middleware-settles-and-the-details) | core | no: new behaviour of the new forms; a route mixing a list of hooks with middlewares now throws |
| [alxia is OpenAPI spec first](#alxia-is-openapi-spec-first) | core, openapi | no: the document is the source, the routes run as before |
| [No more client: spec first](#no-more-client-spec-first) | core, client, graphql, janus, secure-headers, context-storage, react-router | yes: `@alxia/client`, `RoutesOf` and the route table are gone, and `Alxia` takes three type parameters |
| [`@alxia/openapi-routes` is now `@alxia/openapi`](#alxiaopenapi-routes-is-now-alxiaopenapi) | openapi, openapi-routes | no: change the import; `@alxia/openapi-routes` 0.3.0 re-exports it, deprecated |
| [The old `@alxia/openapi` is retired](#the-old-alxiaopenapi-is-retired) | openapi | yes: `openapi()` and `docs()` are gone; write the document, generate the operations |
| [The context registered once: `Register` and `defineRoutes`](#the-context-registered-once-register-and-defineroutes) | core, context-storage, react-router | no: new exports; `contextStorage()` now requires the context it reads of the app that uses it |

### One middleware model

**What changed.** A route takes middlewares after its path, or after its
options: `app.<method>(path, options?, ...middlewares, handler)`. A
middleware is `(ctx, next) => …`, made once with `defineMiddleware`. It
returns `next(added)` to pass `added` on, typed, to the middlewares after
it and to the handler; a reply, which ends the request; or a `Response`, sent as it is. `next()` resolves to the
response of the rest of the route, so a middleware that awaits it runs
around them. The request's schemas are middlewares too: `validate(…)` for
the request, `responds(…)` for the replies. They run where they stand.
`options` holds the route's configuration only: `bodyLimit` and `detail`.

```ts
import { alxia, defineMiddleware, responds, validate } from '@alxia/core';

const auth = defineMiddleware(async (ctx, next) => {
	const user = await session(ctx.request);
	if (!user) return ctx.reply(401, { error: 'unauthorized' as const });
	return next({ user }); // `user` is typed on everything after it
});

const app = alxia().post(
	'/posts',
	{ bodyLimit: 1024 * 1024 },
	auth,
	validate({ body: Post }),
	responds({ 201: Post }),
	({ user, body, reply }) => reply(201, create(user, body)),
);
```

`ws(path, options?, ...middlewares, handlers)` takes the same; its options
are `message`, `send` and `detail`. A route takes at most 8 middlewares.
`app.route(operation, ...middlewares, handler)` takes the same middlewares,
the operation's `schema` read as a `validate` and a `responds` just before
the handler — or where `validate(operation)` and `responds(operation)`
stand. `group`, `use`, `derive`, `decorate`, `bodyLimit`, `onStart`,
`onStop` and `parser` are unchanged and not deprecated; `onRequest`,
`onResponse`, `around`, `wrap`, `onError` and `onRefusal` are deprecated
for middlewares ([Middlewares replace the request
hooks](#middlewares-replace-the-request-hooks)).

**Can it break your code.** No. The forms of 0.3 keep working, deprecated,
for this minor at least: a list of hooks after the path, a schema before
the handler, `defineHook`, `defineWrap`, `ws(path, schema, handlers)`
with or without a list, and `route(operation, [hooks], handler)`. Each runs on the same chain as a middleware, and
behaves as in 0.3: a schema before the handler becomes a `validate` and a
`responds` placed just before it. The routes of one app may use either
form; move each one over when you next touch it, with the steps below.

New exports: `defineMiddleware`, `validate`, `responds`, and the types
`Middleware`, `MiddlewareContext`, `MiddlewareResult`,
`MiddlewareReturn`, `Next`, `NextFunction`, `RequestSchemas`, `Validated`,
`ValidateRequires`, `RouteOptions`, `SocketOptions`, the types a route
threads its middlewares with, and `OperationForms` with the types `route`
threads an operation's schemas with (`OperationParts`, `OperationOptions`,
`OperationResponds`, `OperationValidate`, `OperationApp`). `validate` and
`responds` also take an operation.

A request's body is read once: a second `validate` of the body on one
route checks what the first read, where it used to fail with
`TypeError: Body already used`.

### Migrating to middlewares

#### 1. `defineHook` becomes `defineMiddleware`

A middleware takes `next` as its second argument, and always returns:
`next(added)` where the hook returned what it added, `next()` where it
returned nothing, and the same reply where it replied.

```ts
// before
import { defineHook } from '@alxia/core';

const auth = defineHook(async ({ request, reply }) => {
	const user = await session(request);
	return user ? { user } : reply(401, { error: 'unauthorized' as const });
});

const canView = defineHook<{ user: User; params: { id: string } }>()(
	async ({ user, params, reply }) =>
		(await mayView(user, params.id)) ? undefined : reply(403, { error: 'forbidden' as const }),
);
```

```ts
// after
import { defineMiddleware } from '@alxia/core';

const auth = defineMiddleware(async ({ request, reply }, next) => {
	const user = await session(request);
	return user ? next({ user }) : reply(401, { error: 'unauthorized' as const });
});

const canView = defineMiddleware<{ user: User; pathParams: { id: string } }>()(
	async ({ user, pathParams, reply }, next) =>
		(await mayView(user, pathParams.id)) ? next() : reply(403, { error: 'forbidden' as const }),
);
```

Read the raw path parameters as `pathParams`. A middleware placed before
any `validate` reads `params` as they arrived too, but after a
`validate({ params })`, `params` is that schema's output; `pathParams` is
always the path's strings. A middleware that calls `next()` and returns
nothing answers with the rest's response; one that returns nothing without
calling `next()` is a 500, with this error logged:

```text
TypeError: GET /posts/:id: a middleware returned nothing: return next(), a reply or a Response
```

#### 2. `defineWrap` becomes a middleware that awaits `next()`

`next()` runs the middlewares after it and the handler, and resolves to
their response. Return it, set a header on it first, or return a reply of
your own.

```ts
// before
import { defineWrap } from '@alxia/core';

const exclusive = defineWrap<{ params: { id: string } }>()(
	async ({ params, reply }, next) =>
		(await locks.tryRun(params.id, next)) ?? reply(409, { error: 'busy' as const }),
);
```

```ts
// after
import { defineMiddleware } from '@alxia/core';

const exclusive = defineMiddleware<{ pathParams: { id: string } }>()(
	async ({ pathParams, reply }, next) =>
		(await locks.tryRun(pathParams.id, next)) ?? reply(409, { error: 'busy' as const }),
);
```

Call `next()` once; a second call is a 500, with
`GET /posts/:id: a middleware called next() twice` logged.

#### 3. The list of hooks becomes middlewares after the path

Drop the brackets. The middlewares run in the order given, after the hooks
in force where the route is declared, as the list did.

```ts
// before
app.delete('/posts/:id', [auth, canView, exclusive], handler);

// after
app.delete('/posts/:id', auth, canView, exclusive, handler);
```

What each one reads is checked where it stands: `canView` before `auth`
does not compile, since no `user` is given yet.

`route` drops them the same way. Its operation's schema then validates
just before the handler, after the middlewares, as with the list; its
`responds` stands first, so a middleware's reply whose status the
operation declares is checked against its schema too:

```ts
// before
app.route(operations.updatePet, [auth], handler);

// after
app.route(operations.updatePet, auth, handler);
// or validate first, once: a bad body is a 400 before auth runs
app.route(operations.updatePet, validate(operations.updatePet), auth, handler);
```

#### 4. The schema becomes `validate(…)` and `responds(…)`

The request's parts — `params`, `query`, `headers`, `cookies`, `body` — go
to `validate`; `response` goes to `responds`. `bodyLimit` and `detail` stay
in the object, which becomes the route's options, before the middlewares.

```ts
// before
app.patch(
	'/posts/:id',
	[auth, canView],
	{ params: PostId, body: Update, response: { 200: Post }, bodyLimit: 64 * 1024, detail: { summary: 'Edit a post' } },
	({ params, body, reply }) => reply(200, update(params.id, body)),
);
```

```ts
// after
import { responds, validate } from '@alxia/core';

app.patch(
	'/posts/:id',
	{ bodyLimit: 64 * 1024, detail: { summary: 'Edit a post' } },
	auth,
	canView,
	validate({ params: PostId, body: Update }),
	responds({ 200: Post }),
	({ params, body, reply }) => reply(200, update(params.id, body)),
);
```

A route with no options starts with its first middleware:
`app.post('/posts', validate({ body: NewPost }), handler)`. A schema left
in the options of a route with middlewares does not compile. The handler
reads the same validated parts, and its `reply` is typed by `responds` as
it was by `response`. A refused request is still answered by the
`onRefusal` hook in force, deprecated, by default
`400 { error: 'validation', issues }`; a middleware before the `validate`
answers it in its own format instead
([`ValidationError`](#validate-throws-a-validationerror)).
`app.routes[i].schema` holds the route's options alone (`detail`,
`bodyLimit`): the schemas of `validate` and `responds` stay in its chain,
since the OpenAPI document, not the app, declares them. The same holds
for `route(operation, …)`: its `schema` keeps the operation's `detail`
(`operationId`, which `@alxia/openapi` reads), not its `params`, `body`
or `response`. A tool that read those reads the operation itself.

#### 5. A socket's schema becomes options and `validate`

`message` and `send` are a socket route's options, with `detail`; the
upgrade request's parts go to `validate`.

```ts
// before
app.ws('/rooms/:room', [auth], { query: RoomQuery, message: Chat, send: Chat }, {
	message: (socket, chat) => socket.publish(socket.data.params.room, chat),
});
```

```ts
// after
import { validate } from '@alxia/core';

app.ws('/rooms/:room', { message: Chat, send: Chat }, auth, validate({ query: RoomQuery }), {
	message: (socket, chat) => socket.publish(socket.data.params.room, chat),
});
```

The middlewares and `validate` run on the upgrade request, and
`socket.data` reads what they added. A middleware that awaits `next()` on a
socket route receives an empty `200` once the socket is open, and must
return it as it is.

#### 6. Put `validate` where it should answer first

In 0.3 the schema always ran after the list. A middleware's position is now
its place in the request, so choose it:

```ts
// auth first, as in 0.3: a stranger gets 401 before his body is read
app.post('/posts', auth, validate({ body: Post }), handler);

// validate first: an invalid body gets 400 before the user is looked up
app.post('/posts', validate({ body: Post }), auth, handler);
```

The middlewares before `validate`, and the deprecated `onError` and
`onRefusal` hooks, read the request as it arrived, its raw cookies included; what follows it
reads the validated parts.

**`responds` checks the replies made after it.** The handler's reply
must have a status it declares, as with `response` in 0.3, and is sent as
its schema's output. A middleware after it that replies with a declared
status is checked too; one that replies with another status, such as an
`auth`'s 401, is sent as it is. A reply made
before it is not checked:

```ts
// auth's 401 is sent as it is; a 200 from the handler is checked
app.get('/me', responds({ 200: User }), auth, handler);
// declare the 401 to check auth's reply too
app.get('/me', responds({ 200: User, 401: Unauthorized }), auth, handler);
```

### Middlewares for every request: `use`

**What changed.** `use` takes middlewares made by `defineMiddleware`, up to
8 in one call. They run on every request, in the order declared, and what
they pass `next` is typed in the routes declared after them. A route runs
the middlewares declared before it, then its own; a request no route
matches runs all of them, wherever they were declared
([Middlewares replace the request hooks](#middlewares-replace-the-request-hooks)).
`use(path, ...middlewares)` runs them on the requests under `path` alone —
`/admin`, `/admin/*`, `:name` segments — matched against the request's path
when it arrives, with the syntax of a route's; those may add nothing to the
context, a compile error (`Invalid middleware: …`) otherwise. To add to a
subtree's context, `use` them in a group. `defineMiddleware` marks what it
makes, and `use` reads the mark: any other function is a plugin, in the
deprecated form of [`use(plugin)`](#plugins-are-apps-appplugin). `derive`
stays, the shorthand for a middleware that only adds.

```ts
// before: a derive for every route after a point, a guard repeated on each route
alxia()
	.derive(({ request, reply }) => {
		const id = request.headers.get('x-user');
		return id ? { user: { id } } : reply(401, { error: 'unauthorized' as const });
	})
	.get('/admin/stats', admin, handler)
	.get('/admin/users', admin, handler);

// now: the middleware given to use, the guard given once for the subtree
const auth = defineMiddleware(({ request, reply }, next) => {
	const id = request.headers.get('x-user');
	return id ? next({ user: { id } }) : reply(401, { error: 'unauthorized' as const });
});
alxia()
	.use(auth)
	.use('/admin', admin)
	.get('/admin/stats', handler)
	.get('/admin/users', handler);
```

`use('/users/admin', guard)` guards a `/users/:id` route requested as
`/users/admin`, and a request under `/users/admin` that no route matches:
the path is the request's, not the route's.

**Can it break your code?** No, but a `use` now also runs on a request no
route matches: read
[Middlewares replace the request hooks](#middlewares-replace-the-request-hooks).
Calls that never worked now throw where they are made, saying why: `use`
given a plugin and more arguments, `use` given what is neither an app nor a
function (a hook of `defineHook`), `use()` given nothing, and a plain
`(ctx, next) => …` given to `use`, called once as a plugin, which returns
no app: wrap it in `defineMiddleware`
([Troubleshooting](troubleshooting.md#plugin-the-plugin-function-returned-undefined-not-an-app-a-plugin-returns-the-app-it-is-given-a-middleware-is-given-to-use)).

New exports: the types `MiddlewareMark`, `MadeByDefineMiddleware` (the
mark as `use` requires it, named so that a plain `(ctx, next)` function
reads `is not assignable to type 'MadeByDefineMiddleware'`), `UseForms`,
`PluginForms` (deprecated), `ScopeMiddleware`, `PathMiddleware`,
`AddingNothing`, `ScopePathAt` and `AppAfterUse`. A middleware the
route's context does not give is reported on `use`'s middleware form
last: TypeScript 7 prints the last overload alone, so the deprecated
plugin forms come first, and the message names the missing key.

### Middlewares replace the request hooks

**What changed.** A middleware does what `onRequest`, `onResponse`,
`around`, `onError`, `onRefusal` and `wrap` did, in one form, in the place
of the chain you give it. The hooks keep working as in 0.3 and are
deprecated; every package plugin is a middleware now.

Routing is decided first, so `ctx.route` is known in every middleware. Then
the request runs the chain, and an error nobody caught is answered:

1. The deprecated `onRequest` and `around` hooks, outermost.
2. The `use` middlewares, `derive`, `decorate` and the deprecated `wrap`,
   in the order declared, as Koa and Hono run them: code before `await next()` runs on
   the way in, code after it on the way out.
3. The route's own middlewares, then the handler — or, for a request no
   route matches, the 404, 405 or 426.
4. What nobody caught reaches the route boundary, outermost: the deprecated
   `onError` and `onRefusal` hooks, then an `HttpError`'s own status, then a
   500.

**What changed at run time.**

- **`use()` runs on every request**, a 404, a 405, a 426 and an OPTIONS
  request to a path with no OPTIONS route included. A middleware may answer
  before the 404: a 401, a preflight's 204. The middlewares, `derive`s and
  `decorate`s declared **after** a route do not run for that route; they do
  run for a request no route matches. A deprecated `wrap` keeps the rule of
  0.3: it never runs on a request no route matches.

  ```ts
  const app = alxia()
  	.use(auth)                                      // runs for /a and /missing
  	.get('/a', ({ reply }) => reply(200, 'a'))
  	.use(timed)                                     // not for /a; for /missing
  	.get('/b', ({ reply }) => reply(200, 'b'));
  ```

- **`use(path, …)` matches the request's path**, at run time, with the
  syntax of a route's path (`:param`, `*`). It runs for a route whose request
  path matches and for an unmatched request under that path.
- **`ctx.route` is `string | undefined`** on `BaseContext`: `undefined` in a
  middleware of an unmatched request. A route's own middlewares and its
  handler read a `string`.

  ```ts
  const seen = defineMiddleware(({ route, request }, next) => {
  	console.log(route ?? `no route for ${request.method} ${new URL(request.url).pathname}`);
  	return next();
  });
  ```

- **A group's middlewares stay with its routes**: they do not run on an
  unmatched request, even one under the group's prefix. The middlewares of
  an app given to `plugin(app)` are the mounting app's: they run on
  unmatched requests too.
- **Errors are rejections through `next()`**: a middleware's
  `try { return await next() } catch (error) { … }` sees what the rest threw,
  an `HttpError` included.

#### `validate` throws a `ValidationError`

A request `validate` refuses throws `ValidationError`, an `HttpError` of
the 400: `.refusal` is `{ kind: 'validation', part, issues }` and `.body` the
default 400 body. A body past its limit throws `ContentTooLargeError` (413).
`refusalOf(error)` gives the `Refusal` of either, `undefined` for any other
error. A middleware **before** the `validate` answers it in its own format;
nobody does, and the response is the default 400 or 413, or the deprecated
`onRefusal` hook's.

```ts
import { defineMiddleware, refusalOf } from '@alxia/core';

const problems = defineMiddleware(async ({ reply }, next) => {
	try {
		return await next();
	} catch (error) {
		const refusal = refusalOf(error);
		if (refusal?.kind !== 'validation') throw error;
		return reply(422, { detail: `the ${refusal.part} is invalid` });
	}
});
```

#### `settle(ctx, next())` for a middleware that must see every response

An observer — a logger, a header on every response — must see the final
response, an error's included. `settle` resolves to what `next()` resolved
to or, when it rejected, to the answer the route boundary would give (the
`onError` and `onRefusal` hooks, an `HttpError`, a 500), and keeps the error
on `ctx.error`.

```ts
import { defineMiddleware, settle } from '@alxia/core';

const poweredBy = defineMiddleware(async (ctx, next) => {
	const response = await settle(ctx, next());
	response.headers.set('x-powered-by', 'alxia');
	return response; // a 404 and a 500 carry it too
});
```

`next.behind(added?)` runs the rest behind a reply the middleware returns at
once; the rest's response goes to nobody. It is what serves a stale cache
entry while the route refreshes it.

#### Each hook, as a middleware

| 0.3 | 0.4 | Status |
| --- | --- | --- |
| `onRequest(fn)` | `use(defineMiddleware((ctx, next) => early(ctx) ?? next()))`, first | deprecated; still runs before routing, before every middleware |
| `onResponse(fn)` | `use(defineMiddleware(async (ctx, next) => fn(await settle(ctx, next()))))`, first | deprecated; still runs after everything |
| `around(fn)` | `use(defineMiddleware((ctx, next) => … next() …))`, first | deprecated; still outermost |
| `onError(fn)` | a `try { return await next() } catch (error) { … }` middleware | deprecated; still answers at the route boundary, after every middleware |
| `onRefusal(fn)` | the same, reading `refusalOf(error)` | deprecated |
| `wrap(fn)` | `use(defineMiddleware(async (ctx, next) => … await next() …))` | deprecated: see below |
| `derive(fn)` | `use(defineMiddleware((ctx, next) => next(added)))` | **not** deprecated: the shorthand for adding to the context |
| `decorate`, `onStart`, `onStop`, `parser`, `bodyLimit` | unchanged | stay |
| `app.plugin(middleware)` | `app.use(middleware)` | deprecated alias, same behaviour |
| `app.plugin(otherApp)`, `definePlugin` | unchanged | stay: a plugin is an app |

```ts
// onRequest: answer early
// before
alxia().onRequest(({ request }) =>
	request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : undefined,
);
// after
alxia().use(
	defineMiddleware(({ request }, next) =>
		request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : next(),
	),
);
```

```ts
// onResponse: edit every response, a 404 and a 500 included
// before
alxia().onResponse((response) => {
	response.headers.set('x-powered-by', 'alxia');
});
// after
alxia().use(
	defineMiddleware(async (ctx, next) => {
		const response = await settle(ctx, next());
		response.headers.set('x-powered-by', 'alxia');
		return response;
	}),
);
```

```ts
// around: a span, a transaction, a timer around the whole request
// before
alxia().around(async (ctx, next) => {
	const started = performance.now();
	const response = await next();
	console.log(ctx.url.pathname, response.status, performance.now() - started);
	return response;
});
// after: settle, so a 500 is logged with its status
alxia().use(
	defineMiddleware(async (ctx, next) => {
		const started = performance.now();
		const response = await settle(ctx, next());
		console.log(ctx.url.pathname, response.status, performance.now() - started);
		return response;
	}),
);
```

```ts
// onError: answer one kind of error
// before
alxia().onError((error, { reply }) =>
	error instanceof PaymentError ? reply(402, { error: 'payment_required' as const }) : undefined,
);
// after: rethrow what is not yours
alxia().use(
	defineMiddleware(async ({ reply }, next) => {
		try {
			return await next();
		} catch (error) {
			if (!(error instanceof PaymentError)) throw error;
			return reply(402, { error: 'payment_required' as const });
		}
	}),
);
```

```ts
// onRefusal: answer a refused request in your own format
// before
alxia().onRefusal((refusal, { reply }) => reply(422, { detail: `the ${refusal.kind} refusal` }));
// after: the `problems` middleware above, given before the routes that validate
alxia().use(problems);
```

```ts
// wrap: around the rest of the route
// before
alxia().wrap(async ({ request, reply }, next) =>
	busy(request) ? reply(409, { error: 'busy' as const }) : next(),
);
// after
alxia().use(
	defineMiddleware(({ request, reply }, next) =>
		busy(request) ? reply(409, { error: 'busy' as const }) : next(),
	),
);
```

Two differences from `wrap`: a `wrap` never runs on a 404 (it keeps the rule of 0.3), a middleware does;
and a `wrap`'s `next()` resolves a refusal to the 400, where a
middleware's rejects with the `ValidationError`. `derive` needs no change:
`derive(fn)` and `use(defineMiddleware((ctx, next) => next(added)))` are the
same.

#### The package plugins are middlewares

The factories keep their names. Give them to `use`, before the routes:
`app.use(logger())`. `app.plugin(logger())` still works, deprecated, as
it did in 0.3: app-wide, on the routes declared before it too, before the
app's chain — so an app that kept `.get(…).plugin(secureHeaders())` keeps
its headers on every route. `use(logger())` given after routes does not
run on them, and warns once in development, naming them.

```ts
// before
alxia().plugin(logger()).plugin(secureHeaders()).plugin(cors()).plugin(bearer({ jwt }));

// now
alxia().use(logger()).use(secureHeaders()).use(cors()).use(bearer({ jwt }));
```

| Package | Now |
| --- | --- |
| `@alxia/logger` | `app.use(logger())`, first; every request is logged — 404s, 405s, an `onError` reply, a 500. New type `LoggerContext` |
| `@alxia/telemetry` | `app.use(telemetry({ … }))`, first; one server span per request, an unmatched one included, named `METHOD route` once matched and `METHOD path` otherwise; no span for a socket upgrade. New type `TelemetryContext` |
| `@alxia/compress` | `app.use(compress())`: compresses every response after it, 404s and errors included |
| `@alxia/cors` | `app.use(cors())`, **first**: answers a preflight for any path itself, before the 404 or 405, and adds its headers to every other response, errors included |
| `@alxia/secure-headers` | `app.use(secureHeaders())`, first; every response, errors included. New type `SecureHeaders`; `{ nonce: true }` gives `nonce` |
| `@alxia/rate-limit` | `app.use(rateLimit({ … }))`: counts every request it runs on, an unmatched one too when it is on the app. New type `RateLimit<Requires>` |
| `@alxia/cache` | `app.use(cache({ … }))`: a stale entry is served at once and refreshed behind it with `next.behind`. New type `CacheMiddleware<Requires>` |
| `@alxia/redis` `idempotency` | `app.use(idempotency(client, options))`: skips a request no route matches, and keeps the response the route answers, an `onError` reply included |
| `@alxia/context-storage` | `app.use(contextStorage<typeof base>())`: `getRequestContext()` works in every middleware after it, 404s included; `getContext()` only in a request that reached a route |
| `@alxia/language` | `app.use(language({ … }))` |
| `@alxia/i18n` | `app.use(createI18n({ … }))`: `t()` works in every middleware and hook after it, an error's answer included |
| `@alxia/jwt` `bearer` | `app.use(bearer({ jwt }))`: refuses every request it runs on with a 401, an unmatched one included when it is on the app. New type `Bearer<Schema>` |
| `@alxia/janus` | `session()`, `permission()` and `janusErrors()` are middlewares. `janusErrors()` is a try/catch: it answers the errors thrown **behind** it, so `app.use(janusErrors(), session(accounts))`. New types `JanusErrors`, `SessionMiddleware` |

#### The order to give them

- **Observers first**: `logger`, `telemetry`, `secureHeaders`, `cors` and
  `compress` go first, so they wrap everything, a 404 included.
- **An error-handling middleware after the observers**: a try/catch
  middleware, or `janusErrors()`. An observer — these, `createI18n()`,
  `contextStorage()` — settles `next()`: it reads the response the error
  would be answered with, and the error goes on, so a try/catch catches it
  wherever it stands. Given after the observers, they see its reply too.
- **`janusErrors()` before `session()`**: it answers what is thrown behind
  it. `use(janusErrors()).use(i18n).use(session())` answers a janus error
  as janus says.
- **A guard on the app answers a missing path too**: `bearer`, a required
  `session` and `rateLimit` run on unmatched requests, so an anonymous request
  to a path that does not exist gets the 401, not the 404. Scope the guard
  with a `group`, `app.group('/api', (api) => api.use(bearer({ jwt })))`, to
  guard some routes only. A path, `use('/api', guard)`, takes a middleware
  that adds nothing to the context: not these.

```ts
import { alxia } from '@alxia/core';
import { cors } from '@alxia/cors';
import { logger } from '@alxia/logger';
import { secureHeaders } from '@alxia/secure-headers';

const app = alxia()
	.use(logger(), secureHeaders(), cors())  // observers, first
	.use(problems)                           // then what answers errors
	.group('/api', (api) => api.use(auth).get('/me', ({ user, reply }) => reply(200, user)));
```

**Can it break your code?** Mostly no: the hooks and `plugin(middleware)`
run as in 0.3. What a changed behaviour can break:

- a `use()` — or a `derive`, `decorate` — that assumed a route, and now
  also runs on a 404: read `ctx.route` as `string | undefined`, and
  return `next()` for a request that is not yours;
- a guard on the app that you relied on never answering a missing path;
- a `wrap` moved to a middleware: its `next()` no longer resolves a refusal
  to the 400, it rejects with the `ValidationError`;
- an `onError` or `onRefusal` hook that you moved to a middleware: it
  sees the error wherever it stands, but the observers before it see its
  reply only when it is declared after them;
- a group's middlewares now run on an unmatched request under the group's
  prefix: a guarded group answers `/admin/missing` with its 401, and
  `DELETE /admin/secret` too, rather than a 405 whose `Allow` lists its
  methods;
- a plugin with a prefix of its own — `alxia({ prefix: '/todos' })`,
  `defineRoutes('/todos')` — keeps its middlewares, `derive` and
  `decorate` under that prefix once mounted, as a group does: they no
  longer run on the routes declared after `plugin`, nor on the requests
  outside it, and add nothing to their context, in the types too. A plugin
  without a prefix keeps giving them to the app;
- a `use(path, …)` matches the request's path decoded, with empty segments
  collapsed and without case: `use('/admin', guard)` now guards
  `/%61dmin`, `//admin` and `/ADMIN` too, as the router, the static files
  and React Router serve them. A route whose path differs from a guarded
  one by its case alone is guarded too.

### Plugins are apps: `app.plugin`

**What changed.** A plugin is mounted by `app.plugin(…)`: an app — a
sub-app, the routes of `defineRoutes`, a `definePlugin` — or a function
`(app) => app` that adds to the app. The requirement checks of
`definePlugin` and `defineRoutes` are on `plugin`, as is the prefix and
the place behind the middlewares declared before it. `use` is for
middlewares, the package plugins included: they are middlewares now
([Middlewares replace the request hooks](#the-package-plugins-are-middlewares)).

```ts
// before
alxia().use(cors()).use(auth).use(todos);

// now: a middleware to use, an app to plugin
alxia().use(cors()).use(auth).plugin(todos);
```

`plugin` throws where it is called when a function given to it returns
anything but an app, and leaves a promise it returned handled; it throws
too for more than one argument, and for a value that is neither an app nor
a function
([Troubleshooting](troubleshooting.md#plugin-the-plugin-function-returned-undefined-not-an-app-a-plugin-returns-the-app-it-is-given-a-middleware-is-given-to-use)).

**Can it break your code?** No, unless a plugin function returned no app.
`use(plugin)` still mounts a plugin, and `plugin(middleware)` still
installs a middleware, both deprecated. A function given to `use` that
returns anything but an app now throws, where in 0.3 `use` returned what it
returned: a middleware written without `defineMiddleware`,
`(ctx, next) => …`, given to `use` was called once as a plugin and never
guarded a request. Now it throws
`use(): the plugin function returned a promise, not an app: …`; wrap it in
`defineMiddleware`. Replace each `.use(app)` by `.plugin(app)` and each
`.plugin(middleware)` by `.use(middleware)`. In the next minor, the plugin
forms of `use` and the middleware form of `plugin` are removed
([Roadmap](roadmap.md)).

New exports: the types `PluginMethod` and `MountedIn`, the context of the
routes after a plugin. `Mounted` and `RequiredIn` now come
from `plugin-method.ts`, under the same names; `PluginForms`, the plugin
forms of `use`, is deprecated.

### How a middleware settles, and the details

**What changed.** The middleware model above, in its details:

- **A middleware that called `next()` and returns nothing answers with the
  rest's response**, awaited or not, as Koa and Hono do. The 500
  `a middleware returned nothing` is now only for a middleware that never
  called `next()`.
- **`next(); return reply(403)`**, a reply returned before the `next()` it
  called settled: the rest runs anyway, so the reply is sent once it has,
  `console.warn` logs
  [`GET /…: a middleware returned before the next() it called settled: …`](troubleshooting.md#get--a-middleware-returned-before-the-next-it-called-settled-the-rest-of-the-route-ran-anyway-await-next-or-return-it),
  and an error of the rest is logged with `console.error`, never an
  unhandled rejection.
- **On a socket route, once the upgrade happened**, what a middleware
  returns after `next()` is ignored and what it throws is logged; the
  socket stays open.
- **`route(operation, …)`**: the implicit `validate` and `responds` both
  stand just before the handler, after a `validate(operation)` placed
  among the middlewares. The implicit `responds` checks the handler's
  reply alone: an auth's 401 is its own. `responds(operation)`, new,
  reads `schema.response` and, placed among the middlewares, checks the
  replies made after it as before; the implicit one is then left out
  ([Routes](guide/routes.md#middlewares-on-a-route-declared-as-data)).
- **Each `validate` of the cookies reads the request's cookies**, not what
  an earlier one gave back. A route with no middleware and no schema runs
  no validation step. A schema in the route's arguments, the form of 0.3,
  leaves the parts it has no schema for as they are: a body a `use`
  middleware passed `next` reaches the handler.
- **A list of hooks and middlewares, mixed, throws** where the route is
  declared:
  `GET /: a list of hooks and middlewares are two forms, never mixed: …`,
  `route(operation, [hooks], auth, handler)` included, which in 0.3 took
  `auth` for the handler and dropped the real one without a word. Since
  0.5 any list throws
  [`GET /…: a route takes its middlewares after the path, not in a list: drop the brackets`](troubleshooting.md#get--a-route-takes-its-middlewares-after-the-path-not-in-a-list-drop-the-brackets).
- **`validate` and `responds` are marked** with `Symbol.for('alxia.builtin')`
  and carry `BuiltinMark<'validate' | 'responds'>` in their type, so two
  copies of `@alxia/core` read each other's.
- **The `Middleware` type no longer leaks `any`**: `MiddlewareResult`'s
  brand is `Next`.
- **A missing requirement is reported on the middleware forms**: the
  overloads of the routes, `ws`, `route(operation)` and `use` are
  ordered so that TypeScript names the key, `Property 'user' is missing in
  type … but required in type '{ user: User; }'`, rather than the
  deprecated list's `'~hooks'` message
  ([Troubleshooting](troubleshooting.md#-is-not-assignable-to-type-user-is-missing-from-the-context-add-a-middleware-that-gives-it-before-this-one)).

**Can it break your code?** Only a route that mixed a list of hooks with
middlewares, which never ran as written: give the hooks as middlewares.
The rest is how the new forms behave.

New export: the type `BuiltinMark`.

### alxia is OpenAPI spec first

**What changed.** The OpenAPI document is written by hand, and it is the
source: of the client, generated from it with the generator you choose, and
of the server's routes. Nothing in alxia writes a document from the app any
more. The server side takes three pieces:

| Piece | Package | What it does |
| --- | --- | --- |
| the operations | [`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen), with `alxia: true` | writes `src/generated/alxia.ts` from the document: each operation as `{ method, path, schema }`, with Zod schemas |
| the routes | `@alxia/core`'s `route(operation, ...middlewares, handler)` | one route per operation; the operation's schemas check the request and every reply at run time |
| the check | [`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi)'s `matchesSpec` | reads `app.routes` and throws unless every operation has its route and every route its operation |

```ts
import { alxia } from '@alxia/core';
import { operations } from './generated/alxia';

export const app = alxia().route(operations.getTodo, ({ params, reply }) => {
	const todo = todos.find(({ id }) => id === params.id); // todos: your own store
	return todo ? reply.ok(todo) : reply.notFound({ error: 'not_found' as const });
});
```

```ts
// app.spec.ts
import { test } from 'bun:test';
import { matchesSpec } from '@alxia/openapi';
import { app } from './app';
import { operations } from './generated/alxia';

test('routes every operation of openapi.yaml, and nothing else', () => {
	matchesSpec(app, operations);
});
```

A route's `detail` (`summary`, `description`, `operationId`, `tags`,
`deprecated`) stays a route option, which nothing in alxia reads at run
time; the generated operations carry it, and `matchesSpec` names an
operation by its `operationId` when the operations are given as a list.
`bun create @alxia` writes an API this way. The workflow, step by step:
[`@alxia/openapi`: spec first](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/spec-first.md).

**Can it break your code.** Not by itself: an app's routes run as before.
What changes is in the two entries below, and in
[No more client](#no-more-client-spec-first).

### No more client: spec first

**What changed.** alxia is OpenAPI spec first: the OpenAPI document is the
contract between the server and its clients, and you bring the client
generator — the examples use
[`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen).
So the server no longer builds a route table in its type for a client to
read:

- `@alxia/client` is retired: it is no longer released, and its last
  version is to be deprecated on npm with:

  ```sh
  npm deprecate @alxia/client "Retired: alxia is OpenAPI spec first. Generate a client from your OpenAPI document, e.g. with @nxgt/openapi-codegen. See https://github.com/softistx/alxia/blob/develop/packages/core/docs/upgrading.md"
  ```
- `Alxia` loses its `Routes` type parameter: it is
  `Alxia<Ctx, Prefix, Shortcuts>`, and `typeof app` holds no route table.
  The `~routes` field and `RoutesOf` are gone.
- The types that only described a route to the client are gone:
  `RouteEntryOf`, `RouteInput`, `RouteOutput`, `RouteRecord`, `RouteTable`,
  `Outcome`, `OutcomeOf`, `SocketEntryOf`, `SocketRecord`,
  `RefusalOutcome`, `KindOutcome`, `DefaultRefusalOutcome`,
  `DefaultLimitOutcome`, `IsLimited`, `BehindShortcuts`, `ThreadReplies`
  and `AppWithSocket`. `AppWithRoute<App>` takes one parameter: the app,
  unchanged. `@alxia/graphql` no longer exports `GraphQLRoutes`.
- The plugins typed by the app drop the `Routes` argument with it:
  `session()` (`@alxia/janus`), `secureHeaders({ nonce: true })`,
  `contextStorage()`, `graphql()`, `reactRouter()` and `FreshApp`.
- `route(operation, ...middlewares, handler)` types a request part the
  operation has no schema for as the middleware before it passed it to
  `next`, as it runs: the request's own type, as before, when none did.

What a handler reads is typed as before: what its middlewares add,
`validate`'s outputs, `reply` typed by `responds`, the path's parameters
checked against its schema, and `ContextOf`.

**Can it break your code.** Yes, where it names what was removed:

- code that imports `@alxia/client`, or `RoutesOf` or another removed type
  from `@alxia/core`, no longer compiles;
- code that writes `Alxia<A, B, C, D>` drops the second argument:
  `Alxia<A, C, D>`. `Alxia<Ctx>` and `AnyAlxia` are unchanged.

**How to migrate.** Write the OpenAPI document of the API by hand — it is
the source; [the old `@alxia/openapi` is retired](#the-old-alxiaopenapi-is-retired)
shows how to start from the one 0.3 made — and generate the client from it:

```ts
// before
import { client } from '@alxia/client';
import type { App } from './server';

const api = client<App>('http://localhost:3000');
const user = await api.get('/users/:id', { params: { id: 1 } });
```

```sh
# after: a client generated from the document
bun add -d @nxgt/openapi-codegen
bunx nxgt-openapi generate -i openapi/openapi.yaml -o src/generated
```

A test that called the app through `client(app)` calls it in process with
`app.request()` instead:

```ts
// before
const result = await client(app).get('/users/:id', { params: { id: 1 } });
expect(result.status).toBe(200);
expect(result.data).toEqual({ id: 1, name: 'Ada' });

// after
const response = await app.request('/users/1');
expect(response.status).toBe(200);
expect(await response.json()).toEqual({ id: 1, name: 'Ada' });
```

A type test that read `RoutesOf<typeof app>[path][method]['output']`
checks the handler instead, with `expectTypeOf` inside it
([The app's type](guide/types.md#testing)).

### `@alxia/openapi-routes` is now `@alxia/openapi`

**What changed.** The package that checks an app's routes against the
operations of its document, `@alxia/openapi-routes`, is published as
`@alxia/openapi` from 0.4.0 on. Its API is the same: `implemented`,
`matchesSpec`, the deprecated `exactly`, and the types `Operations`,
`ImplementedOptions`, `MatchesSpecOptions` and `ExactlyOptions`, with the
same messages.

```sh
bun remove @alxia/openapi-routes
bun add -d @alxia/openapi
```

```ts
// before
import { matchesSpec } from '@alxia/openapi-routes';

// after
import { matchesSpec } from '@alxia/openapi';
```

**Can it break your code.** No. `@alxia/openapi-routes` 0.3.0 re-exports
`@alxia/openapi`, deprecated, so an import of it keeps working until you
change it. It is a minor, 0.3.0, because it peers on `@alxia/openapi`
`^0.4.0`: `^0.2` never moves to it by itself, and it needs `@alxia/openapi`
moved to 0.4 with it. See
[`@alxia/openapi`'s checks](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/checks.md).

### The old `@alxia/openapi` is retired

**What changed.** `@alxia/openapi` 0.3.0 and earlier wrote an OpenAPI
document from the app: `openapi(app, { info, convert, exclude })`, and
`docs(app, …)`, which served it at `/openapi.json` with a reference page.
That is code first, the opposite of spec first, so it is retired: 0.4.0 of
`@alxia/openapi` is the former `@alxia/openapi-routes`, and `openapi`,
`docs`, `toJsonSchema`, `Converter` and the rest of 0.3 are gone from it.

**Can it break your code.** Yes, for an app that calls `openapi()` or
`docs()`: with `@alxia/openapi` 0.4.0 its imports no longer resolve.

**How to migrate.**

1. **Write `openapi.yaml`.** Start from the document 0.3 made, exported
   once *before* you upgrade, with `@alxia/openapi` 0.3 still installed;
   from then on it is the source, edited by hand:

   ```ts
   // export-openapi.ts — bun export-openapi.ts, once, then delete it
   import { openapi } from '@alxia/openapi'; // 0.3
   import { zodConverter } from '@alxia/zod';
   import { app } from './src/app';

   const document = openapi(app, { info: { title: 'Todos', version: '1.0.0' }, convert: zodConverter });
   await Bun.write('openapi.yaml', Bun.YAML.stringify(document, null, 2));
   ```

   Declare alxia's own 400 in it, `{ error: 'validation', issues }`
   (`ValidationErrorBody`), on the routes that validate, and the
   replies of your middlewares, such as a 401.

2. **Generate the operations** with `@nxgt/openapi-codegen`'s `alxia`
   option:

   ```sh
   bun add zod
   bun add -d @alxia/openapi@latest @nxgt/openapi-codegen
   ```

   ```ts
   // openapi-codegen.config.ts
   import { defineConfig } from '@nxgt/openapi-codegen';

   export default defineConfig({
   	input: 'openapi.yaml',
   	output: 'src/generated',
   	alxia: true,
   	validationErrors: false, // the 400 is alxia's, declared in openapi.yaml
   });
   ```

   `bunx nxgt-openapi generate` writes `src/generated/`, and
   `bunx nxgt-openapi generate --check` exits 1 when it is stale, for CI.

3. **Bind each operation** with `route(operation, ...middlewares, handler)`,
   in place of the route that declared its own path and schemas:

   ```ts
   // before
   app.post('/todos', requireKey, validate({ body: NewTodo }), responds({ 201: Todo }), handler);

   // after
   app.route(operations.createTodo, requireKey, handler);
   ```

4. **Check the routes against the document** with `matchesSpec(app,
   operations)` in a test, as in
   [alxia is OpenAPI spec first](#alxia-is-openapi-spec-first).

5. **Serve the document yourself**, if clients fetched it from the app:
   it is a file now, served as any other, and a route `matchesSpec` is told
   to leave out:

   ```ts
   app.file('/openapi.yaml', './openapi.yaml');

   matchesSpec(app, operations, { exclude: (route) => route.path === '/openapi.yaml' });
   ```

   A reference page is any static viewer pointed at that URL; alxia serves
   none.

**For maintainers.** After the releases — `@alxia/openapi` 0.4.0 for the
first, `@alxia/openapi-routes` 0.3.0 for the second — the owner deprecates
the old versions on npm:

```sh
npm deprecate @alxia/openapi@"<=0.3.0" "Retired: alxia is OpenAPI spec first. @alxia/openapi 0.4.0 and later is the spec-first package that was @alxia/openapi-routes (implemented, matchesSpec): write the OpenAPI document, generate the operations with @nxgt/openapi-codegen, bind them with route(). See https://github.com/softistx/alxia/blob/develop/packages/core/docs/upgrading.md"
npm deprecate @alxia/openapi-routes@"<=0.3.0" "Moved to @alxia/openapi: bun add -d @alxia/openapi and change the import, nothing else. See https://github.com/softistx/alxia/blob/develop/packages/openapi-routes/README.md"
```

### The context registered once: `Register` and `defineRoutes`

**What changed.** `@alxia/core` exports `Register`, an interface the app
augments with the chain that builds its context, and what reads it:
`AppContext`, that context, and `defineRoutes(prefix?)`, routes built on
it that require it of the app mounting them. A file of routes no longer
imports the app, nor takes it as a parameter.

**Can it break your code.** No for core: nothing reads `Register` until
an app augments it. `@alxia/context-storage`'s `contextStorage<typeof
base>()` now requires `base`'s context of the app that uses it, and so
does `contextStorage()`, typed by `Register`: mounting it on an app that does
not give that context, which read `undefined` at runtime, is now a compile
error. `@alxia/react-router`'s `alxiaOf(context)` reads core's `Register`
when its own names no server; its own still wins.

**How to migrate**, optionally, a file of routes at a time:

```ts
// before: src/routes/todos.ts takes the base
import type { base } from '../context';

export const todos = (app: typeof base) =>
	app.get('/todos', ({ user, reply }) => reply(200, user.todos));

// after: src/context.ts registers the base once…
declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}

// …and src/routes/todos.ts imports @alxia/core alone
import { defineRoutes } from '@alxia/core';

export const todos = defineRoutes('/todos')
	.get('/', ({ user, reply }) => reply(200, user.todos));

// src/app.ts
export const app = base.plugin(todos);
```

Register `base`, never the app that mounts the routes: `TS7022`
otherwise ([Troubleshooting](troubleshooting.md#app-implicitly-has-type-any-because-it-does-not-have-a-type-annotation-and-is-referenced-directly-or-indirectly-in-its-own-initializer)).
A service typed `ContextOf<typeof base>` can take `AppContext` instead,
and `contextStorage<typeof base>()` can drop its type argument.

## 0.3.1

| Change | Package | Can it break your code |
| --- | --- | --- |
| [The app's methods typed by interfaces](#the-apps-methods-typed-by-interfaces) | core | only a subclass of `Alxia` that overrides one of them |

A range request on an empty file is also answered as RFC 9110 says: a
`200` for a suffix range, a `416` otherwise; see the
[CHANGELOG](https://github.com/softistx/alxia/blob/develop/packages/core/CHANGELOG.md).

### The app's methods typed by interfaces

**What changed.** No call, type or behaviour an app relies on. Each member
of `Alxia` that was still a method — `static`, `file`, `page`, `decorate`,
`derive`, `wrap`, `bodyLimit`, `onError`, `onRequest`, `onResponse`,
`around`, `onStart`, `onStop`, `parser`, `group`, `use`, `request`,
`listen` — is now a readonly property typed by an interface of its own, as
`get`, `ws` and `onRefusal` already were. The interface holds the overloads
and their documentation, which an editor shows on hover as before. One
difference is visible: a method taken off the app, `const { derive } = app`,
now stays bound to it.

```ts
// unchanged
app.derive(auth).onRequest(cors).group('/admin', (admin) => admin.get('/stats', handler));
```

**Can it break your code.** Only a class that extends `Alxia` and overrides
one of these. In TypeScript a method cannot override a property, so it no
longer compiles; in JavaScript, or past a `@ts-ignore`, the overriding
method is shadowed by the property and never runs. Wrap the app in a
function plugin instead:

```ts
const audited: Plugin = (app) => app.onRequest(({ request }) => void audit(request));
alxia().use(audited);
```

New exports, so an app's type can be named in a declaration file:
`StaticMethod`, `FileMethod`, `PageMethod`, `DecorateMethod`,
`DeriveMethod`, `WrapMethod`, `BodyLimitMethod`, `ErrorMethod`,
`RequestHookMethod`, `ResponseHookMethod`, `AroundMethod`,
`StartHookMethod`, `StopHookMethod`, `ParserMethod`, `GroupMethod`,
`UseMethod`, `RequestMethod`, `ListenMethod`.

## 0.3.0

`@alxia/core` 0.3.0 ships with `@alxia/openapi` 0.3.0 — the document
writer, [retired in 0.4](#the-old-alxiaopenapi-is-retired) — and 0.2.0 of
`@alxia/logger`, `@alxia/telemetry`, `@alxia/secure-headers`,
`@alxia/react-router` and `@alxia/openapi-routes`, which is `@alxia/openapi`
from 0.4.0 on.

**Upgrade every `@alxia/*` package together.** Each one names `@alxia/core`
as a peer by a `^0.2` range, which 0.3.0 is outside of; their next releases
move the range.

```sh
bun add @alxia/core@0.3 @alxia/openapi@0.3 # and every other @alxia/* you use; @alxia/openapi@latest is the 0.4 package, not the document writer
```

| Change | Package | Can it break your code |
| --- | --- | --- |
| [Hooks on one route](#hooks-on-one-route) | core | no |
| [The request's cookies on every hook](#the-requests-cookies-on-every-hook) | core | yes, in three narrow cases |
| [Route paths checked by the types](#route-paths-checked-by-the-types) | core | yes: a path the app refused at startup, and a wrapper generic in its path |
| [`onRefusal(kind, …)`](#onrefusalkind-) | core, openapi | no; one compile error reads differently |
| [`matchesSpec`, the new name of `exactly`](#matchesspec-the-new-name-of-exactly) | openapi-routes | no; `exactly` is deprecated |
| [Streamed bodies timed to their last byte](#streamed-bodies-timed-to-their-last-byte) | logger, telemetry | dashboards and tests that read a streamed request's entry or span |
| [A CSP nonce per request](#a-csp-nonce-per-request) | secure-headers, react-router | no; opt-in |

### Hooks on one route

**What changed.** Every route method takes a list of hooks after its path:
`app.<method>(path, [hooks], [schema,] handler)`,
`route(operation, [hooks], handler)` and `ws(path, [hooks], schema, handlers)`.
`static`, `file` and `page` take no list. A hook is made once with
`defineHook` (a `derive` of that route alone) or `defineWrap` (a `wrap`),
naming what it reads with `defineHook<Requires>()(hook)`. The list runs
after the hooks in force, in its order, then validation, then the handler.
What a hook adds, the hooks after it and the handler read. Its replies join
that route's type, so the client reads them; `@alxia/openapi` 0.3.0 did not
document them. A list holds at most 8 hooks.

```ts
// before: a group of one route, to keep a check off the routes after it
app.group((note) =>
	note
		.derive(({ pathParams, reply }) => (notes.has(pathParams['id'] ?? '') ? undefined : reply(404, { error: 'not_found' as const })))
		.patch('/notes/:id', { body: UpdateNote }, handler),
);
```

```ts
// after: the check, named once, listed on the routes that need it
import { defineHook } from '@alxia/core';

const exists = defineHook<{ params: { id: string } }>()(({ params, reply }) =>
	notes.has(params.id) ? undefined : reply(404, { error: 'not_found' as const }),
);

app.patch('/notes/:id', [exists], { body: UpdateNote }, handler);
```

Every route hook now reads `params` and `query` as they arrived before
validation replaces them for the handler. A hook of a route's list has them
in its type, typed by the route's path. A `derive` or `wrap` on the chain
has them at runtime only, and still reads `pathParams` in its type.

**Can it break your code.** No: a route without a list is declared and
typed as before, and costs the compiler nothing more. New exports:
`defineHook`, `defineWrap`, `RouteHook`, `RouteWrap`, `AnyRouteHook`,
`HookContext`, `RawRequestParts`, `MaxRouteHooks` and the types a route's
type threads its list with. All of them were removed in 0.5: see
[the forms of 0.3 are removed](#the-forms-of-03-are-removed).

### The request's cookies on every hook

**What changed.** `cookies` is on `BaseContext`: every route hook —
`derive`, `wrap`, `onError`, `onRefusal` — reads the request's cookies as
`ctx.cookies`, a `Readonly<Record<string, string>>` parsed from the
`Cookie` header on first read. A route's `cookies` schema still gives its
handler the validated values.

```ts
// before: parsing the header yourself
.derive(({ request }) => {
	const sid = /(?:^|;\s*)sid=([^;]*)/.exec(request.headers.get('cookie') ?? '')?.[1];
	return { user: sessions.get(sid ?? '') ?? null };
})

// after
.derive(({ cookies }) => ({ user: sessions.get(cookies['sid'] ?? '') ?? null }))
```

`set.cookies` is now typed `ResponseCookies`, Bun's `CookieMap` whose `get`
and `has` say in their documentation that they read the **response's**
cookies. Its behaviour is the same: `set.cookies.get('sid')` in a hook was
always `null`, and still is. Read `ctx.cookies` instead
([Troubleshooting](troubleshooting.md#setcookiesget-returns-null-in-a-middleware)).

**Can it break your code.** In three cases:

- **An object literal typed `BaseContext`**, such as a fake context in a
  test, must now give `cookies`:

  ```text
  error TS2741: Property 'cookies' is missing in type '{ … }' but required in type 'BaseContext'.
  ```

  ```diff
   const ctx: BaseContext = {
   	…
   	pathParams: { id: '1' },
  +	cookies: {},
   };
  ```

- **A handler's context passed to a helper typed `BaseContext`**, on a
  route whose `cookies` schema outputs anything but strings:

  ```text
  error TS2345: Argument of type 'Context<…>' is not assignable to parameter of type 'BaseContext'.
    Types of property 'cookies' are incompatible.
      Type '{ visits: number; }' is not assignable to type 'Readonly<Record<string, string>>'.
  ```

  Pass the helper the fields it reads, or type its parameter without
  `cookies`:

  ```ts
  import type { BaseContext } from '@alxia/core';

  const who = (ctx: Omit<BaseContext, 'cookies'>) => ctx.route;
  ```

- **A `derive` that returns `cookies`** now reaches a handler with no
  `cookies` schema; before, the handler saw the parsed header instead. A
  route's `cookies` schema now validates the map the `derive` returned, not
  the header. Rename the key if the handler expects the header's values.

See [Hooks: reading the request's cookies](guide/hooks.md#reading-the-requests-cookies).

### Route paths checked by the types

**What changed.** A route path written as a literal that the app would
refuse when the route is declared no longer compiles. Before, it compiled,
its params were inferred wrongly, and the app threw a `TypeError` at
startup. The check covers `get` and the other methods, `route`, `ws`,
`page`, `file` and `static`, under the app's prefix and the group's.

```ts
// before: compiled, params typed { 30: string }, threw at startup
app.get('/at/10:30', handler);
```

```text
error TS2345: Argument of type '"/at/10:30"' is not assignable to parameter of type '"Invalid path: \"/at/10:30\": \":\" may only start a segment, as a parameter"'.
```

```ts
// after: a parameter is a whole segment
app.get('/at/:time', handler);
```

The text after `Invalid path:` is the `TypeError` the app would throw; each
is listed in [Troubleshooting](troubleshooting.md#argument-of-type--is-not-assignable-to-parameter-of-type-invalid-path-).
A path typed `string`, or holding a `` `${string}` ``, is left to the
runtime check, as before.

**Can it break your code.** Yes, for a function that forwards a path
generic in `P` to a route method:

```text
error TS2345: Argument of type 'P' is not assignable to parameter of type 'PathAt<"", P, P>'.
```

Type the parameter with the check of the method it forwards to. The path is
then checked where the function is called:

```ts
import { alxia, type PathAt, type RoutePath, type StaticPath } from '@alxia/core';

// before: export function routedAt<const P extends RoutePath>(path: P)
export function routedAt<const P extends RoutePath>(path: PathAt<'', P>) {
	return alxia().get(path, ({ reply }) => reply(200, 'x'));
}
export function servedAt<const P extends RoutePath>(path: PathAt<'', P, StaticPath<P>>) {
	return alxia().static(path, './public');
}
```

New exports: `PathAt`, `CheckedPath` and `StaticPath`.

### `onRefusal(kind, …)`

**What changed.** `onRefusal` takes a kind first, `'validation'` or
`'body_limit'`, for a hook that answers that kind alone. It reads its
refusal narrowed, and its replies replace that kind's default only, in the
route's type, the client and the OpenAPI document. `onRefusal(hook)` and
`onRefusal(schema, hook)` are unchanged.

```ts
// before: one hook, checking the kind
.onRefusal((refusal) =>
	refusal.kind === 'validation'
		? problem({ status: 422, detail: `the ${refusal.part} is invalid` })
		: undefined,
)

// after: a hook of one kind; body_limit falls back to the general hook, then the 413
.onRefusal('validation', (refusal) => problem({ status: 422, detail: `the ${refusal.part} is invalid` }))
```

**Can it break your code.** No. One compile error reads differently:
`onRefusal` now has four forms, so a schema mistake such as a 5xx status is
reported as no overload matching, with the old message nested under it:

```text
error TS2769: No overload matches this call.
  Overload 1 of 4, '(schema: RefusalSchema<RefusalResponses>, hook: …)', gave the following error.
    Object literal may only specify known properties, and '500' does not exist in type 'RefusalResponses'.
```

A kind typed as a union, or as a generic parameter, is refused at compile
time: write one call per kind.
`@alxia/openapi` 0.3.0, the document writer, documented each kind's statuses on the routes that
kind may refuse. `onRefusal` was removed in 0.5: see
[`onRefusal`](#onrefusal).

New exports: `RefusalKind`, `RefusalOfKind`, `RefusalHandlersByKind`,
`RefusalMethod`, and the marks `RefusingKind`, `KindFallsBack`,
`KindRefusalsOf`, `KindOutcome`, `OneKind`.

### `matchesSpec`, the new name of `exactly`

**What changed.** In `@alxia/openapi-routes`, `exactly(app, operations)` is
renamed `matchesSpec`, and `ExactlyOptions` `MatchesSpecOptions`.

```ts
// before
import { exactly } from '@alxia/openapi-routes';
exactly(app, operations);

// after
import { matchesSpec } from '@alxia/openapi-routes';
matchesSpec(app, operations);
```

**Can it break your code.** No: `exactly` and `ExactlyOptions` still work,
deprecated, and their messages still start with `exactly():`. From 0.4.0
on, both are imported from
[`@alxia/openapi`](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/checks.md)
([the move](#alxiaopenapi-routes-is-now-alxiaopenapi)).

### Streamed bodies timed to their last byte

**What changed.** A streamed body — a page rendered as it goes, an event
stream, a `ReadableStream` reply — is now timed until it has been sent:

- `@alxia/logger` writes its entry once the body has ended, not when the
  handler returned. `duration` runs to the last byte, and two fields are
  new: `timeToHeaders`, the time to the response, and `outcome`,
  `completed`, `aborted` (logged at least `warn`) or `errored` (`error`).
- `@alxia/telemetry` keeps the server span open until the body has been
  sent. A body that fails midway makes the span an error; a client that
  leaves adds an `http.response.aborted` event.

```ts
// an event stream whose client left after five seconds
// before: {"level":"info","message":"GET /ticks 200","duration":0.6,…}
// after:  {"level":"warn","message":"GET /ticks 200 aborted","duration":5004.1,"timeToHeaders":0.62,"outcome":"aborted",…}
```

A response with no body, or with a `Content-Length` header (every reply of
a string, JSON, a buffer or a file has one), is logged and traced as
before. A raw `Response` without that header is now timed as a stream.

**Can it break your code.** A dashboard or alert on the `duration` of
streamed routes now sees the whole stream. A test that reads the entry or
the span of a streamed route right after `app.request` must read or cancel
the body first:

```ts
const response = await app.request('/ticks');
await response.body?.cancel(); // or `await response.text()` for a body that ends
```

See [`@alxia/logger`: a streamed body](https://github.com/softistx/alxia/blob/develop/packages/logger/docs/guide.md#a-streamed-body)
and [`@alxia/telemetry`: a streamed body](https://github.com/softistx/alxia/blob/develop/packages/telemetry/docs/guide.md#a-streamed-body).

### A CSP nonce per request

**What changed.** `secureHeaders({ nonce: true })` makes a fresh nonce for
each request, adds it to the policy's `script-src` and `script-src-elem`
(or wherever the policy names the exported `NONCE`), and gives the routes
declared after it `ctx.nonce`. In a React Router app, `nonceOf(loadContext)`
from `@alxia/react-router` reads it in `entry.server.tsx`:

```ts
import { alxia } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const app = alxia()
	.use(secureHeaders({ nonce: true, contentSecurityPolicy: "default-src 'self'; script-src 'self'" }))
	.get('/', ({ nonce, reply }) =>
		reply(200, `<script nonce="${nonce}">document.title = 'ready'</script>`, {
			headers: { 'content-type': 'text/html; charset=utf-8' },
		}),
	);
```

```diff
 // app/entry.server.tsx
+import { nonceOf } from "@alxia/react-router";
 …
-      <ServerRouter context={routerContext} url={request.url} />,
+      <ServerRouter context={routerContext} url={request.url} nonce={nonceOf(loadContext)} />,
       {
+        nonce: nonceOf(loadContext),
```

**Can it break your code.** No: without `nonce: true`, every header is what
it was. With it, a policy with nowhere to put the nonce,
`contentSecurityPolicy: false`, or `NONCE` without `nonce: true` are
refused at startup. See
[`@alxia/secure-headers`: a nonce per request](https://github.com/softistx/alxia/blob/develop/packages/secure-headers/docs/guide.md#a-nonce-per-request)
and [`@alxia/react-router`: a CSP nonce](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#a-csp-nonce).

### Other packages in 0.3.0

These packages changed with 0.3.0, each with its own docs:

- `@alxia/openapi` 0.3.0 — the document writer documented each `onRefusal` kind's statuses on the routes that kind may refuse; it is [retired in 0.4](#the-old-alxiaopenapi-is-retired).
- `@alxia/logger` 0.2.0, `@alxia/telemetry` 0.2.0 — [above](#streamed-bodies-timed-to-their-last-byte).
- `@alxia/secure-headers` 0.2.0, `@alxia/react-router` 0.2.0 — [above](#a-csp-nonce-per-request).
- `@alxia/openapi-routes` 0.2.0 — [above](#matchesspec-the-new-name-of-exactly); `@alxia/openapi` from 0.4.0 on.

Every other `@alxia/*` package, `@alxia/client` included, got a patch
release whose only change is its peer range on `@alxia/core`; its own docs
have nothing new.

## From 0.2.0 or earlier

`@alxia/core` 0.2.1 already shipped this, so it is not part of the next release. If you are upgrading from 0.2.0 or earlier, it changes one thing an app may see: **a client
that hangs up mid-request** is no longer logged and answered 500. Nothing
is printed, no `onError` hook runs, and the request gets a bodyless `499`
that only `onResponse` hooks — a logger's — see.

```ts
// before: a 500 and a console.error for a client that left during the body read
// after: a 499, no log, no onError
app.onResponse((response, { request }) => {
	if (response.status === 499) console.info('client left', request.url);
});
```

It cannot break code, but a log or an alert counting 500s sees fewer. An
error the app throws after the client left is still logged and answered
500. See [Replies: errors](guide/replies.md#errors).
