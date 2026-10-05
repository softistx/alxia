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

Core upgrades the client after the route's middlewares, so a guard refuses an
upgrade before any upstream is opened:

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

## What is relayed

- The upstream socket opens when the client's does. Frames the client sends
  before it is open are queued, then sent in order: 1024 at most, past which
  the client is closed with 1013 (try again later).
- Text stays text, binary stays binary.
- A close on either side closes the other with the same code and reason.
  Codes that a socket only reports are mapped: 1005 to 1000, and any code a
  peer may not send (1004, 1006, 1015, 1016 to 2999, outside 1000 to 4999) to 1011.
- On shutdown both sides close with 1001.
- The upstream's request headers are the client's, less hop-by-hop and the client's
  handshake headers, plus the forwarding ones.

## An upstream that cannot be reached

The client is closed with `BAD_GATEWAY_CLOSE` (1014) and the reason `bad gateway`,
whether the connection is refused or the upstream does not complete its
handshake within `timeout` (30 s by default):

```ts
import { BAD_GATEWAY_CLOSE } from '@alxia/proxy';

const ws = new WebSocket('ws://localhost:3000/live/room');
ws.addEventListener('close', (event) => {
	if (event.code === BAD_GATEWAY_CLOSE) console.error('the chat service is down');
});
```

## Limits

- **Subprotocol.** The `Sec-WebSocket-Protocol` the client asked is passed to
  the upstream, but core answers the client's handshake before the upstream
  answers: the subprotocol the upstream picks is not sent back.
- **Backpressure.** None between the two sockets: a fast sender and a slow
  reader buffer in memory.

Both are on the [roadmap](../roadmap.md).
