# Serving

This page covers running an app: `listen` and its options, `fetch` and
`request` for tests and other servers, `websocket` for a `Bun.serve` of
your own, reading the client's address, and stopping cleanly. Probes and
the graceful shutdown on `SIGTERM` have a page of their own:
[Health and shutdown](health-and-shutdown.md).

```ts
import { alxia } from '@alxia/core';

const app = alxia().get('/', ({ reply }) => reply(200, 'hello'));

const server = app.listen({ port: 3000 });
console.log(`listening on ${server.url}`);
// SIGTERM, SIGINT: the requests in flight finish, the onStop hooks run, the process exits
```

## `listen(options?)`

```ts
listen(options?: ListenOptions | number): Bun.Server<unknown>
```

`Bun.serve` with the app. A number is the port. Each declared path goes to
Bun's own router; a request none of them matches goes to `fetch`, which
answers 404 or 405. Sockets and [HTML pages](static-files.md#bun-html-bundles)
are wired in too: pages only work through `listen`, sockets through it or
a `Bun.serve` given [`websocket`](#websocket).

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `port` | `number \| string` | Bun's | the port; `0` picks a free one |
| `hostname` | `string` | Bun's | the interface to listen on |
| `development` | `boolean` | Bun's | Bun's development mode, which hot-reloads `page` bundles |
| `idleTimeout` | `number` | Bun's | seconds before an idle connection is closed |
| `maxRequestBodySize` | `number` | Bun's | the largest body the server accepts, in bytes; a route's [`bodyLimit`](routes.md#body-size-bodylimit) caps its own below it |
| `tls` | `Bun.TLSOptions` | none | serve HTTPS |
| `shutdownTimeout` | `number` | `10000` | how long the requests in flight have to finish once shutdown starts, in milliseconds ([Health and shutdown](health-and-shutdown.md#graceful-shutdown)) |
| `signals` | `NodeJS.Signals[] \| false` | `['SIGINT', 'SIGTERM']` | the signals that shut the app down gracefully, then exit the process; `false` installs no handler |

```ts
app.listen({
	port: 443,
	tls: { cert: Bun.file('./cert.pem'), key: Bun.file('./key.pem') },
	maxRequestBodySize: 10 * 1024 * 1024,
});
```

It returns Bun's `Server`, also readable as `app.server` until `stop`.
Its signal handlers are in place before it returns; every `onStart` hook
then runs with the server ([Hooks](hooks.md#onstart-and-onstop)).

## `fetch` and `request`

```ts
readonly fetch: (request: Request, server?: Bun.Server<unknown>) => Promise<Response>;
request(path: string, init?: RequestInit): Promise<Response>;
```

`app.fetch` is the whole app as a fetch handler — every middleware, routing,
validation — and is bound, so it can be passed around:

```ts
export default { fetch: app.fetch }; // `bun run` serves a default export with a fetch
```

`app.request(path, init?)` builds the request against
`http://localhost` and calls `fetch`: the shortest way to test a route.

```ts
import { expect, test } from 'bun:test';

test('POST /users', async () => {
	const response = await app.request('/users', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: 'Grace' }),
	});
	expect(response.status).toBe(201);
});
```

Through `fetch` alone there is no server: `ctx.server` is `undefined`, the
default `ip` is `undefined`, a socket route answers 426, and a `page`
answers 404. Use `listen({ port: 0 })` to test those.

## `websocket`

```ts
get websocket(): Bun.WebSocketHandler<…>
```

The handler `Bun.serve` opens the app's sockets with: what `listen`
passes beside `fetch`. Give both to a server you start yourself, and its
`ws` routes connect as through `listen`:

```ts
const server = Bun.serve({ port: 3000, fetch: app.fetch, websocket: app.websocket });
```

Such a server is not the app's: `app.server` stays `undefined`, and
`onStart` and `onStop` do not run. One handler serves every socket the app
opens, its groups' and plugins' included.

## The client's address: `ip`

`ctx.ip` is the address of the connection by default. Behind a proxy that
is the proxy; read the header it sets instead, and only from a proxy you
trust:

```ts
const app = alxia({
	ip: (request, server) =>
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
		server?.requestIP(request)?.address,
}).get('/ip', ({ ip, reply }) => reply(200, ip ?? 'unknown'));
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `ip` | `(request: Request, server: Bun.Server<unknown> \| undefined) => string \| undefined` | the connection's address | what `ctx.ip` reads, in every middleware and handler |

## The options of `alxia()`

```ts
function alxia<const Prefix extends '' | RoutePath = ''>(options?: AlxiaOptions<Prefix>): Alxia<…>;
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `prefix` | `` `/${string}` `` | `''` | prepended to every route ([Groups and plugins](groups-and-plugins.md#prefixes)) |
| `validateResponses` | `boolean` | `true` | check and strip replies ([Replies](replies.md#validateresponses)) |
| `ip` | function | the connection's | above |
| `errors` | `'json' \| 'problem'` | `'json'` | the format of the errors alxia answers itself: `{ error: … }` bodies, or RFC 9457 problems ([Errors](errors.md)) |

## Stopping

```ts
stop(closeActiveConnections?: boolean): Promise<void>
```

Shuts the server `listen` started down, gracefully — what `SIGTERM` and
`SIGINT` run, without the exit: readiness turns 503, new connections are
refused, open sockets close with 1001, the requests in flight finish
within `shutdownTimeout`, then each `onStop` hook is awaited in turn.
`closeActiveConnections` closes the requests in flight at once. Called
again while it runs, `stop()` returns the same promise; called before
`listen`, it runs the `onStop` hooks alone.

```ts
const app = alxia()
	.onStop(async () => {
		await queue.flush();
	})
	.get('/', ({ reply }) => reply(200));

app.listen(3000); // SIGTERM: the requests in flight, queue.flush(), exit 0
```

In a test, `await app.stop()` after `listen({ port: 0 })` frees the port
and runs the hooks; the order of each step, and a process that keeps its
signals, are in [Health and shutdown](health-and-shutdown.md#graceful-shutdown).

## Introspection

| Getter | Holds |
| --- | --- |
| `app.routes` | every HTTP route as the app runs it (`RouteDefinition`): method, full path, schema, handler — what `@alxia/openapi`'s `matchesSpec` checks against the document |
| `app.sockets` | every socket route (`SocketDefinition`) |
| `app.server` | the server `listen` started, until `stop` |

```ts
for (const route of app.routes) console.log(route.method, route.path);
```

## See also

- [Getting started](getting-started.md): a first app and its tests.
- [Hooks](hooks.md#onstart-and-onstop): `onStart` and `onStop`.
- [Health and shutdown](health-and-shutdown.md): `health()`, and what a
  `SIGTERM` does.
