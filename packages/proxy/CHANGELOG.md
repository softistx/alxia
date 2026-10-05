# @alxia/proxy

## 0.2.2

### Patch Changes

- Updated dependencies [[`3385725`](https://github.com/softistx/alxia/commit/33857253e8a67fc33f39884d58bdd55377ae2915), [`da95f24`](https://github.com/softistx/alxia/commit/da95f24391b942db81c082c253aeeaa5fcade07b)]:
  - @alxia/core@0.10.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`86af86e`](https://github.com/softistx/alxia/commit/86af86e9c73dbc5084a468113de1ec98207cfdf0), [`17d28fe`](https://github.com/softistx/alxia/commit/17d28fe08a73e4c549f04b98411364ff5c6715f5), [`bc2573c`](https://github.com/softistx/alxia/commit/bc2573c7eb045fcfd954fa5457a340abefc32579)]:
  - @alxia/core@0.9.0

## 0.2.0

### Minor Changes

- [#179](https://github.com/softistx/alxia/pull/179) [`d256d6a`](https://github.com/softistx/alxia/commit/d256d6a169bb9a532014814c3aea888fd592c762) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `proxy.ws()` opens the upstream socket before the client is upgraded: the client's `101` names the subprotocol the upstream chose, and an upstream that cannot be reached answers a 502 (a 504 past `timeout`) over HTTP, in the app's error format, instead of a socket closed at once with 1014. A client gone during the connect closes the upstream. `BAD_GATEWAY_CLOSE` is deprecated: nothing sends it any more.

### Patch Changes

- Updated dependencies [[`89aa1df`](https://github.com/softistx/alxia/commit/89aa1df408840165fca6eb189aabedc3fee498ba), [`4a6df2b`](https://github.com/softistx/alxia/commit/4a6df2b1cfc4bf87c4f5b38a856c3157acf1e42f), [`e536262`](https://github.com/softistx/alxia/commit/e5362622a260faa3320bc1cdbd456bae07565953), [`d256d6a`](https://github.com/softistx/alxia/commit/d256d6a169bb9a532014814c3aea888fd592c762), [`9ab4a7f`](https://github.com/softistx/alxia/commit/9ab4a7fd3a62545b15f788e3c6da51ac73de2705)]:
  - @alxia/core@0.8.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`28cdcfe`](https://github.com/softistx/alxia/commit/28cdcfe800ca90cfadacf48662fac0fc99b4f63b)]:
  - @alxia/core@0.7.0

## 0.1.0

### Minor Changes

- [#169](https://github.com/softistx/alxia/pull/169) [`622182c`](https://github.com/softistx/alxia/commit/622182c5f0a56611e70637f7ca94d068e65c1287) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A reverse proxy for alxia, first release. `app.use('/api', proxy('http://users.internal:8080', { rewrite: '/api' }))` forwards every request it runs on to one upstream fixed at declaration — the method, the headers but the hop-by-hop ones, the body and the response streamed both ways with no buffering, the query string kept — behind the app's middlewares declared before it (auth, rate limit, cache, logger, cors). `app.plugin(proxy.mount('/legacy', 'http://old-app:3000'))` forwards everything under a prefix, stripped, with the upstream's `Location` and cookie `Domain` and `Path` rebased under it. `app.ws('/live/*', proxy.ws('ws://chat.internal:8080'))` relays a socket's frames both ways, close codes included. `X-Forwarded-For` is appended to and `X-Forwarded-Proto` and `-Host` set (`xForwarded`, `trustForwarded`), an RFC 7239 `Forwarded` element on request (`forwarded`), `Host` is the upstream's unless `preserveHost`, and `headers.request` and `headers.response` add, remove or compute headers, their callbacks reading the context the middlewares before the proxy typed. An unreachable upstream is a 502, one with no response headers within `timeout` (30 s) a 504, in the app's error format; a client that leaves aborts the upstream request, a shutdown lets it finish within the drain then aborts it, and ends a proxied stream of server-sent events at once. Nothing a request sends — an absolute URL or `//host` in its path or request line, its `Host` — can change the upstream. No dependency.
