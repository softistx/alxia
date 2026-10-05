# Server-sent events and WebSockets

**The problem.** The server has something to say without being asked: a
progress bar, a feed, a chat. You want what it sends typed and checked, the
client's departure noticed, the connection authenticated before it opens, and
a shutdown that does not wait for a stream that never ends.

Pick the simpler tool first. **Server-sent events** are a one-way stream over
plain HTTP: they pass proxies, reconnect by themselves (`EventSource`), and
need no library. **WebSockets** are two-way and carry messages both ways.
Both are routes of the app: they run its middlewares, and both are typed.

```sh
bun add @alxia/core zod
```

## Server-sent events

A handler replies with an async iterable, and each value it yields is one
event, sent as JSON and checked by the schema `eventStream` was given. The
stream ends when the generator returns, when the client leaves
(`request.signal` aborts, and the generator's `finally` runs), or when the
app shuts down.

```ts
// file: src/app.ts
import { alxia, defineMiddleware, eventStream, responds, validate } from '@alxia/core';
import { z } from 'zod';

const Tick = z.object({ n: z.number() });

// The messages of the chat: what a client sends, what the room hears.
const Chat = z.object({ text: z.string().min(1) });
const Said = z.object({ from: z.string(), text: z.string() });

// An upgrade request is a request: its middlewares run, and one that replies
// refuses the socket. A browser's WebSocket cannot set a header, so the token
// is in the query.
const tokens = new Map([['ada-token', 'ada']]);
const who = defineMiddleware(({ url, reply }, next) => {
	const user = tokens.get(url.searchParams.get('token') ?? '');
	return user === undefined ? reply(401, { error: 'unauthenticated' as const }) : next({ user });
});

export const app = alxia()
	.get(
		'/ticks',
		validate({ query: z.object({ count: z.coerce.number().int().positive().optional() }) }),
		responds({ 200: eventStream(Tick) }),
		({ query, request, reply }) =>
			reply(
				200,
				(async function* () {
					try {
						for (let n = 0; n < (query.count ?? Number.POSITIVE_INFINITY); n++) {
							if (request.signal.aborted) return; // the client left
							yield { n }; // validated, then sent as `data: {"n":0}`
							await Bun.sleep(10);
						}
					} finally {
						// release what the stream holds: a timer, a subscription
					}
				})(),
			),
	)
	.ws('/rooms/:room', { message: Chat, send: Said }, who, {
		open(socket) {
			socket.subscribe(socket.data.params.room);
		},
		async message(socket, chat) {
			const said = { from: socket.data.user, text: chat.text }; // socket.data.user: string
			await socket.send(said); // to this socket
			await socket.publish(socket.data.params.room, said); // to the others in the room
		},
	});
```

`responds({ 200: eventStream(Tick) })` types the generator: yielding
`{ n: 'x' }` does not compile. The response carries
`content-type: text/event-stream`, `x-accel-buffering: no` so nginx does not
buffer it, and a `: keep-alive` comment every eight seconds, because Bun
closes a silent connection. Named events (`event: state`), ids and
`retry:` are in [the guide](../../packages/core/docs/guide/server-sent-events.md#named-events).

A client:

```ts no-check
const events = new EventSource('/ticks');
events.onmessage = ({ data }) => console.log(JSON.parse(data).n);
```

## WebSockets

A socket route declares the schema of each direction: a `message` the client
sends is parsed as JSON and checked (a refused one is answered on the socket
and does not reach the handler), and each `send` is checked on the way out.
`socket.data` holds the upgrade's context: the path's `params`, and what
`who` added. `who` runs on the upgrade: no token, and the client gets a 401
and no socket.

Sockets need **a server**: `app.request` has none, and a socket route
answers it `426 upgrade_required`. Test with `listen({ port: 0 })`, which
picks a free port, and a `WebSocket`:

```ts
// file: src/app.spec.ts
import { expect, test } from 'bun:test';
import { app } from './app';

test('ticks, as server-sent events', async () => {
	const response = await app.request('/ticks?count=3');
	expect(response.headers.get('content-type')).toContain('text/event-stream');
	const body = await response.text(); // ends: the generator returned
	expect(body).toContain('data: {"n":0}');
	expect(body).toContain('data: {"n":2}');
});

test('a socket needs a server, and a token', async () => {
	expect((await app.request('/rooms/lobby')).status).toBe(426);

	const server = app.listen({ port: 0, signals: false });
	const base = server.url.href.replace('http', 'ws');
	try {
		// no token: the upgrade is refused with the 401
		const refused = await fetch(`${server.url.href}rooms/lobby`, { headers: { upgrade: 'websocket' } });
		expect(refused.status).toBe(401);

		const socket = new WebSocket(`${base}rooms/lobby?token=ada-token`);
		const heard = new Promise<string>((resolve) => {
			socket.onmessage = (event) => resolve(String(event.data));
		});
		await new Promise((resolve) => {
			socket.onopen = resolve;
		});
		socket.send(JSON.stringify({ text: 'hello' }));
		expect(JSON.parse(await heard)).toEqual({ from: 'ada', text: 'hello' });
		socket.close();
	} finally {
		await app.stop();
	}
});
```

## Reference

- [Server-sent events](../../packages/core/docs/guide/server-sent-events.md):
  `eventStream`, named events, pings, a client that leaves
- [WebSockets](../../packages/core/docs/guide/websockets.md): `ws`, the
  upgrade, rooms, `Bun.serve` of your own
- [Serving](../../packages/core/docs/guide/serving.md#websocket)
- [Health and graceful shutdown](health-and-shutdown.md): every stream ends
  when the app is stopped; `shutdownSignal(ctx)` for a long response of your own
- [GraphQL subscriptions](graphql-api.md) are server-sent events too
- [`@alxia/core` troubleshooting](../../packages/core/docs/troubleshooting.md)
