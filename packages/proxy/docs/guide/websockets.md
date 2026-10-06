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
`headers.request` is left, as there is no response to edit. It adds one of
its own, `maxBuffered`: see [Backpressure](#backpressure).

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

A client that goes away while the upstream is connecting, or before its
own socket opens, closes the upstream (with 1001 once it is open), and no
socket opens. Should the upgrade fail with the client still there, the
upstream is closed with 1001 past `timeout`.

## What is relayed

- Text stays text, binary stays binary.
- What the upstream sends between its open and the client's is queued, then
  sent in order: 1024 frames and `maxBuffered` bytes at most, past which the
  upstream is closed with 1013 (try again later), reason `client not open
  yet`, and so is the client as it opens.
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

Given a list, `proxy.ws()` takes the upstreams in turn, and while the
connect itself fails — refused, or a host that does not resolve — it tries
the next one, before the client is upgraded. An upstream that answered its
handshake with anything but a `101`, or did not open within `timeout`, was
reached, and is the 502 or the 504 at once. See
[Several upstreams](upstreams.md#retries-only-a-request-no-upstream-received).

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia().ws('/live', proxy.ws(['ws://chat-1.internal:8080', 'ws://chat-2.internal:8080']));
```

`BAD_GATEWAY_CLOSE` (1014), the close code an unreachable upstream used to
get, is deprecated: nothing sends it any more.

## Backpressure

A slow reader on one side never makes the proxy hold an unbounded amount of
what the other side sends. Each direction is bounded by `maxBuffered`, 1 MiB
by default:

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia().ws('/live', proxy.ws('ws://chat.internal:8080', { maxBuffered: 256 * 1024 }));
```

```ts
// In the browser: 1013 (OVERLOADED_CLOSE on the server) says try again later.
const socket = new WebSocket('ws://localhost:3000/live');
socket.addEventListener('close', (event) => {
	if (event.code === 1013) setTimeout(reconnect, 1_000);
});
declare function reconnect(): void;
```

- **Upstream to client.** When Bun answers a frame sent to the client with
  -1 — queued behind what the client has not read — the proxy pauses its
  reads of the upstream socket, so the upstream sees TCP backpressure and
  its own `send` slows down. When the client's socket drains back under half
  of `maxBuffered`, reading resumes. Frames Bun had already read still pass,
  in order.
- **Client to upstream.** Bun's server socket cannot pause its reads, so
  what the client sends is queued on the upstream socket (its
  `bufferedAmount`) while the upstream is slow.
- **Past the cap.** A frame for a side whose queue already holds more than
  `maxBuffered` bytes, or a frame Bun dropped (past its own
  `backpressureLimit`, 16 MiB by default), closes both sides with 1013,
  `OVERLOADED_CLOSE`, reason `client too slow` or `upstream too slow`,
  rather than queue it. The slow side reads nothing, so it may never take
  the close frame queued behind the rest: one second later its connection
  is cut, and what Bun buffered for it is freed.

What one relay may hold is about the cap plus one frame per direction (a
frame is at most Bun's `maxPayloadLength`, 16 MiB by default), plus the
kernel's socket buffers. This bounds each connection, not their number:
limit how many sockets a client may open — a guard or a rate limit before
`proxy.ws` — to bound the total.

1013 rather than 1009: 1009 says a message is too big, whatever the
reader's pace; 1013 says the peer is overloaded and the client may come back
later. Keep `maxBuffered` above your largest frame: a queue already past it
when the next frame arrives closes, even for a reader that would have caught
up. It must be a whole number of bytes above 0, or `proxy.ws()` throws a
`TypeError` at declaration.
