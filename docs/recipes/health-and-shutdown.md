# Health checks and graceful shutdown

**The problem.** The app runs under a supervisor that starts, stops and
replaces it: Kubernetes, a container platform, systemd. It must tell the
supervisor whether it is alive and whether it can take traffic, and when it
is told to stop it must finish the requests it holds, close what it opened,
and exit 0, without a client seeing a reset.

Two probes and one shutdown, all in `@alxia/core`: no package to add.

```sh
bun add @alxia/core
```

## The probes

`health()` is a plugin with two routes. **Liveness**, `GET /health`, answers
200 while the process is up: a failing liveness probe restarts the process,
so it checks nothing else. **Readiness**, `GET /ready`, runs your `checks`,
one per dependency, and answers 200, or 503 when one fails, so the supervisor
stops sending traffic and does not restart.

Mount it **first**, before a guard: a probe carries no credentials. Anything
declared before it runs on the probes too.

```ts
// file: src/app.ts
import { alxia, health } from '@alxia/core';

// Your dependencies: a database pool, a Redis handle.
export const database = {
	up: true,
	async ping(): Promise<void> {
		if (!this.up) throw new Error('connection refused');
	},
	async close(): Promise<void> {},
};

export const app = alxia()
	.plugin(
		health({
			checks: {
				// A check passes when it returns or resolves; fails when it throws,
				// rejects, returns false, or outlasts `timeout` (1 s by default).
				database: () => database.ping(),
				// With @alxia/redis: redis: redisCheck(handle)
			},
		}),
	)
	// A guard here, after the probes, would not see them.
	.get('/slow', async ({ reply }) => {
		await Bun.sleep(300);
		return reply(200, { done: true });
	})
	// Runs on shutdown, after the requests in flight finished: close pools, flush queues.
	.onStop(() => database.close());
```

```json
{ "status": "down", "checks": {} }
```

Outside dev, `/ready` says `ok` or `down` and nothing more: a probe is often
reachable from outside, and the names and durations of your dependencies are
not its business. In dev, or with `health({ checks, details: true })`, it
shows each check:

```json
{
	"status": "down",
	"checks": {
		"database": { "status": "down", "duration": 3, "reason": "failed" }
	}
}
```

The `reason` is `timeout` or `failed`, never the error's message, which may
name a host. A check still running from an earlier probe is not started
again: the next probe waits for the same run. The report is kept for
a second (`cache`) so three load balancers asking every second run each check
once. Keep `timeout` under the probe's own.

## The shutdown

`listen` handles `SIGTERM` and `SIGINT` itself. Nothing else to write:

```ts
// file: src/server.ts
import { app } from './app';

app.listen({
	port: Number(Bun.env['PORT'] ?? 3000),
	shutdownTimeout: 25_000, // how long requests in flight have; default 10 s
	stopTimeout: 5_000, // how long the onStop hooks have, in all; the default
	onListen: ({ url }) => console.log(`listening on ${url}`),
});
```

On the signal, in order:

1. `/ready` answers **503** (`shutting_down`), without running a check. `/health` stays 200.
2. Every stream of server-sent events, and every GraphQL subscription, ends.
3. New connections are refused. Open sockets are closed with 1001, going away.
4. **The requests in flight finish**, for `shutdownTimeout` at most.
5. Every `onStop` hook runs, awaited in turn, within `stopTimeout`: past
   it, the hung hook is logged by name and the process exits 1.
6. The process exits 0, or 1 when a hook threw. A second signal exits at once.

A process with a `SIGTERM` handler of its own is left to it: `listen` shuts
its apps down and lets that handler exit. `exit: false` does the same with
no handler, for a host that exits elsewhere. `listen` twice on one app
throws, and the `onStop` hooks run once per `listen`.

A response that never ends by itself, a long poll or a body streamed by
hand, holds step 4 until the timeout: end it on `shutdownSignal(ctx)`, an
`AbortSignal` aborted when the shutdown starts.

## Test it, with a real signal

A signal needs a real process. The test starts the server, sends it a
request that takes a while, then the signal:

```ts
// file: src/shutdown.spec.ts
import { expect, test } from 'bun:test';

test('SIGTERM lets the request in flight finish, then exits 0', async () => {
	const server = Bun.spawn(['bun', 'src/server.ts'], {
		env: { ...Bun.env, PORT: '0', NODE_ENV: 'production' }, // port 0: a free one
		stdout: 'pipe',
		stderr: 'inherit',
	});
	const reader = server.stdout.getReader();
	let out = '';
	while (!out.includes('\n')) out += new TextDecoder().decode((await reader.read()).value);
	const url = out.match(/listening on (\S+)/)?.[1] ?? '';

	expect((await fetch(`${url}health`)).status).toBe(200);
	expect((await fetch(`${url}ready`)).status).toBe(200);

	const slow = fetch(`${url}slow`); // takes 300 ms
	await Bun.sleep(100);
	server.kill('SIGTERM');

	const answered = await slow;
	expect(answered.status).toBe(200); // finished, not reset
	expect(await answered.json()).toEqual({ done: true });
	expect(await server.exited).toBe(0);
});

test('a failing check turns readiness 503, and liveness stays 200', async () => {
	const { app, database } = await import('./app');
	database.up = false;
	try {
		const ready = await app.request('/ready');
		expect(ready.status).toBe(503);
		expect(await ready.json()).toEqual({ status: 'down', checks: {} }); // no details outside dev
		expect((await app.request('/health')).status).toBe(200);
	} finally {
		database.up = true;
	}
});
```

## Docker and Kubernetes

`docker stop` sends `SIGTERM`, and `SIGKILL` after ten seconds by default.
The 25 seconds of `shutdownTimeout` above, plus the 5 of `stopTimeout`,
need `docker stop -t 35` (or a
smaller `shutdownTimeout`), and under Kubernetes a
`terminationGracePeriodSeconds` above it. The container's process 1 must be
the server, not a shell around it, or the signal never arrives: the
Dockerfile's `CMD ["bun", "--no-install", "dist/server.js"]`
([Deploying](deploying.md)) is that.

```yaml
# Kubernetes
containers:
  - name: api
    livenessProbe:
      httpGet: { path: /health, port: 3000 }
    readinessProbe:
      httpGet: { path: /ready, port: 3000 }
      periodSeconds: 5
terminationGracePeriodSeconds: 30 # more than shutdownTimeout (25 s above)
```

## Reference

- [Health and shutdown](../../packages/core/docs/guide/health-and-shutdown.md):
  every option, the report, `isHealthRoute`, a process that handles its own
  signals (`signals: false`)
- [Hooks](../../packages/core/docs/guide/hooks.md#onstart-and-onstop):
  `onStart` and `onStop`
- [`redisCheck`](../../packages/redis/README.md) for a Redis readiness check,
  [caching and rate limiting](caching-and-rate-limiting.md)
- [GraphQL](graphql-api.md): subscriptions end on shutdown
- [`@alxia/core` troubleshooting](../../packages/core/docs/troubleshooting.md):
  a 503 from `/ready`, a shutdown that takes 10 seconds
