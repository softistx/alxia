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
| `stopTimeout` | `number` | `5000` | how long the `onStop` hooks have, all of them, in milliseconds; past it the hook still running is named, the hooks after it are skipped, and the shutdown fails ([Health and shutdown](health-and-shutdown.md#graceful-shutdown)) |
| `signals` | `NodeJS.Signals[] \| false` | `['SIGINT', 'SIGTERM']` | the signals that shut the app down gracefully, then exit the process — unless `exit` is `false` or the process has another listener of the signal; `false` installs no handler |
| `exit` | `boolean` | `true` | whether alxia exits the process once a signal shut the app down; `false` leaves the exit to the host |
| `onListen` | `(info: ListenInfo) => void` | none | told the URL, the routes and the route table once the server listens, in every mode, in place of the table printed in dev |

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
is the proxy. `forwardedIp` reads the client from the header the proxies
append to:

```ts
import { alxia, forwardedIp } from '@alxia/core';

const app = alxia({ ip: forwardedIp({ trusted: 1 }) }) // one proxy in front
	.get('/ip', ({ ip, reply }) => reply(200, ip ?? 'unknown'));
```

> **Security.** Never read the first entry of `X-Forwarded-For`
> (`header.split(',')[0]`). The client writes that entry, and each proxy
> appends the address it saw to the right, so a client that sends
> `X-Forwarded-For: 1.2.3.4` is believed to be `1.2.3.4`: a rate limit keyed
> by `ip` is bypassed by changing the header, and an allow list by naming an
> allowed address. Read from the right, past the proxies you run, as
> `forwardedIp` does. And trust the header only when every request reaches
> the app through your proxy: a client that reaches the app directly sends
> any header it likes. Ranges are the defence, since they believe the header
> from a proxy's address alone; a count of hops cannot tell.

### `forwardedIp({ header, trusted })`

```ts
function forwardedIp(options: ForwardedIpOptions): (request: Request, server: Bun.Server<unknown> | undefined) => string | undefined;
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `trusted` | `number \| string \| string[] \| (address: string) => boolean` | required | the proxies in front of the app (below) |
| `header` | `string` | `'x-forwarded-for'` | the header they append to; `'forwarded'` reads RFC 7239's `for=` |

`trusted` names the proxies one of two ways:

- **A number of hops**, `n`: the client is the `n`th entry from the right.
  `trusted: 1` is the last entry, which the one proxy appended;
  `trusted: 2`, the one before it, behind two proxies (a CDN, then a load
  balancer). Whatever stands to its left is never read.
- **CIDR ranges** (`'10.0.0.0/8'`, `'fd00::/8'`, one address `'192.168.1.1'`)
  or a function of the address: the header is believed only when the
  connection comes from such a proxy, and the client is the first entry
  from the right that is not one. A connection from anywhere else is the
  client, whatever it sends. With no server (`app.request`), the
  connection is unknown, and so is the `ip`.

```ts
alxia({ ip: forwardedIp({ trusted: ['10.0.0.0/8', 'fd00::/8'] }) });
alxia({ ip: forwardedIp({ header: 'forwarded', trusted: 1 }) }); // for="[2001:db8::17]:4711"
```

The connection's address is the answer when the header is missing, when a
hop count is larger than the entries, and when the entry chosen is
malformed (`unknown`, `_hidden`, a name, an empty entry, a bad IPv6): it is
never skipped to reach the entries to its left, which the client writes.
IPv4 and IPv6 are read, with brackets and a port, which the result drops;
an IPv4-mapped IPv6 address (`::ffff:10.0.0.1`) matches an IPv4 range.

To read anything else, `ip` is any function
`(request: Request, server: Bun.Server<unknown> | undefined) => string | undefined`,
and `ctx.ip` is what it returns, in every middleware and handler. A header a
platform sets, such as `CF-Connecting-IP`, is one such function, safe only
when the app is reachable through that platform alone.

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
again while it runs, or once it ran, `stop()` returns the same promise:
the `onStop` hooks run once per `listen`. Called before `listen`, it runs
the `onStop` hooks alone. One server at a time: `listen()` on an app that
already listens throws `listen(): the app already listens on <url>; stop()
it first` — stop it with `app.stop()`, not the Bun server's own `stop()`,
which the app does not see.

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
