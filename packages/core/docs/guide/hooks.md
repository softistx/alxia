# Hooks

A middleware is the one way to run code around a request
([Middleware](middleware.md)). What remains beside it are the hooks of the
app itself — `onStart`, `onStop` and `parser`, which apply to the whole
app wherever they are declared — and `decorate` and `derive`, the
shorthands for a middleware that only adds to the context of the routes
after it.

```ts
import { alxia } from '@alxia/core';

const tokens = new Map([['Bearer ada', { id: 1, name: 'Ada' }]]);

const app = alxia()
	.decorate({ tokens })                              // ctx.tokens, everywhere after
	.get('/health', ({ reply }) => reply(200, 'ok'))   // not guarded
	.derive(({ request, tokens, reply }) => {          // adds to the context, cannot wrap
		const user = tokens.get(request.headers.get('authorization') ?? '');
		return user ? { user } : reply(401, { error: 'unauthenticated' as const });
	})
	.use(({ user }, next) => next({ greeting: `hello ${user.name}` })) // a middleware, for the rest
	.get('/me', ({ user, greeting, reply }) => reply(200, { user, greeting }))
	.onStart((server) => console.log(`listening on ${server.url}`));
```

**Request hooks were removed in 0.5.** `onRequest`, `onResponse`, `around`,
`wrap`, `onError`, `onRefusal`, a route's list of hooks, `defineHook` and
`defineWrap` are gone: each is a middleware now, and
[Upgrading](../upgrading.md#050) shows each one before and after.

## `decorate`

```ts
decorate<const Values extends object>(values: Values): Alxia<Ctx & Values, Prefix>
```

Values every route after it reads from its context: a database client, a
logger, a config. The same object every request.

```ts
import { Database } from 'bun:sqlite';
import { alxia } from '@alxia/core';

const app = alxia()
	.decorate({ db: new Database('app.sqlite'), log: console })
	.get('/count', ({ db, reply }) => reply(200, db.query('select count(*) as n from users').get()));
```

## `derive`

```ts
derive<Result>(hook: (ctx: BaseContext & Ctx) => MaybePromise<Result>): Alxia<…>
```

Runs on every request to a route declared after it, and on unmatched
requests when declared at the top level. It adds to the context and cannot
wrap what follows, which is the one thing a middleware is for beyond it.
What it returns:

| Returns | Effect |
| --- | --- |
| an object | merged into the context of the middlewares and handler after it, and typed there |
| a reply (`reply(…)`, `redirect(…)`) | ends the request with it |
| `undefined` | nothing |

```ts
const app = alxia()
	.get('/public', ({ reply }) => reply(200, 'open'))
	.derive(({ request, reply }) => {
		const token = request.headers.get('authorization');
		if (token !== 'Bearer ada') return reply(401, { error: 'unauthenticated' as const });
		return { user: 'ada' };
	})
	.get('/me', ({ user, reply }) => reply(200, { user }));
// GET /public → 200; GET /me without the header → 401; with it → {"user":"ada"}
```

A `derive`'s reply is sent as it is: it is made before the route's
middlewares, so a `responds` among them does not check it. For some routes
rather than every route after it, the same thing is a middleware on those
routes: `({ request, reply }, next) => … next({ user })`.

### Reading the request's cookies

A `derive`, like every middleware before a `validate`, reads the request's
cookies as `ctx.cookies`, a `Readonly<Record<string, string>>` parsed from
the `Cookie` header on first read. A `validate({ cookies })` gives what
follows it — the middlewares after it and the handler — the validated
values instead, typed by the schema's output:

```ts
app
	.derive(({ cookies }) => ({ sid: cookies['sid'] ?? null })) // a string, as it arrived
	.get('/visits', validate({ cookies: z.object({ visits: z.coerce.number() }) }),
		({ cookies, reply }) => reply(200, cookies.visits));     // a number
```

A `derive` that returns `cookies` replaces the map for what follows it; a
`validate({ cookies })` then validates the map it returned, not the `Cookie`
header. The full table, with `set.cookies` — the cookies the **response**
sets, which read back as `null` until the response sets them — is on
[Middleware: reading cookies](middleware.md#reading-cookies).

## Scope

`decorate` and `derive` are scoped as a `use` is: they apply to the routes
declared after them and, at the top level of the app, to every unmatched
request too. Inside a [group](groups-and-plugins.md#groups) they stay
inside it — its routes, and an unmatched request under its prefix. A
plugin's become the app's when the plugin has no prefix of its own.

## `onStart` and `onStop`

```ts
type StartHook = (server: Bun.Server<unknown>) => MaybePromise<void>;
type StopHook = (server: Bun.Server<unknown> | undefined) => MaybePromise<void>;
```

`onStart` runs once `listen` has started the server; it is not awaited, and
an error it throws is logged. `onStop` runs once the server has shut down —
on `SIGTERM` or `SIGINT`, or `stop()` — after the requests in flight
finished, each hook awaited in turn: close a pool, flush a log, all of
them within `listen`'s `stopTimeout` (5 s): past it, the hook still
running is named, the hooks after it are skipped, and the shutdown fails.
On a signal, one that throws or hangs ends the process with 1 — unless
the exit is not alxia's (`exit: false`, or a listener of the signal of the
process's own), and then `process.exitCode` is 1; under `stop()` the
promise rejects. Both apply to the whole app
wherever they are declared.

```ts
const app = alxia()
	.onStart((server) => console.log(`listening on ${server.url}`))
	.onStop(() => pool.end());
```

`onStop` is given the server that stopped, the one `onStart` was given, or
`undefined` on a `stop()` before `listen`, which runs the hooks too. Forks of
one base share its hooks, and each runs them once of its own: the argument
tells a shared hook which app stopped, and whether it had started, so a
resource the forks share is released when the last one serving stops:

```ts
const serving = new Set<Bun.Server<unknown>>();
const base = alxia()
	.onStart((server) => {
		serving.add(server);
	})
	.onStop(async (server) => {
		if (server === undefined || !serving.delete(server)) return; // never listened
		if (serving.size === 0) await pool.end();
	});
```

See [Serving](serving.md#stopping) and [Health and shutdown](health-and-shutdown.md#graceful-shutdown).

## `parser`

```ts
parser(type: string | RegExp, parse: (request: Request) => unknown): Alxia<…>
```

A body parser for a `content-type` prefix or pattern, tried before the
built-in JSON, form and text parsers for every route with a `body` schema
([Routes](routes.md#body-parsers)).

## See also

- [Middleware: which way to use](middleware.md): the order a request runs
  in, the tool for each need, and what a middleware reads.
- [Groups and plugins](groups-and-plugins.md): scoping middlewares to some
  routes, and sharing them across apps.
- [Serving](serving.md): `listen`, `stop`, and the lifecycle hooks.
- [Upgrading](../upgrading.md#050): the request hooks 0.5 removed, each as
  a middleware.
