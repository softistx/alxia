# Troubleshooting

Each entry is headed by the text you see: an exception at startup, a
TypeScript error, or a response body. Entries that print nothing are under
[Traps](#traps), by symptom.

**Declaration** (thrown when the app is built, before it listens)

- [`proxy(): the target must be an absolute URL, http:// or https://; got "…"`](#proxy-the-target-must-be-an-absolute-url-http-or-https-got-)
- [`proxy.ws(): the target must be an absolute URL, ws://, wss://, http:// or https://; got "…"`](#proxyws-the-target-must-be-an-absolute-url-ws-wss-http-or-https-got-)
- [`proxy(): the target "…" carries a query, a fragment or credentials`](#proxy-the-target--carries-a-query-a-fragment-or-credentials)
- [`proxy(): rewrite must be a path that starts with "/" and does not end with one`](#proxy-rewrite-must-be-a-path-that-starts-with--and-does-not-end-with-one)
- [`proxy(): timeout must be a number of milliseconds above 0`](#proxy-timeout-must-be-a-number-of-milliseconds-above-0)
- [`proxy(): bodyLimit must be a whole number of bytes, 0 or more`](#proxy-bodylimit-must-be-a-whole-number-of-bytes-0-or-more)
- [`proxy.ws(): maxBuffered must be a whole number of bytes above 0`](#proxyws-maxbuffered-must-be-a-whole-number-of-bytes-above-0)
- [`proxy(): give one upstream URL, or a list of at least one; got an empty list`](#proxy-give-one-upstream-url-or-a-list-of-at-least-one-got-an-empty-list)
- [`proxy(): retries must be at most the number of upstreams − 1 (…), each tried once per request`](#proxy-retries-must-be-at-most-the-number-of-upstreams--1--each-tried-once-per-request)
- [`proxy(): retries must be a whole number, 0 or more` (or `cooldown`)](#proxy-retries-must-be-a-whole-number-0-or-more-or-cooldown)
- [`proxy.mount(): the prefix must start with "/" and not end with one`](#proxymount-the-prefix-must-start-with--and-not-end-with-one)
- [`use(): argument 1 looks like a factory (proxy): call it, use(proxy())`](#use-argument-1-looks-like-a-factory-proxy-call-it-useproxy)
- [`plugin(): argument 1 looks like a factory (mount): call it, plugin(mount())`](#plugin-argument-1-looks-like-a-factory-mount-call-it-pluginmount)

**Types**

- [`the plugin reads "user", which this app's context does not give`](#the-plugin-reads-user-which-this-apps-context-does-not-give)
- [`` `user` is missing from the context: add a middleware that gives it before this one ``](#user-is-missing-from-the-context-add-a-middleware-that-gives-it-before-this-one)

**Runtime**

- [`502 {"error":"bad_gateway"}`](#502-errorbad_gateway)
- [`504 {"error":"gateway_timeout"}`](#504-errorgateway_timeout)
- [`400 {"error":"bad_request"}` from a proxied path](#400-errorbad_request-from-a-proxied-path)
- [`413 {"error":"content_too_large"}`](#413-errorcontent_too_large)

**WebSockets**

- [A socket route answers `502 {"error":"bad_gateway"}` or `504 {"error":"gateway_timeout"}`](#a-socket-route-answers-502-errorbad_gateway-or-504-errorgateway_timeout)
- [A proxied socket closes with `1013` and `client too slow`, `upstream too slow` or `client not open yet`](#a-proxied-socket-closes-with-1013-and-client-too-slow-upstream-too-slow-or-client-not-open-yet)

**Traps**

- [A route declared after the proxy is never reached](#a-route-declared-after-the-proxy-is-never-reached)
- [A 413 that is not in the app's format, before the proxy runs](#a-413-that-is-not-in-the-apps-format-before-the-proxy-runs)
- [A 504 though the upstream answers](#a-504-though-the-upstream-answers)
- [A request one upstream failed is not retried on another](#a-request-one-upstream-failed-is-not-retried-on-another)
- [A restarted upstream gets no request for a few seconds](#a-restarted-upstream-gets-no-request-for-a-few-seconds)
- [The upstream sees its own `Host`, not the client's](#the-upstream-sees-its-own-host-not-the-clients)
- [A redirect sends the browser to the upstream's address](#a-redirect-sends-the-browser-to-the-upstreams-address)
- [A cookie the upstream sets is never sent back](#a-cookie-the-upstream-sets-is-never-sent-back)
- [The upstream sees the client's address as `127.0.0.1`](#the-upstream-sees-the-clients-address-as-127001)
- [A proxied route is missing from `matchesSpec`](#a-proxied-route-is-missing-from-matchesspec)

## Declaration

The proxy checks its arguments once, when you call `proxy()`, `proxy.ws()` or
`proxy.mount()`, so a wrong one stops the app at startup rather than
answering every request with a 500. The messages begin with the call that
threw: `proxy()`, `proxy.ws()` or `proxy.mount()`.

### `proxy(): the target must be an absolute URL, http:// or https://; got "…"`

**When:** calling `proxy()` or `proxy.mount()` with a relative path, a host
with no scheme, or a scheme other than `http:` and `https:`.
**Why:** the upstream is fixed at declaration and must say where it is.
**Fix:**

```ts
import { proxy } from '@alxia/proxy';

proxy('http://api.internal:3000');
```

### `proxy.ws(): the target must be an absolute URL, ws://, wss://, http:// or https://; got "…"`

**When:** calling `proxy.ws()` with a target of any other scheme.
**Why:** a socket target is `ws:` or `wss:`; `http:` and `https:` are
accepted and become `ws:` and `wss:`.
**Fix:**

```ts
proxy.ws('ws://chat.internal:8080', { rewrite: '/live' });
```

### `proxy(): the target "…" carries a query, a fragment or credentials`

**When:** the target is `http://user:pass@host/`, `http://host/?key=1` or has a
`#fragment`.
**Why:** the target is an origin and a path only. A query would be
overwritten by each request's own, and credentials in a URL leak into logs.
**Fix:** give credentials as a request header, set by the proxy:

```ts
proxy('http://api.internal:3000', {
	headers: { request: { authorization: `Bearer ${process.env.UPSTREAM_TOKEN}` } },
});
```

See [Security](guide/security.md).

### `proxy(): rewrite must be a path that starts with "/" and does not end with one`

**When:** `rewrite: 'api'` or `rewrite: '/api/'`. The same message names
`rebase` when that option is the string.
**Why:** a prefix is stripped from the path as written, so it has to match
the way a path is spelled.
**Fix:**

```ts
proxy('http://api.internal:3000', { rewrite: '/api', rebase: '/api' });
```

### `proxy(): timeout must be a number of milliseconds above 0`

**When:** `timeout: 0`, a negative number, `NaN` or `Infinity`.
**Why:** the timeout always applies; there is no way to switch it off. It
counts until the upstream's response headers arrive, not the whole body.
**Fix:** give a large number to wait long:

```ts
proxy('http://reports.internal', { timeout: 120_000 });
```

### `proxy(): bodyLimit must be a whole number of bytes, 0 or more`

**When:** `bodyLimit: 1.5`, a negative number, or a string like `'10mb'`.
**Why:** the limit is a count of bytes.
**Fix:**

```ts
proxy('http://api.internal:3000', { bodyLimit: 10 * 1024 * 1024 });
```

### `proxy.ws(): maxBuffered must be a whole number of bytes above 0`

**When:** `maxBuffered: 0`, a fraction, a negative number, or a string like
`'1mb'`.
**Why:** the cap is a count of bytes queued for one side, and a socket with
no room for a single byte could relay nothing.
**Fix:**

```ts
proxy.ws('ws://chat.internal:8080', { maxBuffered: 2 * 1024 * 1024 });
```

### `proxy(): give one upstream URL, or a list of at least one; got an empty list`

**When:** `proxy([])`, `proxy.mount(prefix, [])` or `proxy.ws([])` (the
message starts with the call's own name, `proxy.ws():` for a socket route): a list
of targets that is empty, often one read from configuration that was not set.
**Why:** a proxy needs an upstream to forward to.
**Fix:** check the list where it is built, before the proxy is declared:

```ts
const upstreams = (process.env.USERS_UPSTREAMS ?? '').split(',').filter(Boolean);
if (upstreams.length === 0) throw new Error('USERS_UPSTREAMS is not set');
app.use('/api', proxy(upstreams, { rewrite: '/api' }));
```

### `proxy(): retries must be at most the number of upstreams − 1 (…), each tried once per request`

**When:** `retries` above the number of upstreams − 1: `retries: 1` with a
single target, or `retries: 3` with three, given to `proxy()`,
`proxy.mount()` or `proxy.ws()` (whose name starts the message).
**Why:** a request tries each upstream at most once. Trying again one that
just refused the connection only delays the 502.
**Fix:** leave `retries` out (each upstream is tried once), or lower it:

```ts
proxy(['http://a.internal', 'http://b.internal', 'http://c.internal'], { retries: 2 });
```

### `proxy(): retries must be a whole number, 0 or more` (or `cooldown`)

**When:** `retries` or `cooldown`, given to `proxy()`, `proxy.mount()` or
`proxy.ws()` (whose name starts the message), is negative, a fraction,
`NaN`, or a string like `'5s'`.
**Why:** `retries` counts upstreams, `cooldown` milliseconds.
**Fix:**

```ts
proxy(['http://a.internal', 'http://b.internal'], { retries: 1, cooldown: 10_000 });
```

### `proxy.mount(): the prefix must start with "/" and not end with one`

**When:** `proxy.mount('/', …)` or `proxy.mount('/legacy/', …)`.
**Why:** the prefix is what is stripped and what `rebase` puts back; `/`
would mount the whole app, which `app.use(proxy(url))` already does.
**Fix:**

```ts
app.plugin(proxy.mount('/legacy', 'http://old-app:3000'));
```

See [Mounting](guide/mounting.md).

### `use(): argument 1 looks like a factory (proxy): call it, use(proxy())`

**When:** `app.use(proxy)` (or `app.use('/api', proxy)`).
**Why:** `proxy` makes the middleware; it is not one. Core catches it at
declaration.
**Fix:**

```ts
app.use('/api', proxy('http://api.internal:3000', { rewrite: '/api' }));
```

### `plugin(): argument 1 looks like a factory (mount): call it, plugin(mount())`

**When:** `app.plugin(proxy.mount)`.
**Why:** the same mistake, one level down: `proxy.mount` makes the plugin.
**Fix:**

```ts
app.plugin(proxy.mount('/legacy', 'http://old-app:3000'));
```

## Types

### `the plugin reads "user", which this app's context does not give`

The full text is `the plugin reads "user", which this app's context does not
give: add the plugin or middleware that gives it first`.

**When:** `app.plugin(proxy.mount(…))` where a header callback reads `ctx.user`,
and no earlier plugin or middleware of the app sets it.
**Why:** `mount()` returns a plugin that requires the context its callbacks
read, and `plugin()` checks it.
**Fix:** put what gives `user` first:

```ts
import { alxia } from '@alxia/core';
import { bearer, createJwt, type JwtClaims } from '@alxia/jwt';
import { proxy } from '@alxia/proxy';

const jwt = createJwt({ secret: process.env.JWT_SECRET ?? '' });

alxia()
	.use(bearer({ jwt }))
	.plugin(
		proxy.mount('/legacy', 'http://old-app:3000', {
			headers: {
				request: { 'x-user-id': (ctx: { user: JwtClaims }) => ctx.user.sub },
			},
		}),
	);
```

### `` `user` is missing from the context: add a middleware that gives it before this one ``

**When:** `app.use(proxy(…))` whose callback reads `user`, with nothing
earlier giving it. TypeScript shows it as
``Type 'Promise<Response>' is not assignable to type '"`user` is missing from the context: add a middleware that gives it before this one"'``.
**Why:** the context is inferred from the annotated parameter of your
callback; `use()` compares it with what is in force.
**Fix:** declare the middleware that gives it before the `use`, as above. If
the callback does not need `user`, remove the annotation.

On `app.all('/api/*', proxy(…))`, the same proxy is reported as
``Property 'user' is missing in type 'MiddlewareBase<Empty, "/api/*">' but
required in type '{ user: … }'``, on the overload whose `end` is a
middleware: the fix is the same, a `use` that gives it declared before the
route.

## Runtime

### `502 {"error":"bad_gateway"}`

**When:** the upstream refused the connection, reset it, or could not be
resolved, before sending response headers.
**Why:** the proxy answers for the upstream. The body never names it; the
cause is in the log, as `proxy: <origin> failed: <code>`, for example
`ConnectionRefused`. Under `alxia({ errors: 'problem' })` the body is a
problem with the title `Bad Gateway` and the detail `The upstream server
could not be reached`.
**Fix:** read the log line, check that the target is reachable from the app
and not `localhost` inside a container. An upstream that dies after its
headers cannot change the status: the client's connection is cut instead.
With several upstreams, the 502 is the last one tried: every one refused
the connection or did not resolve, or the one tried reset it, which is never
retried. See [Failures](guide/failures.md) and
[Several upstreams](guide/upstreams.md).

### `504 {"error":"gateway_timeout"}`

**When:** the exchange stayed silent for `timeout` (30 000 ms by default)
before the upstream's response headers: no headers, and no request body chunk
sent meanwhile. The log line is `proxy: <origin> sent no response within <n> ms`.
**Why:** the upstream is slow to the first byte, holds its headers until it
has a first body chunk, or the client paused its upload that long.
**Fix:** raise it for that upstream, or answer earlier from it:

```ts
app.use('/reports', proxy('http://reports.internal', { rewrite: '/reports', timeout: 120_000 }));
```

### `400 {"error":"bad_request"}` from a proxied path

**When:** a `rewrite` function returns a path that climbs out of the
target's path with `..`. The log line is `proxy: the path "…" rewrites
outside the target's path "…"`; under `errors: 'problem'` the detail is
`The request path leaves the upstream path`.
**Why:** the proxy sets the result as a path under the target and refuses
one that leaves it. It is the check that keeps the upstream fixed.
**Fix:** return a path under the target:

```ts
proxy('http://api.internal:3000/v2', {
	rewrite: (path) => path.replace(/^\/api/, ''),
});
```

See [Security](guide/security.md).

### `413 {"error":"content_too_large"}`

**When:** a request body is over `bodyLimit`: a declared `Content-Length` is
refused before a byte is read, a streamed body once the count passes.
**Why:** the limit is the proxy's own, or the route's when the proxy is that
route's middleware.
**Fix:** raise it where it is set:

```ts
proxy('http://files.internal', { bodyLimit: 50 * 1024 * 1024 });
```

## WebSockets

### A socket route answers `502 {"error":"bad_gateway"}` or `504 {"error":"gateway_timeout"}`

**When:** a client's upgrade to a `proxy.ws()` route fails: a browser's
`WebSocket` gets `error`, then `close` with 1006, and never `open`; the
server's log or a logger before the proxy shows the 502 or the 504.
**Why:** `proxy.ws()` opens the upstream socket before it upgrades the
client. A 502 is an upstream that refused the connection (every one of
them, given a list) or answered its handshake with anything but a `101`; a 504, one that had not opened within
`timeout` (30 s by default). Before `@alxia/proxy` 0.2.0, the client was
upgraded first and closed at once with `BAD_GATEWAY_CLOSE` (1014): that
code is no longer sent.
**Fix:** check the target is reachable and speaks WebSocket at the path
`rewrite` gives; for a slow upstream, raise `timeout`:

```ts
import { proxy } from '@alxia/proxy';

proxy.ws('ws://chat.internal:8080', { rewrite: '/live', timeout: 60_000 });
```

See [WebSockets](guide/websockets.md#an-upstream-that-cannot-be-reached).

### A proxied socket closes with `1013` and `client too slow`, `upstream too slow` or `client not open yet`

**When:** a socket relayed by `proxy.ws()` closes on both sides with 1013
(`OVERLOADED_CLOSE`, try again later), while one side was sending faster
than the other read: `client too slow` when the upstream outpaced the
client, `upstream too slow` the other way, `client not open yet` when the
upstream sent more than 1024 frames or `maxBuffered` bytes before the
client's socket opened.
**Why:** more than `maxBuffered` bytes (1 MiB by default) were queued for
the slow side when another frame for it arrived. The proxy closes rather
than buffer without bound, so a reader that never reads holds no more than
the cap per direction, and its connection is cut one second after the
close. Toward the client, the upstream's reads are paused first, so this
mostly happens with frames close to the cap, or toward an upstream, whose
client the proxy cannot pause.
**Fix:** reconnect after a delay on 1013; if your frames are large or your
peers bursty, raise `maxBuffered` above your largest frame:

```ts
import { proxy } from '@alxia/proxy';

proxy.ws('ws://chat.internal:8080', { maxBuffered: 8 * 1024 * 1024 });
```

See [Backpressure](guide/websockets.md#backpressure).

## Traps

### A route declared after the proxy is never reached

**Why:** the proxy answers and never calls `next`, so a route declared under
the same path after `app.use('/api', proxy(…))` is shadowed. This holds for a
route middleware too: in `app.post('/upload', proxy(url), handler)` the
handler is not reached.
**Fix:** declare local routes first, or declare the proxy as one route,
which shadows nothing:

```ts
app.get('/api/health', ({ reply }) => reply(200, { ok: true }));
app.use('/api', proxy('http://api.internal:3000', { rewrite: '/api' }));

// or, with core 0.11 or later
app
	.all('/api/*', proxy('http://api.internal:3000', { rewrite: '/api' }))
	.get('/api/health', ({ reply }) => reply(200, { ok: true }));
```

See [Basics](guide/basics.md#as-one-route-all).

### A method on a local path under `all('/api/*', proxy(…))` answers 405

**Why:** `app.all('/api/*', proxy(url))` beside `app.get('/api/health', …)`:
the router picks the path first, and `/api/health`, a path of its own, has
no `POST`, so `POST /api/health` is a 405 that allows `GET`, never the
proxy. A `use('/api', proxy(…))` would have forwarded it.
**Fix:** give that path an `all` of its own, or use `use`:

```ts
app
	.all('/api/*', proxy(url))
	.get('/api/health', ({ reply }) => reply(200, { ok: true }))
	.all('/api/health', proxy(url)); // POST /api/health → the upstream
```

### A 413 that is not in the app's format, before the proxy runs

**Why:** Bun's `maxRequestBodySize` (128 MiB by default) applies before
anything. An app-level `bodyLimit()` applies to routes only, not to requests
that no route matches, which is what `use('/api', proxy())` receives.
**Fix:**

```ts
app.use('/api', proxy(url, { rewrite: '/api', bodyLimit: 5 * 1024 * 1024 }));
app.listen({ port: 3000, maxRequestBodySize: 256 * 1024 * 1024 });
```

### A 504 though the upstream answers

**Why:** the timeout counts silence until the response headers arrive, again
from each request body chunk sent. An upstream
that sends its headers with its first body chunk, or is slow to the first
byte, is cut. A slow body after the headers is not (server-sent events
pass).
**Fix:** raise `timeout`, or send the headers early from the upstream.

### A request one upstream failed is not retried on another

**Why:** with several upstreams, a request goes on to the next one only when
the first provably never received it: a refused connection
(`ConnectionRefused`) or a host that does not resolve (`ENOTFOUND`,
`EAI_AGAIN`), and, for a request with a body, before the upstream read any of
it. A reset, a timeout (a 504) or an answer of any status — a `503` from an
upstream shedding load included — may follow a request the upstream ran, so
sending it again could run it twice. `retries: 0`, or a single target, never
retries.
**Fix:** none in the proxy, by design. For an idempotent request a client may
retry itself; an upstream that sheds load should close its listener, so its
connects are refused, rather than answer 503. See
[Several upstreams](guide/upstreams.md#retries-only-a-request-no-upstream-received).

### A restarted upstream gets no request for a few seconds

**Why:** an upstream whose connect failed is skipped for `cooldown` ms (5 000
by default), so the requests that follow do not each pay a refused connect.
It is in the rotation again once the cooldown has passed.
**Fix:** shorten it, or turn it off:

```ts
proxy(['http://a.internal', 'http://b.internal'], { cooldown: 1_000 }); // or cooldown: 0
```

### The upstream's `X-Forwarded-Proto` is `http` behind a TLS proxy

**Why:** the headers are `originalUrl(ctx)`'s, which is the request as the app received it until the app declares its proxies; a forged header from a connection that is not a trusted proxy is never believed.
**Fix:** declare them, and the upstream gets the scheme and host the outermost proxy said:

```ts
const app = alxia({ proxy: trustProxy({ trusted: ['10.0.0.0/8'] }) }).use(
	'/api',
	proxy('http://10.0.0.5:3000'),
);
```

### The upstream sees its own `Host`, not the client's

**Why:** by default `Host` is the upstream's, and the client's is in
`X-Forwarded-Host`.
**Fix:** for a virtual-host upstream:

```ts
proxy('http://10.0.0.5:3000', { preserveHost: true });
```

### A redirect sends the browser to the upstream's address

**Why:** the upstream's `Location` names itself.
**Fix:** `rebase` moves it under the public prefix:

```ts
proxy('http://api.internal:3000', { rewrite: '/api', rebase: true });
```

`proxy.mount()` does it by default. See [Mounting](guide/mounting.md).

### A cookie the upstream sets is never sent back

**Why:** its `Domain` is the upstream's host, or its `Path` is under the
target's path, so the browser does not return it to the public host.
**Fix:** `rebase: true` drops a `Domain` equal to the upstream's hostname and
moves the `Path` under the prefix. See [Headers](guide/headers.md).

### The upstream sees the client's address as `127.0.0.1`

**Why:** the upstream's peer is the proxy. The client's address is appended
to `X-Forwarded-For`, and what the client wrote stays to its left.
**Fix:** read the header from the right. On an alxia upstream:

```ts
import { alxia, forwardedIp } from '@alxia/core';

const app = alxia({ ip: forwardedIp({ trusted: 1 }) });
```

### A proxied route is missing from `matchesSpec`

**Why:** `proxy()` given to `use()` and `proxy.mount()` declare no route, and
`@alxia/openapi`'s `matchesSpec` ignores routes that are not in the spec by
default. `all('/api/*', proxy(url))` is a route, reported in `extra` as
`ALL /api/*`; it serves no operation.
**Fix:** none needed; pass `strict: true` to `matchesSpec` to have them
reported, and `exclude: (route) => route.method === 'ALL'` to leave an `all`
route out of it.
