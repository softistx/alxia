# WebSockets

This page covers socket routes: the upgrade request run through the route's
middlewares and validated like a route's, and each message checked both
ways.

```ts
import { alxia, defineMiddleware } from '@alxia/core';
import { z } from 'zod';

const Chat = z.object({ text: z.string().min(1) });
const Said = z.object({ from: z.string(), text: z.string() });

const who = defineMiddleware(({ url }, next) => next({ user: url.searchParams.get('user') ?? 'anonymous' }));

const app = alxia().ws('/rooms/:room', { message: Chat, send: Said }, who, {
	open(socket) {
		socket.subscribe(socket.data.params.room);
	},
	async message(socket, chat) {
		const said = { from: socket.data.user, text: chat.text };
		await socket.send(said);                               // to this socket
		await socket.publish(socket.data.params.room, said);   // to the others in the room
	},
});

app.listen(3000);
```

Sockets need **a server**: `listen`, or a `Bun.serve` of your own given
`fetch` and [`websocket`](serving.md#websocket). Through `app.fetch` alone
— `app.request`, a test without a server — a socket route answers
`426 upgrade_required`.

## `ws(path, options?, ...middlewares, handlers)`

```ts
ws(path, handlers);
ws(path, ...middlewares, handlers);           // up to 8, run on the upgrade request
ws(path, options, ...middlewares, handlers);  // options: message, send, detail
```

The last argument is the handlers. Before them, the middlewares the upgrade
request runs, in the order given: plain `(ctx, next)` functions written
inline, shared ones typed with `defineMiddleware`, or a `validate` that
checks the upgrade request
([Middleware](middleware.md#a-routes-middlewares)). An object right after
the path is the socket's options:

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `message` | any Standard Schema | none: the raw message | each message the client sends, parsed as JSON; a refused one is answered on the socket with a `ValidationErrorBody`, the socket kept open and the handler not called |
| `send` | any Standard Schema | none: anything is sent | each message the server sends: checked, then sent as its output. A refused one is not sent: `send` rejects with a `ResponseValidationError`, which, in a handler, closes the socket with `1011` |
| `detail` | `RouteDetail` | none | nothing at runtime: `summary`, `operationId`, `tags`…, on the socket's definition |

```ts no-check
interface SocketOptions {
	readonly message?: StandardSchemaV1;
	readonly send?: StandardSchemaV1;
	readonly detail?: RouteDetail;
}

// SocketForms and SocketOptionsForms: one overload per count of middlewares, 0 to 8. With one:
<const Path extends RoutePath, const Options extends SocketOptions, R1 extends MiddlewareReturn>(
	path: Path, // a literal the app would refuse does not compile: `Invalid path: …`
	options: Options, // no schema of the request: that is validate(…)
	m1: (ctx: /* the middlewares' context, and the upgrade request as it arrived */, next: NextFunction) => R1,
	handlers: SocketHandlers</* socket.data: the context after m1 */, SocketSend<Options>, SocketMessage<Options>>,
): Alxia</* … the app, unchanged in type */>;
```

The options hold no schema of the request — `params`, `query`, `headers`,
`cookies`: give them to a `validate` among the middlewares.

| Middleware | On the upgrade |
| --- | --- |
| `validate({ params, query, headers, cookies })` | checks the upgrade request as a route's: a refused one throws a `ValidationError`, answered with the 400 with every issue, or by a middleware before the `validate` that catches it ([Routes](routes.md#refusals-in-your-own-format)), and no socket. A `params` key the path lacks, optional or not, does not compile, as on a route |
| a middleware returning `next(added)` | `added` is in `socket.data`, typed |
| a middleware returning a reply or a `Response` | the upgrade is refused with it: an unauthenticated client never gets a socket |
| a middleware that awaits `next()` | receives a stand-in response once the socket is open; what it returns after is ignored ([below](#the-upgrade)) |
| `responds(…)` | refused: a socket sends no reply. `send` checks its messages |

`responds` on a socket does not compile, and throws where the socket is
declared:
`` WS /x: responds() checks replies, and a socket route sends none: check its messages with the `send` option ``.
A schema of the request in the options throws too —
`WS /live: the options hold no schema (query): give validate(…) and responds(…) among the middlewares` —
and a list of middlewares after the path, `ws('/live', [auth], handlers)`,
throws `WS /live: a route takes its middlewares after the path, not in a list: drop the brackets`
([Upgrading](../upgrading.md#050)).

## The upgrade

The upgrade request runs the `use` middlewares, `decorate`s and `derive`s
declared before the socket, then its own middlewares, in order, `validate`
where it stands, then opens. A middleware or a `derive` that replies 401 refuses the
socket with that 401; a `validate` placed after it is never reached.

```ts
import { alxia, defineMiddleware, validate } from '@alxia/core';
import { z } from 'zod';

const auth = defineMiddleware(({ url, reply }, next) =>
	url.searchParams.get('token') === 'secret'
		? next({ user: 'ada' })
		: reply(401, { error: 'unauthenticated' as const }),
);

const app = alxia().ws('/live', auth, validate({ query: z.object({ channel: z.string() }) }), {
	open: (socket) => socket.subscribe(socket.data.query.channel), // socket.data.user: 'ada'
	message: () => {},
});
// no token → 401; a token and no channel → 400; both → the socket opens
```

A middleware that awaits `next()` runs around the rest of the upgrade. When
the request is refused after it — a `validate`'s 400 — `next()` rejects with
the `ValidationError`, as on a route; a reply a later middleware returns
resolves it. When the socket opens, there is no response: `next()`
resolves to a **stand-in**, an empty `200`. The socket is open by then:
what the middleware returns after it is ignored,
and what it throws is logged with `console.error`, the socket kept open.
So a middleware of `use` that wraps every response —
`new Response(response.body, { headers })` — leaves the socket routes after
it as they are. A header set on the stand-in is lost: set it with
`set.headers`, sent with the `101`.

```ts
const watched = defineMiddleware(async ({ route }, next) => {
	const response = await next();
	console.log(route, response.status); // a reply's status for a refused upgrade, 200 once the socket is open
	return response;                     // ignored once the socket is open
});
```

- `set.headers` and `set.cookies` a middleware sets are sent with the `101`.

### Before the `101`: `upgrade`

A socket that needs something before it opens — a connection of its own,
whose answer the `101` carries — does it in its `upgrade` handler. It runs
after every middleware has let the upgrade through, and the upgrade waits
for it:

```ts
import { alxia, HttpError } from '@alxia/core';

const app = alxia().ws('/feed', {
	async upgrade(data, headers) {
		const offered = data.request.headers.get('sec-websocket-protocol');
		if (offered?.split(',').some((p) => p.trim() === 'feed.v2') !== true) {
			throw new HttpError(400, { error: 'unsupported_protocol' as const });
		}
		headers.set('sec-websocket-protocol', 'feed.v2'); // sent with the 101
	},
	message: () => {},
});
```

- `data` is the object `socket.data` will be, the same one: what `upgrade`
  stores on it, or keys by it, `open` finds.
- `headers` are the `101`'s, `set.headers` and `set.cookies` already in them.
- A throw answers the upgrade request instead of the `101` — an `HttpError`
  with its status, anything else a 500 — in the app's error format, and a
  middleware that awaits `next()` sees it rejected. No socket opens.
- Without a server (`app.request`), or for a handshake Bun would refuse —
  no `Sec-WebSocket-Key`, or a version other than 13 — the `426` comes
  first: `upgrade` is not run, so what it opens is only opened for a `101`
  to follow.
- The client may go away while it is awaited: `data.request.signal` aborts
  then, and the socket never opens, so `open` and `close` are not called.
  Undo there what `upgrade` opened.

## The handlers

```ts
interface SocketHandlers<Data, Send, Message> {
	upgrade?(data: Data, headers: Headers): MaybePromise<void>; // before the 101, awaited
	open?(socket: Socket<Data, Send>): MaybePromise<void>;
	message(socket: Socket<Data, Send>, message: Message): MaybePromise<void>;
	close?(socket: Socket<Data, Send>, code: number, reason: string): MaybePromise<void>;
	drain?(socket: Socket<Data, Send>): void;
}
```

`message` receives the output of the `message` schema; without one, the
raw message — a `string`, or a `Uint8Array` for a binary frame.

An error a handler throws is logged, and the socket is closed with
`1011 internal error`.

## The socket

```ts
interface Socket<Data, Send> {
	readonly data: Data;                                  // the upgrade request, what validate gave back, what middlewares added
	send(message: Send): Promise<void>;                   // as JSON, checked by `send`
	publish(topic: string, message: Send): Promise<void>; // to every subscriber but this socket
	subscribe(topic: string): void;
	unsubscribe(topic: string): void;
	isSubscribed(topic: string): boolean;
	close(code?: number, reason?: string): void;
	readonly raw: Bun.ServerWebSocket<unknown>;           // Bun's own, for the rest
}
```

`socket.data` holds `params`, `query`, `headers` and `cookies` — as a
`validate` gave them back, or as they arrived — the `request`, `url`, `ip`
and `route`, and whatever each `derive`, `decorate` and middleware added:
`socket.data.user` above.

`send` and `publish` validate the message with `send` and send its output,
so stripped keys never leave the server. `validateResponses: false`
turns that check off ([Replies](replies.md#validateresponses)). Await them:
a refused message rejects.

## Messages refused

A message that is not JSON, or that `message` refuses, is answered on the
same socket:

```json
{ "error": "validation", "issues": [{ "target": "message", "path": ["text"], "code": "too_small", "message": "…" }] }
```

A message that is not JSON has the code `invalid_json`. A client of a
socket with a `message` schema may receive this body.

## Reading it

Any `WebSocket` works: send JSON text, parse what comes back.

```ts
import { expect, test } from 'bun:test';

test('a message is checked, then answered', async () => {
	const server = app.listen({ port: 0 });
	try {
		const url = new URL('/rooms/lobby?user=ada', server.url);
		url.protocol = 'ws:';
		const socket = new WebSocket(url);
		const received: unknown[] = [];
		const done = new Promise<void>((resolve) => {
			socket.onmessage = (event) => {
				received.push(JSON.parse(String(event.data)));
				if (received.length === 2) resolve();
			};
		});
		await new Promise((resolve) => {
			socket.onopen = resolve;
		});
		socket.send(JSON.stringify({ text: '' }));
		socket.send(JSON.stringify({ text: 'hello' }));
		await done;
		socket.close();
		expect(received[0]).toMatchObject({ error: 'validation' });
		expect(received[1]).toEqual({ from: 'ada', text: 'hello' });
	} finally {
		await app.stop(true);
	}
});
```

## In the app's type

A socket route adds nothing to the app's type, as a route does not.
`SocketSchema`, `SocketContext`, `SocketSend` and `SocketMessage` name what
its handlers read, send and receive ([The app's type](types.md)).

## See also

- [Server-sent events](server-sent-events.md): when only the server sends.
- [Serving](serving.md): `listen`, and stopping with open sockets.
