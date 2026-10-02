# Events and sockets

This page covers the two calls that do not end with one body: a route that
streams server-sent events, read as an async iterable, and a WebSocket
route, opened with `api.ws()` and typed both ways.

```ts
// server.ts
import { alxia, eventStream } from '@alxia/core';
import { z } from 'zod';

export const app = alxia()
	.get(
		'/ticks',
		{
			query: z.object({ count: z.coerce.number().int().max(10) }),
			response: { 200: eventStream(z.object({ n: z.number(), at: z.date() })) },
		},
		({ query, reply }) =>
			reply(
				200,
				(async function* () {
					for (let n = 1; n <= query.count; n++) yield { n, at: new Date() };
				})(),
			),
	)
	.ws(
		'/echo/:room',
		{
			message: z.object({ text: z.string() }),
			send: z.object({ room: z.string(), text: z.string() }),
		},
		{
			message: (socket, message) =>
				socket.send({ room: socket.data.params.room, text: message.text }),
		},
	);

export type App = typeof app;
```

```ts
import { client } from '@alxia/client';
import type { App } from './server';

const api = client<App>('http://localhost:3000');

const ticks = await api.get('/ticks', { query: { count: 3 } });
if (ticks.status === 200) {
	for await (const tick of ticks.data) console.log(tick.n, tick.at); // 1 '…' 2 '…' 3 '…'
}

const socket = api.ws('/echo/:room', { params: { room: 'lobby' } });
socket.send({ text: 'hi' });
for await (const message of socket) {
	if ('error' in message) continue; // the server refused a message
	console.log(message.room, message.text); // lobby hi
	socket.close();
}
```

## Server-sent events

A response whose `content-type` is `text/event-stream` resolves with `data`
as an `AsyncIterable` of its events, typed by the route's `eventStream`
schema as it crosses the wire — a `Date` is a `string`:

```ts
ticks.data; // AsyncIterable<{ n: number; at: string }>
```

The call resolves as soon as the headers arrive; the events are read as the
loop asks for them. The stream ends when the server's generator returns.
Leaving the loop early — `break`, `return`, a throw — cancels the body, and
the server's generator is closed.

Each event's `data` is parsed as JSON. Comments, such as the server's
keep-alives, are skipped; an event with several `data:` lines is read as
their lines joined by `\n`. Other fields — `event:`, `id:`, `retry:` — are
ignored.

```ts
const controller = new AbortController();
const stream = await api.get('/ticks', { query: { count: 10 }, signal: controller.signal });
if (stream.status === 200) {
	for await (const tick of stream.data) {
		render(tick);
		if (tick.n === 5) break; // stops reading, closes the stream
	}
}
```

### `readEvents(body)`

The same reader, for a `text/event-stream` body you fetched yourself:

```ts
function readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown>;
```

```ts
import { readEvents } from '@alxia/client';

const response = await fetch('http://localhost:3000/ticks?count=3');
for await (const event of readEvents(response.body!)) {
	console.log(event); // { n: 1, at: '…' }, then 2, then 3
}
```

It yields `unknown`: check the values yourself. An event whose `data` is
not JSON makes the loop throw a `SyntaxError`
([Troubleshooting](../troubleshooting.md#syntaxerror-json-parse-error-unexpected-identifier--in-an-event-stream)).

## WebSockets

```ts
type SocketMethod<Routes> = <const Path extends PathsFor<Routes, 'WS'>>(
	path: Path,
	...args: CallArgs</* the route's params and query */>
) => TypedSocket</* what the client sends */, /* what it receives */>;

interface TypedSocket<Send, Receive> extends AsyncIterable<Receive> {
	readonly raw: WebSocket;
	readonly opened: Promise<void>;
	send(message: Send): void;
	on(listener: (message: Receive) => void): () => void;
	close(code?: number, reason?: string): void;
}
```

`api.ws(path, { params, query })` opens the socket at once and returns it
synchronously. `http:` becomes `ws:`, `https:` becomes `wss:`. The client
has `ws` only when the app declares a socket.

| Member | Does |
| --- | --- |
| `send(message)` | sends `message` as JSON. Typed by the route's `message` schema. Queued until the socket opens. |
| `on(listener)` | calls `listener` with each message received, parsed from JSON. Returns the function that removes it. |
| `for await (… of socket)` | the messages received from when the loop starts; ends when the socket closes |
| `opened` | resolves once the socket is open; rejects with `The socket to <url> failed` if it fails first |
| `close(code?, reason?)` | closes it |
| `raw` | the platform's `WebSocket`, for `readyState`, `close` events, or anything else |

### What a socket receives

What the route's `send` schema gives, as JSON — **and**, when the route has
a `message` schema, the `ValidationErrorBody` the server answers a message
it refuses with. Narrow before reading a field:

```ts
socket.on((message) => {
	if ('error' in message) {
		console.warn('refused:', message.issues); // ValidationErrorBody
		return;
	}
	console.log(message.text); // { room: string; text: string }
});
```

Reading `message.text` without the check is a compile error
([Troubleshooting](../troubleshooting.md#property-text-does-not-exist-on-type-validationerrorbody----)).

### Listening

A message is delivered to the listeners present when it arrives: one that
arrives before `on` is called, or before a `for await` loop starts, is not
kept. Register first, then send:

```ts
const socket = api.ws('/echo/:room', { params: { room: 'lobby' } });
const off = socket.on((message) => console.log(message));
socket.send({ text: 'hi' });
// later
off();
```

Every listener and every loop receives every message.

### Opening, and failing to

A socket that cannot open — no server, a refused upgrade (a 401 from a
guard, a 400 for its params) — does not throw: `opened` rejects, and a
`for await` loop ends at once with no message. Await `opened` where the
failure matters:

```ts
const socket = api.ws('/echo/:room', { params: { room: 'lobby' } });
try {
	await socket.opened;
} catch (error) {
	console.error(error); // Error: The socket to ws://localhost:3000/echo/lobby failed
}
```

A socket needs a server: `client(app).ws()` throws in process
([Testing](testing.md#sockets)).

### What a socket sends besides its messages

The path, with its params, and the query string. **Not** typed `headers`
or `cookies`: a `WebSocket` cannot set request headers, so they are
dropped, and a route that requires them refuses the upgrade
([Troubleshooting](../troubleshooting.md#a-socket-whose-route-reads-headers-never-opens)).
Put what the upgrade needs in the query, or, in a browser, in the origin's
cookies, which the browser sends itself.

## A realistic chat room

A room that reconnects when the server closes the socket:

```ts
import { client, type TypedSocket } from '@alxia/client';
import type { App } from './server';

const api = client<App>('https://chat.example.com');

type Said = { room: string; text: string };

export function joinRoom(room: string, onSaid: (said: Said) => void) {
	let socket: TypedSocket<{ text: string }, unknown>;
	let leaving = false;

	const connect = () => {
		const opened = api.ws('/echo/:room', { params: { room } });
		opened.on((message) => {
			if (!('error' in message)) onSaid(message);
		});
		opened.raw.addEventListener('close', () => {
			if (!leaving) setTimeout(connect, 1_000);
		});
		socket = opened;
	};
	connect();

	return {
		say: (text: string) => socket.send({ text }),
		leave: () => {
			leaving = true;
			socket.close();
		},
	};
}
```

## See also

- [Reading results](results.md): what a call resolves to.
- `@alxia/core`'s guide to
  [server-sent events](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/server-sent-events.md)
  and [WebSockets](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/websockets.md):
  the server's side.
