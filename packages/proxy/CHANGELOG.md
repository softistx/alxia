# @alxia/proxy

## 0.4.3

### Patch Changes

- Updated dependencies [[`71411e2`](https://github.com/softistx/alxia/commit/71411e26dd0d729bf16e10be6f43b1fa6726f6c8), [`3ed7f8e`](https://github.com/softistx/alxia/commit/3ed7f8e7df3dd3e9d97b38e004ee831055ebe163)]:
  - @alxia/core@0.14.0

## 0.4.2

### Patch Changes

- [#210](https://github.com/softistx/alxia/pull/210) [`5d7438a`](https://github.com/softistx/alxia/commit/5d7438afa0909630611d3f0661bd012834760fb6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Document that the client's port, read from a trusted proxy's `X-Forwarded-Port` by core's `originalUrl(ctx)`, is part of the `X-Forwarded-Host` sent upstream.

- [#214](https://github.com/softistx/alxia/pull/214) [`b4195c0`](https://github.com/softistx/alxia/commit/b4195c0518ce2c5c8c68181e5cb3de67890c2ae8) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the roadmap versions the public port sent in `X-Forwarded-Host` as 0.4.2.
- Updated dependencies [[`5d7438a`](https://github.com/softistx/alxia/commit/5d7438afa0909630611d3f0661bd012834760fb6), [`9de1c30`](https://github.com/softistx/alxia/commit/9de1c30e0ba8ab4cb20d38a5f5a14293726e9468), [`b4195c0`](https://github.com/softistx/alxia/commit/b4195c0518ce2c5c8c68181e5cb3de67890c2ae8)]:
  - @alxia/core@0.13.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`4eac9ea`](https://github.com/softistx/alxia/commit/4eac9ea56b3ad3eb50a5cec27128ae3fce7c65ff), [`d462fd7`](https://github.com/softistx/alxia/commit/d462fd7bf5ddf4fd4601a5e146fa267d5df74297)]:
  - @alxia/core@0.12.0

## 0.4.0

### Minor Changes

- [#203](https://github.com/softistx/alxia/pull/203) [`2ed5000`](https://github.com/softistx/alxia/commit/2ed500025b228000c3c187338987c92718dbdfbc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Several upstreams behind one proxy. `proxy()`, `proxy.mount()` and `proxy.ws()` take a list of targets where they took one, each checked as a single target is, and send each request to the next, round-robin. A request goes on to another upstream only when the one it tried provably never received it: a refused connection (`ConnectionRefused`, `ECONNREFUSED`) or a host that does not resolve (`ENOTFOUND`, `EAI_AGAIN`), and, for a request with a body, before the upstream read any of it. A reset, a timeout or any answer is never retried. `retries` caps the upstreams one request tries (the number of upstreams − 1 by default, each tried at most once), and `cooldown` (5 000 ms by default) skips an upstream whose connect failed; when every one is cooling down, the one that failed longest ago is tried rather than none. A socket route retries its connect the same way, before the client's `101`. New types: `ProxyTarget`, `ProxyTargets`.

### Patch Changes

- [#205](https://github.com/softistx/alxia/pull/205) [`5c76dd6`](https://github.com/softistx/alxia/commit/5c76dd6f70bd292955ab445543f78bacebed946e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The roadmap names the release that shipped several upstreams: 0.4.0.

## 0.3.0

### Minor Changes

- [#197](https://github.com/softistx/alxia/pull/197) [`0795c96`](https://github.com/softistx/alxia/commit/0795c966499a5fc5b4b35311a6f65811afc9383d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Send `X-Forwarded-Proto`, `X-Forwarded-Host` and `Forwarded`'s `proto` and `host` from core's `originalUrl(ctx)`: behind `alxia({ proxy: trustProxy(…) })`, the upstream gets the scheme and host the trusted proxy said, so a chain stays truthful. Without `proxy`, nothing changes, and `trustForwarded` keeps its meaning.

- [#201](https://github.com/softistx/alxia/pull/201) [`d3d8306`](https://github.com/softistx/alxia/commit/d3d8306f796d7dd6fdc74484d662142894fa7efa) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `proxy.ws` applies backpressure between its two sockets. A client that stops reading pauses the reads of the upstream socket until Bun's `drain` finds it caught up, so the upstream slows down instead of frames piling up in memory. A new `maxBuffered` option (1 MiB by default) caps the bytes queued for either side, the frames queued before the client's socket opens included: a frame for a side past it, or one Bun dropped, closes both with 1013, exported as `OVERLOADED_CLOSE`, rather than buffer without bound.

### Patch Changes

- [#200](https://github.com/softistx/alxia/pull/200) [`79fbd81`](https://github.com/softistx/alxia/commit/79fbd81a9e1d9e72cbd9d733085fbc8d73d3ed72) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Documents `app.all('/api/*', proxy(url))`, the proxy as one route for every method at its path, with core's new `all`: when to use it rather than `use('/api', proxy(url))`, which shadows the routes declared after it under its path, and what a local path under it answers.

- [#201](https://github.com/softistx/alxia/pull/201) [`d3d8306`](https://github.com/softistx/alxia/commit/d3d8306f796d7dd6fdc74484d662142894fa7efa) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `proxy.ws` no longer loses the frames an upstream sends the moment its socket opens. They could arrive before the relay listened, and were dropped or reordered; they are now held from the upstream's open and relayed first, in order.
- Updated dependencies [[`79fbd81`](https://github.com/softistx/alxia/commit/79fbd81a9e1d9e72cbd9d733085fbc8d73d3ed72), [`c7c994a`](https://github.com/softistx/alxia/commit/c7c994a48eeaa4b069bc81e0eeb73aa7217dd12e)]:
  - @alxia/core@0.11.0

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
