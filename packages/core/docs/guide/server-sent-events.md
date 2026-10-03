# Server-sent events

This page covers streaming events to a client: a handler replies with an
async iterable, each value is one event, and the client reads the same
values back as an async iterable.

```ts
import { alxia, eventStream } from '@alxia/core';
import { z } from 'zod';

const Tick = z.object({ n: z.number() });

const app = alxia().get('/ticks', { response: { 200: eventStream(Tick) } }, ({ reply }) =>
	reply(
		200,
		(async function* () {
			for (let n = 0; ; n++) {
				yield { n };
				await Bun.sleep(1000);
			}
		})(),
	),
);

app.listen(3000);
```

```sh
curl -N localhost:3000/ticks
# data: {"n":0}
#
# data: {"n":1}
```

## `eventStream(schema)`

```ts
function eventStream<Item extends StandardSchemaV1>(item: Item): EventStreamSchema<Item>;
```

The response schema of a stream whose events are each checked by `item`.
The handler replies with an async iterable of what `item` accepts; each
value is validated and sent as `item`'s **output**, so an unknown key the
schema strips never leaves the server, as for any reply.

`isEventStreamSchema(schema)` tells whether a schema is one `eventStream`
made: what a plugin documenting the app — an OpenAPI generator — reads.

## What is sent

- Each value is one event: a `data:` line of JSON, then a blank line.
- The response has `content-type: text/event-stream`,
  `cache-control: no-cache` and `x-accel-buffering: no`, so a proxy such as
  nginx does not buffer it.
- While nothing is sent, a `: keep-alive` comment goes out every eight
  seconds: Bun closes a connection that stays silent.
- When the client leaves, the generator is closed: its `finally` runs, so
  release there what it holds. An event it was still producing is dropped,
  and nothing is logged, unless the generator itself throws: that error is
  still logged.
- When the generator returns, the stream ends.

```ts
app.get('/orders/:id/status', { response: { 200: eventStream(Status) } }, ({ params, reply }) =>
	reply(
		200,
		(async function* () {
			const subscription = orders.subscribe(params.id);
			try {
				for await (const status of subscription) yield status;
			} finally {
				subscription.close(); // runs when the client disconnects
			}
		})(),
	),
);
```

## Errors

| What | Result |
| --- | --- |
| the reply is not an async iterable (the types refuse it; a cast gets past them) | `500`, before the stream starts; a `ResponseValidationError` naming `An event stream replies with an async iterable` is logged |
| an event its schema refuses | the stream is ended with an error: `An event does not match its schema: …` is logged; the events already sent stay sent |
| the generator throws | the stream is ended with an error, which is logged |

The status and headers are gone once the first event is sent, so an
error after it cannot become a status. Send an error as an event of its
own when the client must know:

```ts
const Event = z.discriminatedUnion('type', [
	z.object({ type: z.literal('tick'), n: z.number() }),
	z.object({ type: z.literal('error'), message: z.string() }),
]);
```

## Without a schema

Any async iterable a handler replies with is a stream, schema or not. The
client then reads the values as their type:

```ts
app.get('/letters', ({ reply }) =>
	reply(
		200,
		(async function* () {
			yield 'a';
			yield 'b';
		})(),
	),
); // the client reads AsyncIterable<string>
```

A `ReadableStream` is not an event stream: it is sent as bytes.

## Reading it

With [`@alxia/client`](https://www.npmjs.com/package/@alxia/client), the
200's `data` is an `AsyncIterable` of the events, typed by the schema's
output:

```ts
const ticks = await api.get('/ticks');
if (ticks.status === 200) {
	for await (const tick of ticks.data) console.log(tick.n);
}
```

Any `EventSource` reads it too: each `data` is the JSON of one event.

In a test, the body is the text of the events:

```ts
const app = alxia().get('/ticks', { response: { 200: eventStream(Tick) } }, ({ reply }) =>
	reply(
		200,
		(async function* () {
			yield { n: 1 };
			yield { n: 2 };
		})(),
	),
);

const response = await app.request('/ticks');
expect(response.headers.get('content-type')).toBe('text/event-stream');
expect(await response.text()).toBe('data: {"n":1}\n\ndata: {"n":2}\n\n');
```

## See also

- [Replies](replies.md#how-a-body-is-sent): how every other body is sent.
- [WebSockets](websockets.md): when the client sends too.
