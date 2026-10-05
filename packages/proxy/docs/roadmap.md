# Roadmap

What `@alxia/proxy` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/proxy/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

- **Backpressure between the two sockets.** A slow reader on one side slows
  the sender on the other, instead of frames piling up in memory.
- **Several upstreams behind one proxy.** Load balancing over a list of
  targets, and retries of a request that never reached an upstream.
- **HTTP/2 to the upstream.** A proxy that talks HTTP/2 to an upstream that
  offers it.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/proxy` installs nothing beside itself and
  its `@alxia/core` and `typescript` peers: it is built on Bun's `fetch` and
  the web platform's own APIs, so adding it to an app adds no package to
  audit or update.
- **Choosing the upstream per request.** A proxy that takes its target from
  the request, a header, or a callback is a way for a client to make the
  server fetch any address it names (server-side request forgery). The
  target is checked once, when the proxy is declared, and every request is
  checked against it. To reach several upstreams, declare one proxy for
  each.

## Shipped

### Next release

- **The proxy as one route.** `app.all('/api/*', proxy(url))`, with
  `@alxia/core`'s `all`, declares a proxied path as a route the router, the
  route table and `matchesSpec` see, for every method, beside which a local
  route keeps its own methods; the guide compares it with `use('/api', …)`,
  which shadows the routes declared after it
  ([The basics](guide/basics.md#as-one-route-all)).

### 0.2.0

- **The upstream's WebSocket subprotocol answered to the client.** A socket
  route opens the upstream socket before the client is upgraded, offering it
  the client's subprotocols, so the `101` names the one the upstream chose.
  An upstream that cannot be reached answers a 502, and one that has not
  opened within `timeout` a 504, over HTTP in the app's error format,
  instead of an upgrade closed at once with 1014. A client gone during the
  connect closes the upstream.

### 0.1.0

- **A reverse proxy as a middleware.** `proxy(target, { rewrite })` given to
  `app.use(path, …)` sends every method under the path to the upstream and
  never calls `next`; it is also a route middleware. A route declared before
  it stays local.
- **A mounted upstream.** `proxy.mount(prefix, target)` is a plugin that
  strips the prefix, rewrites `Location` and `Set-Cookie` back under it, and
  matches `/legacy` and `/legacy/...` but not `/legacyish`.
- **Streaming, nothing buffered.** Request and response bodies pass chunk by
  chunk, redirects are passed back rather than followed, a compressed body
  passes as it is, and a proxied `text/event-stream` ends cleanly when the
  app shuts down.
- **WebSocket routes.** `proxy.ws(target)` relays a socket route to an
  upstream: text stays text, binary stays binary, frames sent before the
  upstream opens are queued, a close on one side closes the other, and an
  unreachable upstream closes the client with `BAD_GATEWAY_CLOSE` (1014).
- **Forwarding headers.** `X-Forwarded-For`, `-Proto` and `-Host` by default,
  an RFC 7239 `Forwarded` header with `forwarded`, `trustForwarded` behind a
  proxy you trust, and `preserveHost` for virtual hosts. `X-Forwarded-Proto`,
  `-Host` and `Forwarded`'s `proto` and `host` are core's `originalUrl(ctx)`:
  behind `alxia({ proxy: trustProxy(…) })`, what the trusted proxy said. Hop-by-hop headers
  are stripped both ways.
- **Header edits.** `headers.request` and `headers.response` set, remove or
  compute a header, with the typed context of the middlewares before the
  proxy, so a missing `user` is a compile error on `use()`.
- **Failures in the app's format.** An upstream that cannot be reached is a
  502 and one that sends no headers within `timeout` is a 504, as the app's
  error format (or RFC 9457 problems), without naming the upstream.
- **Limits that hold while streaming.** `bodyLimit` counts bytes as the body
  streams and answers 413; a client that leaves aborts the upstream request,
  and a shutdown drains in-flight requests, then aborts what is left.
- **One upstream, fixed.** The target is checked once and every request is
  checked against its origin, so `//host/x`, an absolute-form request line,
  dot segments or a rewrite that returns an absolute URL never reach another
  server.
