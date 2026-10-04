# Server-sent events

This page covers streaming events to a client: a handler replies with an
async iterable, and each value is one event, sent as JSON. A stream may also name its events —
`event: state`, `event: ping` — each with a schema of its own.

```ts
import { alxia, eventStream, responds } from '@alxia/core';
import { z } from 'zod';

const Tick = z.object({ n: z.number() });

const app = alxia().get('/ticks', responds({ 200: eventStream(Tick) }), ({ reply }) =>
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

The response schema of a stream whose events are each checked by `item`,
given to `responds` for the status that streams: `responds({ 200: eventStream(Tick) })`.
The handler replies with an async iterable of what `item` accepts; each
value is validated and sent as `item`'s **output**, so an unknown key the
schema strips never leaves the server, as for any reply.

`isEventStreamSchema(schema)` tells whether a schema is one
`eventStream(schema)` made: what a plugin documenting the app — an OpenAPI generator — reads.

## Named events

```ts
function eventStream<Events extends EventSchemas>( // Readonly<Record<string, StandardSchemaV1>>
	events: Events,
): NamedEventStreamSchema<Events>;
```

Given a schema per event name, the stream sends each event with its
`event:` line, as a protocol that tells its events apart by name expects —
JMAP's push, for one, sends `state` and `ping`:

```ts
import { alxia, eventStream, responds } from '@alxia/core';
import { z } from 'zod';

const StateChange = z.object({
	'@type': z.literal('StateChange'),
	changed: z.record(z.string(), z.record(z.string(), z.string())),
});
const Ping = z.object({ interval: z.number().int() });

const Push = eventStream({ state: StateChange, ping: Ping });

const app = alxia().get('/push', responds({ 200: Push }), ({ reply }) =>
	reply(
		200,
		(async function* () {
			yield Push.event('ping', { interval: 30 });
			yield Push.event(
				'state',
				{ '@type': 'StateChange', changed: { a1: { Email: 's42' } } },
				{ id: 's42' },
			);
		})(),
	),
);
```

```text
event: ping
data: {"interval":30}

event: state
id: s42
data: {"@type":"StateChange","changed":{"a1":{"Email":"s42"}}}

```

- **What the handler yields** is `{ event, data, id?, retry? }`: `event`
  one of the declared names, `data` what that name's schema accepts. Any
  other name, or data of another event, is a compile error. The data is
  validated and sent as its schema's output, as for an unnamed stream.
- **`Push.event(name, data, fields?)`** builds one, typed by the schema of
  its name. A plain `{ event: 'ping', data }` object yielded from an
  `async function*` passed to `reply(200, …)` widens `event` to `string`,
  which the stream's type refuses; `Push.event` keeps the literal. A
  generator annotated with the union takes plain objects too:

  ```ts
  import type { EventInput } from '@alxia/core';

  async function* pings(): AsyncGenerator<EventInput<typeof Push>> {
  	yield { event: 'ping', data: { interval: 30 } };
  }
  ```

- **`id`** is the event's id, which an `EventSource` sends back as
  `Last-Event-ID` when it reconnects. **`retry`**, a whole number of
  milliseconds, tells an `EventSource` how long to wait before reconnecting.
  Both are left out unless given.
- **A client** reads each under its `event:` name: see
  [Reading it](#reading-it).

### What is refused

A field holding a line break would write a frame the handler never
yielded — `id: 1\ndata: forged` is two lines. So:

| What | When | Result |
| --- | --- | --- |
| an event name that is empty, or holds a CR, an LF or a NUL | `eventStream({ … })` | a `TypeError`, when the app is built |
| no event at all, or a value that is not a Standard Schema | `eventStream({ … })` | a `TypeError`, when the app is built |
| an `id` that is not a string, or holds a CR, an LF or a NUL | the event is yielded | the stream ends with an error, before the event is written |
| a `retry` that is not a whole number, 0 or more | the event is yielded | the stream ends with an error, before the event is written |
| an undeclared `event`, or a value that is not `{ event, data }` | the event is yielded | the stream ends with an error, before the event is written |

The types refuse each of the last three; they come from a cast or from
JavaScript. These checks run even with `validateResponses: false`, which
skips only the data's schema. Data is never a risk: it is JSON, whose line
breaks are escaped, so a string holding one stays on a single `data:` line.

### Pings, the end of the stream, and a client that leaves

A push stream usually waits on two things at once: what it pushes, and a
timer that pings. The handler reads `request.signal`, aborted when the
client leaves, to stop waiting at once; its `finally` releases the timer
and the subscription. Returning ends the stream — what a client's
`closeafter=state` asks for:

```ts
app.get(
	'/events',
	validate({ query: z.object({ closeafter: z.enum(['state', 'no']).default('no') }) }),
	responds({ 200: Push }),
	({ query, request, reply }) =>
		reply(
			200,
			(async function* () {
				const queue: EventInput<typeof Push>[] = [];
				let wake = () => {};
				const timer = setInterval(() => {
					queue.push(Push.event('ping', { interval: 30 }));
					wake();
				}, 30_000);
				const subscription = changes.subscribe((change) => {
					queue.push(Push.event('state', change));
					wake();
				});
				request.signal.addEventListener('abort', () => wake());
				try {
					while (!request.signal.aborted) {
						const next = queue.shift();
						if (next === undefined) {
							await new Promise<void>((resolve) => {
								wake = resolve;
							});
							continue;
						}
						yield next;
						if (next.event === 'state' && query.closeafter === 'state') return;
					}
				} finally {
					clearInterval(timer); // runs when the client leaves, or the stream ends
					subscription.close();
				}
			})(),
		),
);
```

Without the signal, a generator waiting on a promise is closed only when it
next yields: its `finally` would wait for the next ping.

`isNamedEventStreamSchema(schema)` tells whether a schema is a named
stream, and `schema['~events']` holds its schemas by name: what an OpenAPI
generator reads. `isEventStreamSchema` stays true of the unnamed form only.

## What is sent

- Each value is one event: a `data:` line of JSON, then a blank line. On
  a named stream, its `event:` line comes first, then its `id:` and
  `retry:` lines when it has them.
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
app.get('/orders/:id/status', responds({ 200: eventStream(Status) }), ({ params, reply }) =>
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
| a named event whose fields would write another frame | the stream is ended with an error, which is logged: see [What is refused](#what-is-refused) |
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

Any async iterable a handler replies with is a stream, schema or not, each
value sent as JSON:

```ts
app.get('/letters', ({ reply }) =>
	reply(
		200,
		(async function* () {
			yield 'a';
			yield 'b';
		})(),
	),
); // data: "a", then data: "b"
```

A `ReadableStream` is not an event stream: it is sent as bytes.

## Reading it

Any `EventSource` reads it: each `data` is the JSON of one event, and a
named event is dispatched under its name
(`source.addEventListener('state', …)`).

In a test, the body is the text of the events:

```ts
const app = alxia().get('/ticks', responds({ 200: eventStream(Tick) }), ({ reply }) =>
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
- [`@alxia/compress`](https://www.npmjs.com/package/@alxia/compress) leaves
  an event stream alone by default; opted in with `compressible`, it
  flushes each event as it is sent.
