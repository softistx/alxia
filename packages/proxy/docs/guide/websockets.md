# WebSockets

This page covers `proxy.ws`: the handlers of a `ws()` route relayed to an
upstream WebSocket, with what is passed, queued and closed.

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia().ws('/live/*', proxy.ws('ws://chat.internal:8080', { rewrite: '/live' }));
```

```ts no-check
function ws<Ctx>(target: string | URL, options?: SocketProxyOptions<Ctx>): SocketProxy<Ctx>;
```

The target is `ws:`, `wss:`, `http:` or `https:` (`http` becomes `ws`, `https`
becomes `wss`), checked once; a bad one throws a `TypeError`. The options are
those of `proxy()` except `rebase`, `bodyLimit` and `headers.response`: only
`headers.request` is left, as there is no response to edit.

## Behind your middlewares

The route's middlewares run first, so a guard refuses an upgrade before any
upstream is opened:

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia().ws(
	'/live/*',
	async (ctx, next) =>
		ctx.request.headers.get('x-key') === 'k' ? next() : ctx.reply(401, 'no key'),
	proxy.ws('ws://chat.internal:8080', {
		rewrite: '/live',
		headers: { request: { 'x-from': 'gateway' } },
	}),
);
```

## The upstream first, then the `101`

Once the middlewares let the upgrade through, `proxy.ws` opens the upstream
socket — in core's `upgrade` handler — and the client is upgraded only when
it is open:

1. The upstream is offered the subprotocols the client offered
   (`Sec-WebSocket-Protocol`), with the client's request headers, less
   hop-by-hop and the client's handshake headers, plus the forwarding ones.
2. The proxy waits for it to open, `timeout` at most (30 s by default).
3. The client's `101` names the subprotocol the upstream chose, or none when
   it chose none.

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia().ws('/graphql', proxy.ws('ws://graphql.internal:4000'));

// In the browser:
const socket = new WebSocket('ws://localhost:3000/graphql', ['graphql-transport-ws']);
socket.addEventListener('open', () => {
	console.log(socket.protocol); // 'graphql-transport-ws', when the upstream chose it
});
```

A client that goes away while the upstream is connecting closes the
upstream, and no socket opens.

## What is relayed

- Text stays text, binary stays binary.
- What the upstream sends between its open and the client's is queued, then
  sent in order: 1024 frames at most, past which the upstream is closed with
  1013 (try again later), and so is the client as it opens.
- A close on either side closes the other with the same code and reason.
  Codes that a socket only reports are mapped: 1005 to 1000, and any code a
  peer may not send (1004, 1006, 1015, 1016 to 2999, outside 1000 to 4999) to 1011.
- On shutdown both sides close with 1001.

## An upstream that cannot be reached

The upgrade request is answered over HTTP, as `proxy()` answers a request,
in the app's error format, and the client is never upgraded:

| Upstream | Status | Body |
| --- | --- | --- |
| refuses the connection, or answers its handshake with anything but a `101` | 502 | `{ "error": "bad_gateway" }` |
| has not opened within `timeout` | 504 | `{ "error": "gateway_timeout" }` |

A browser's `WebSocket` sees a failed handshake: an `error` event, then a
`close` with 1006, and no `open`. A middleware before the proxy that awaits
`next()` sees the `HttpError` rejected, as on a route, so a logger records
the 502.

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia({ errors: 'problem' }).ws('/live', proxy.ws('ws://chat.internal:8080', { timeout: 5_000 }));
// down: 502 application/problem+json; no 101 within 5 s: 504
```

`BAD_GATEWAY_CLOSE` (1014), the close code an unreachable upstream used to
get, is deprecated: nothing sends it any more.

## Limits

- **Backpressure.** None between the two sockets: a fast sender and a slow
  reader buffer in memory.

It is on the [roadmap](../roadmap.md).
