# Health and shutdown

This page covers running an app under a supervisor — Kubernetes, a
container platform, systemd: the liveness and readiness probes of
`health()`, and the graceful shutdown `listen` runs on `SIGTERM` and
`SIGINT`.

```ts
import { alxia, health } from '@alxia/core';

const app = alxia()
	.plugin(health({
		checks: {
			redis: () => redis.ping(),
			db: () => sql`select 1`,
		},
	}))
	.use(bearer({ jwt })) // after the probes: they need no token
	.get('/me', ({ user, reply }) => reply(200, user))
	.onStop(() => sql.end());

app.listen({ port: 3000 });
// GET /health → 200 { status: 'ok' }
// GET /ready  → 200 { status: 'ok', checks: { redis: { status: 'ok', duration: 1 }, db: { … } } }
// SIGTERM     → /ready 503, the requests in flight finish, sql.end(), exit 0
```

## `health(options?)`

```ts
function health(options?: HealthOptions): Alxia<Empty, ''>;
```

A plugin app, given to `app.plugin`, with two `GET` routes (and their
`HEAD`):

| Route | Answers |
| --- | --- |
| `GET /health`, liveness | 200 `{ status: 'ok' }` while the process is up, shutting down included: a failing liveness probe restarts the process, which a shutdown must not cause |
| `GET /ready`, readiness | 200 `{ status: 'ok', checks }` when every check passes; 503 `{ status: 'down', checks }` when one fails; 503 `{ status: 'shutting_down', checks: {} }` from the moment the app starts shutting down, without running a check |

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `checks` | `Record<string, () => unknown>` | none | the dependencies readiness checks, by name |
| `path` | `RoutePath` | `/health` | where liveness answers |
| `readyPath` | `RoutePath` | `/ready` | where readiness answers |
| `timeout` | `number` | `1000` | how long each check may take, in milliseconds |
| `cache` | `number` | `1000` | how long a readiness report is kept, in milliseconds; `0` runs the checks on every probe |

A check **passes** when it returns or resolves, and **fails** when it
throws, rejects, returns `false` or outlasts `timeout`. Every check runs
at once, so readiness takes as long as the slowest. Each result says how
long it took, and why it is down:

```json
{
	"status": "down",
	"checks": {
		"redis": { "status": "ok", "duration": 1 },
		"db": { "status": "down", "duration": 1000, "reason": "timeout" }
	}
}
```

`reason` is `timeout` or `failed`, never the error's message, which may
name a host or a credential: the probe is often reachable from outside.
Every probe answer carries `Cache-Control: no-store`.

**The report is cached.** A probe every second from three replicas of a
load balancer would otherwise run every check three times a second; the
report is kept for `cache` milliseconds once made, and the probes that
ask while it is being made share it. Keep `timeout` below the probe's
own timeout (Kubernetes' default is 1 second).

### Where to mount it

`health()` declares routes, so the middlewares given to `use` before it
run on them. Mount it **first**, before a guard — a probe carries no
credentials — and before what should not see probes:

```ts
const app = alxia()
	.use(logger({ skip: (_request, url) => url.pathname === '/health' || url.pathname === '/ready' }))
	.plugin(health({ checks }))
	.use(bearer({ jwt }));
```

`@alxia/logger`'s `skip` keeps the probes out of the log: every probe,
every second, would be most of it.

### `matchesSpec` and `isHealthRoute`

The probes are no operation of the OpenAPI document, and
`@alxia/openapi`'s `matchesSpec` leaves them out by itself, wherever they
are mounted: nothing to `exclude`. It tells them apart with
`isHealthRoute`, which tells `health()`'s routes from any other, whatever
their path — for a check of your own over `app.routes`:

```ts
import { isHealthRoute } from '@alxia/core';

const documented = app.routes.filter((route) => !isHealthRoute(route));
```

### Kubernetes

```yaml
livenessProbe:
  httpGet: { path: /health, port: 3000 }
readinessProbe:
  httpGet: { path: /ready, port: 3000 }
  periodSeconds: 5
terminationGracePeriodSeconds: 15 # more than shutdownTimeout
```

## Graceful shutdown

`listen` handles `SIGTERM` and `SIGINT`: the app shuts down, then the
process exits — 0, or 1 when an `onStop` hook throws, the error printed.
`app.stop()` runs the same shutdown without exiting. In order:

1. **Readiness turns 503**, and `shutdownSignal(ctx)` aborts: every stream
   of server-sent events a route replies with ends, and so does every
   `@alxia/graphql` subscription.
2. **New connections are refused.**
3. **Every open socket is closed** with 1001, going away.
4. **The requests in flight finish**, for `shutdownTimeout` milliseconds
   at most; past it, their connections are closed.
5. **Every `onStop` hook runs**, each awaited in turn: close a pool, flush
   a queue.
6. The process exits (on a signal only).

A second signal while the app drains exits at once, with 1: a `Ctrl-C`
pressed twice does not wait.

| `listen` option | Type | Default | Effect |
| --- | --- | --- | --- |
| `shutdownTimeout` | `number` | `10000` | how long the requests in flight have to finish, in milliseconds |
| `signals` | `NodeJS.Signals[] \| false` | `['SIGINT', 'SIGTERM']` | the signals that shut the app down; `false` installs none |

```ts
app.listen({ port: 3000, shutdownTimeout: 25_000 });
```

The handlers are installed before `listen` returns, so a supervisor that
signals as soon as it reads that the app listens finds them in place.
One handler per signal serves every app of the process, however many
`listen`.

### A process that handles its signals itself

Cleanup belongs in `onStop`: `listen`'s handler exits once the hooks ran,
so code after `await app.stop()` in a handler of your own may not run.
To keep the signals yours, turn them off and call `stop()`:

```ts
app.listen({ port: 3000, signals: false });

process.on('SIGTERM', async () => {
	await app.stop(); // the same graceful shutdown
	await report.flush();
	process.exit(0);
});
```

`stop()` called again while the shutdown runs returns the same promise;
`stop(true)` closes the connections in flight at once.

### A long response: `shutdownSignal(ctx)`

A response that never ends by itself — a long poll, a body streamed by
hand — holds the drain until `shutdownTimeout`. End it on
`shutdownSignal(ctx)`, an `AbortSignal` aborted as soon as the shutdown
starts:

```ts
import { shutdownSignal } from '@alxia/core';

app.get('/poll', async (ctx) => {
	const update = await Promise.race([
		nextUpdate(),
		new Promise((resolve) => shutdownSignal(ctx).addEventListener('abort', () => resolve(null))),
	]);
	return ctx.reply(200, { update });
});
```

A new `listen` after a `stop()` starts afresh: readiness answers again,
and a new signal is given to the requests.

### GraphQL

An `@alxia/graphql` endpoint drains like any route: a query or a mutation
in flight is answered, and a subscription over server-sent events is
ended when the shutdown starts — Yoga's stream is cancelled, as when the
client leaves, and the client reads the end of the stream and reconnects
to another instance. `health()` mounts beside it.

### `@alxia/react-router`

`createServer()`'s `start`, what `bun build/server/index.js` runs, calls
`listen`: the same shutdown, with `listen: { shutdownTimeout }` among its
options.

## See also

- [Serving](serving.md): `listen`'s other options, `fetch` for tests.
- [Hooks](hooks.md#onstart-and-onstop): `onStart` and `onStop`.
- [Troubleshooting](../troubleshooting.md): a 503 from `/ready`, a
  shutdown that takes 10 seconds.
