# WebSockets

This page covers socket routes: the upgrade request validated like a
route's, each message checked both ways, and the client typed from the
same schemas.

```ts
import { alxia } from '@alxia/core';
import { z } from 'zod';

const Chat = z.object({ text: z.string().min(1) });
const Said = z.object({ from: z.string(), text: z.string() });

const app = alxia()
	.derive(({ url }) => ({ user: url.searchParams.get('user') ?? 'anonymous' }))
	.ws('/rooms/:room', { message: Chat, send: Said }, {
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

Sockets need **`listen`**: through `app.fetch` alone — `app.request`, a
test without a server — a socket route answers `426 upgrade_required`.

## `ws(path, schema, handlers)`

```ts
ws<const Path extends RoutePath, Schema extends SocketSchema = Empty>(
	path: Path,
	schema: Schema,
	handlers: SocketHandlers<SocketContext<Ctx, Path, Schema>, SocketSend<Schema>, SocketMessage<Schema>>,
): Alxia<…>
```

The schema is required; `{}` validates nothing.

| Part | Checks | Refused |
| --- | --- | --- |
| `params`, `query`, `headers`, `cookies` | the upgrade request, as a route's | a 400 with every issue, and no socket |
| `message` | each message the client sends, parsed as JSON | answered on the socket with a `ValidationErrorBody`; the socket stays open, the handler is not called |
| `send` | each message the server sends | the message is not sent: `send` rejects with a `ResponseValidationError`, which, in a handler, closes the socket with `1011` |
| `detail` | nothing at runtime: what OpenAPI says of it | — |

## The upgrade

The upgrade request runs the route hooks declared before the socket —
`decorate`, `derive` — then validation, like a route. A `derive` that
replies 401 refuses the socket with that 401: an unauthenticated client
never gets one.

```ts
const app = alxia()
	.derive(({ url, reply }) =>
		url.searchParams.get('token') === 'secret'
			? { user: 'ada' }
			: reply(401, { error: 'unauthenticated' as const }),
	)
	.ws('/live', { query: z.object({ channel: z.string() }) }, {
		open: (socket) => socket.subscribe(socket.data.query.channel),
		message: () => {},
	});
```

- `wrap` hooks and `around` hooks are skipped: there is no response to wrap.
- `onRequest` hooks run; `onResponse` hooks do not run for an upgrade that
  succeeds.
- `set.headers` and `set.cookies` a hook sets are sent with the `101`.

## The handlers

```ts
interface SocketHandlers<Data, Send, Message> {
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
	readonly data: Data;                                  // the upgrade request, validated, and what hooks added
	send(message: Send): Promise<void>;                   // as JSON, checked by `send`
	publish(topic: string, message: Send): Promise<void>; // to every subscriber but this socket
	subscribe(topic: string): void;
	unsubscribe(topic: string): void;
	isSubscribed(topic: string): boolean;
	close(code?: number, reason?: string): void;
	readonly raw: Bun.ServerWebSocket<unknown>;           // Bun's own, for the rest
}
```

`socket.data` holds `params`, `query`, `headers` and `cookies` as the
schema gave them back, the `request`, `url`, `ip` and `route`, and
whatever each `derive` and `decorate` added: `socket.data.user` above.

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

A message that is not JSON has the code `invalid_json`. The client's type
of what it receives includes this body when the route has a `message`
schema.

## Reading it

With [`@alxia/client`](https://www.npmjs.com/package/@alxia/client), the
socket is typed by the route: what the client sends by `message`, what it
receives by `send`.

```ts
const socket = api.ws('/rooms/:room', { params: { room: 'lobby' } });
socket.send({ text: 'hi' });
socket.on((said) => console.log(said));
```

Without it, any `WebSocket` works: send JSON text, parse what comes back.

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

A socket is recorded under the method `WS`:

```ts
type Room = RoutesOf<typeof app>['/rooms/:room']['WS'];
// Room['input']   — { readonly params: { readonly room: string | number } }
// Room['send']    — what the client sends: the input of `message`
// Room['receive'] — what it receives: the output of `send`, or a ValidationErrorBody
```

`SocketRecord`, `SocketEntryOf`, `SocketSchema`, `SocketContext`,
`SocketSend` and `SocketMessage` name these pieces ([The app's
type](types.md)).

## See also

- [Server-sent events](server-sent-events.md): when only the server sends.
- [Serving](serving.md): `listen`, and stopping with open sockets.
