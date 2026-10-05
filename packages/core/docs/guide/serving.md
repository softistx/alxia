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
| `canonical` | `boolean` | `true` | the address in its one text ([below](#one-text-per-address)); `false`, as written |

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

### One text per address

The same address can be written many ways — `2001:DB8:0:0:0:0:0:1`,
`2001:db8::1`, `[2001:db8::1]:443`; `::ffff:192.0.2.1` on a dual-stack
socket and `192.0.2.1` in a header — and a rate-limit key, a log line or
an allow list compared as a string would count one client as several.
So every address core reads for `ctx.ip` — the connection's by default,
`forwardedIp`'s and `trustProxy`'s from the header or the socket — is
given in one canonical text:

| Written | `ctx.ip` |
| --- | --- |
| `2001:0DB8:0000:0000:0000:0000:0000:0001` | `2001:db8::1` |
| `2001:db8:0:0:1:0:0:1` | `2001:db8::1:0:0:1` (the first of equal zero runs) |
| `[2001:db8::1]:443`, `203.0.113.9:8080` | `2001:db8::1`, `203.0.113.9` |
| `::ffff:192.0.2.1`, `::FFFF:c000:201` | `192.0.2.1` |
| `fe80:0:0:0:0:0:0:1%en0` (a socket's) | `fe80::1%en0` |

IPv6 is written as RFC 5952 says: lowercase, no leading zeros, the
longest run of two or more zero groups as `::`. An IPv4-mapped address is
the IPv4 address it maps. A zone id, which only a link-local socket
address carries, is kept as written after the canonical address; in a
header, an entry with one names no client, as before. A `trusted` function
is given the same text. It is the same address, only its text changes, so
it is on by default; `canonical: false` keeps the address as written, and
a custom `ip` function is read as it returns. `canonicalIp(address)` gives
your own values the same form:

```ts
import { alxia, canonicalIp } from '@alxia/core';

const blocked = new Set(['2001:DB8::0:1', '::ffff:198.51.100.4'].map(canonicalIp));
const app = alxia()
	.use((ctx, next) => (blocked.has(ctx.ip ?? '') ? ctx.reply(403, 'blocked') : next()))
	.get('/', ({ reply }) => reply(200, 'ok'));
```

To read anything else, `ip` is any function
`(request: Request, server: Bun.Server<unknown> | undefined) => string | undefined`,
and `ctx.ip` is what it returns, in every middleware and handler. A header a
platform sets, such as `CF-Connecting-IP`, is one such function, safe only
when the app is reachable through that platform alone.

When the app also needs the scheme and host the client asked for, declare
the proxies once with the `proxy` option instead: it reads `ctx.ip` the
same way, and those two besides.

## Behind a proxy: `proxy`

A proxy that terminates TLS talks to the app over plain HTTP, on an address
of its own: `ctx.url` is `http://10.0.0.5:3000/…`, not the
`https://example.com/…` the client asked for. `trustProxy` declares the
proxies in front of the app once, and every value they forward is read
through that one definition — the client's address, `ctx.ip`, and the
scheme and host it asked for, `originalUrl(ctx)`:

```ts
import { alxia, originalUrl, trustProxy } from '@alxia/core';

const app = alxia({ proxy: trustProxy({ trusted: ['10.0.0.0/8'] }) }).get(
	'/login',
	(ctx) => {
		// https://example.com/callback, behind the proxy; the request's own URL without it
		const callback = new URL('/callback', originalUrl(ctx)).href;
		return ctx.reply(200, { ip: ctx.ip ?? null, callback });
	},
);
```

`ctx.ip` is what `forwardedIp` with the same `trusted` and `header` reads,
so `alxia({ ip: forwardedIp(o) })` and `alxia({ proxy: trustProxy(o) })`
give the same address: keep `forwardedIp` when the address is all the app
reads. Give `ip` or `proxy`, not both: the app throws when it is built.

### `trustProxy({ trusted, header, untrusted, allow, canonical })`

```ts
function trustProxy(options: StrictProxyOptions): ProxyTrust; // untrusted: 'refuse-all', trusted by address, allow
function trustProxy(options: TrustProxyOptions): ProxyTrust;
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `trusted` | `number \| string \| string[] \| (address: string) => boolean` | required | the proxies in front of the app, as for [`forwardedIp`](#forwardedip-header-trusted-) |
| `header` | `string` | `'x-forwarded-for'` | `'x-forwarded-for'`: the address from it, the scheme from `X-Forwarded-Proto`, the host from `X-Forwarded-Host`; `'forwarded'`: all three from RFC 7239's `for=`, `proto=` and `host=`; another name: the address from that header, the scheme and host from `X-Forwarded-*` |
| `untrusted` | `'ignore' \| 'refuse' \| 'refuse-all'` | `'ignore'` | what a request from a connection that is no proxy gets: its forwarding headers ignored, refused when it carries one, or refused whatever it carries ([below](#refusing-an-untrusted-peer)) |
| `allow` | `string \| string[] \| (request: Request, peer: string \| undefined) => boolean` | none | under `'refuse-all'` alone: what passes from another connection ([below](#only-the-proxies-refuse-all)) |
| `canonical` | `boolean` | `true` | `ctx.ip` in its [one text](#one-text-per-address); `false`, as written |

`originalUrl(ctx)` is a copy of `ctx.url` with the scheme and host the
proxies said: change it freely, the request's URL stays. `ctx.url` itself
is never rewritten, so routing, `ctx.url.pathname` and every package
reading it see the request as it reached the app.

**What is believed.** The scheme and host are read only from a connection
`trusted` names — under ranges or a function, a peer they hold; under a
hop count, every connection, which is why a count is safe only when the
app is reachable through the proxies alone. From any other connection,
both are the request's own, whatever it sends: a client that reaches the
app directly with `X-Forwarded-Proto: https` and `X-Forwarded-Host:
bank.example` gets its own `http://` URL. Among the entries, the one read
is the one the outermost of your proxies wrote, as for the address: with
`X-Forwarded-For`, the entry as many places from the right as there are
proxies (the hop count, or those the ranges found), the leftmost when a
proxy set the header rather than appending to it; with `Forwarded`, the
`proto=` and `host=` of the element whose `for=` is the client. What the
client wrote to the left is never read. Under a hop count, a request whose
address entry is missing or malformed — fewer entries than hops, the sign
it did not come through every proxy — has neither read, as its `ctx.ip` is
the connection's. A `Forwarded` element whose `for=` is an obfuscated
identifier (`_hidden`, `unknown`) counts as no address there: name the
proxies by range to read its `proto=` and `host=`.

**What is valid.** The scheme is `http` or `https`, in any case; the host
is a bare `host[:port]` — a name, an IPv4 address, or an IPv6 address in
brackets, and a port from 1 to 65535. Anything else — `ftp`, a path
(`example.com/x`), userinfo (`user@example.com`), a query, a space, a name
the URL parser would rewrite (`0x7f.1`) — says nothing, and that part of
the request's URL stands. A `Forwarded` value may be quoted
(`host="example.com:8443"`); a parameter given twice in one element says
nothing.

> **Security.** Your outermost proxy must **overwrite**
> `X-Forwarded-Proto` and `X-Forwarded-Host` (or `Forwarded`) with what it
> saw, and the proxies behind it pass them on. Appending is safe only when
> **every** proxy in the chain appends: an outer proxy that appends while
> an inner one passes the list on hands the app the client's own value
> (`evil.example, example.com` reads `evil.example`), and one that passes
> the client's header on unchanged does the same. No reading of the list
> can tell those apart, and `untrusted: 'refuse'` does not help: the
> connection is your proxy's. nginx passes the client's header on unless
> told otherwise: write `proxy_set_header X-Forwarded-Proto $scheme;` and
> `proxy_set_header X-Forwarded-Host $host;` at the edge. A load balancer
> such as AWS's overwrites them. Prefer ranges to a hop count, so a
> connection that bypasses the proxies is never believed.

### Refusing an untrusted peer

With `untrusted: 'refuse'`, a request that carries `Forwarded`,
`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host` or the `header`
given, from a connection the ranges or the function do not name, is
answered 403 — `{ "error": "untrusted_proxy" }`, or a problem under
`errors: 'problem'` — before routing and before any middleware, so nothing
the app runs reads what such a request claims, and a logger does not see
it. A request with none of those headers passes: a load balancer's or an
orchestrator's health probe, which sends none, reaches `/health` and
`/ready` from any address; to refuse those too, see
[`refuse-all`](#only-the-proxies-refuse-all). Refusing needs the proxies
named by address; with a hop count, which cannot tell a proxy,
`trustProxy` throws.

```ts
alxia({ proxy: trustProxy({ trusted: ['10.0.0.0/8'], untrusted: 'refuse' }) });
```

### Only the proxies: `refuse-all`

`'refuse'` lets a request with no forwarding header through from anywhere,
so that probes pass. An app that only its proxies may reach refuses every
other connection, headers or not, with `untrusted: 'refuse-all'`: the same
403, in the app's error format (a problem's `detail` reads `A connection
that is no trusted proxy`), before routing and every middleware. A
connection of unknown address — `app.request`, with no server — is
refused too. As with `'refuse'`, a hop count cannot tell a proxy: with
`trusted` a number, it is a compile error, and `trustProxy` throws.

`allow` is the escape, checked only for a connection `trusted` does not
name: peers by CIDR range or address, or a test of the request and the
peer's address as `ctx.ip` shows it (`undefined` with no server), which
lets the request through when it returns `true` — anything else, a
throw included, refuses it. What it lets through is a direct client: its forwarding headers are not read, and its `ctx.ip` is
the connection's.

```ts
alxia({
	proxy: trustProxy({
		trusted: ['10.0.0.0/8'],
		untrusted: 'refuse-all',
		allow: ['127.0.0.1', '::1'], // a sidecar or a local probe
	}),
});

alxia({
	proxy: trustProxy({
		trusted: ['10.0.0.0/8'],
		untrusted: 'refuse-all',
		// the probes, from whatever node the orchestrator runs them on
		allow: (request) => ['/health', '/ready'].includes(new URL(request.url).pathname),
	}),
});
```

**Keeping the probes working.** A load balancer's own health check comes
from its addresses, which `trusted` already names: it passes. An
orchestrator's probe — Kubernetes' kubelet, a container platform's agent —
comes from the node, which is no proxy: allow the nodes' range (`allow:
['10.1.0.0/16']`), or the probes' paths, as above. Compare the path
exactly, as above: `pathname.startsWith('/health')` lets `/healthz-admin`
through too, while the exact comparison refuses an encoded or
differently cased spelling the router would still serve, which fails
closed. A path predicate lets anyone reach those paths directly, so keep
what they answer to the probes' needs (`health()`'s `details` off).

**Pages are not gated.** Bun serves a [`page()`](static-files.md) itself,
before anything the app runs, so `'refuse-all'` could not refuse it:
`listen` throws when the app has one. Build the pages and serve them with
`static()`, which runs behind the refusal, or keep `untrusted: 'refuse'`.

`trustProxy`'s two forms are overloads: an `untrusted` typed as a union of
modes (`'refuse' | 'refuse-all'`) matches neither, so pick the form where
the options are written, or cast the options to the one you mean.

With no server (`app.request`, `app.fetch` alone), the connection is
unknown and never a proxy: a spec that sends forwarding headers gives
`fetch` a server whose `requestIP` names one, or is refused.

### What reads the original URL

`@alxia/react-router` hands React Router a request at `originalUrl(ctx)`,
so `request.url` in a loader or an action is the public one. In the core,
`redirect(location)` sends the location as given, which a browser resolves
against the URL it asked for: a relative one needs nothing; build an
absolute one from `originalUrl(ctx)`, as for a cookie's `secure` on
`ctx.set.cookies` when it depends on the scheme. Nothing else in the
packages reads the scheme: `secureHeaders` sends `Strict-Transport-Security`
on every response, which a browser ignores over plain HTTP; the cookies
`@alxia/janus` and `@alxia/language` set are `Secure` by default; `apiDocs`'
`servers` come from the document, and its `connect-src 'self'` is resolved
by the browser against the page's own URL.

## The options of `alxia()`

```ts
function alxia<const Prefix extends '' | RoutePath = ''>(options?: AlxiaOptions<Prefix>): Alxia<…>;
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `prefix` | `` `/${string}` `` | `''` | prepended to every route ([Groups and plugins](groups-and-plugins.md#prefixes)) |
| `validateResponses` | `boolean` | `true` | check and strip replies ([Replies](replies.md#validateresponses)) |
| `ip` | function | the connection's | [above](#the-clients-address-ip) |
| `proxy` | `trustProxy(…)` | none | the proxies in front of the app: `ctx.ip`, in place of `ip`, and `originalUrl(ctx)` ([above](#behind-a-proxy-proxy)) |
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
