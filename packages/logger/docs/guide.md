# Guide

This page covers everything `logger()` does to a request: the id it gives
it, the entry it writes once the request is answered, the headers it adds
to the response, and the `log` and `requestId` the routes after it read.

```ts
import { alxia } from '@alxia/core';
import { logger } from '@alxia/logger';

const app = alxia()
	.use(logger())
	.get('/orders/:id', ({ params, log, requestId, reply }) => {
		log.info('order read', { order: params.id });
		return reply(200, { id: params.id, requestId });
	});

app.listen(3000);
```

`GET /orders/7` prints two JSON lines on stdout, both carrying the same
`requestId`, and answers with that id in `X-Request-Id` and the time it
took in `Server-Timing`:

```json
{"order":"7","time":"2026-10-01T09:12:03.512Z","level":"info","requestId":"0b9e…","message":"order read"}
{"time":"2026-10-01T09:12:03.513Z","level":"info","requestId":"0b9e…","message":"GET /orders/7 200","method":"GET","path":"/orders/7","status":200,"duration":1.42,"ip":"127.0.0.1"}
```

## Options

```ts
function logger(options?: LoggerOptions): Alxia<…> // an app plugin: give it to `use`

interface LoggerOptions {
	readonly write?: (entry: LogEntry) => void;
	readonly header?: string;
	readonly generateId?: () => string;
	readonly trustIncomingId?: boolean;
	readonly serverTiming?: boolean;
	readonly skip?: (request: Request, url: URL) => boolean;
}
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `write` | `(entry: LogEntry) => void` | `console.log(JSON.stringify(entry))` | where every entry goes: the request's entry and each `log` call; a throw or a rejection loses that entry, never the request |
| `header` | `string` | `'x-request-id'` | the header the id is read from, and sent back in |
| `generateId` | `() => string` | `crypto.randomUUID()` | makes the id of a request that brings none, or none that is kept; an id that fails the incoming-id rule, or a throw, falls back to `crypto.randomUUID()` |
| `trustIncomingId` | `boolean` | `true` | whether an id the request brings is kept |
| `serverTiming` | `boolean` | `true` | whether the response gets `Server-Timing: total;dur=<ms>` |
| `skip` | `(request: Request, url: URL) => boolean` | none | requests that get no entry of their own; a throw logs the request |

### `write`

Called synchronously with each entry, an object rather than a string, so it
can go to any sink. To a file, one JSON line each:

```ts
const file = Bun.file('requests.log').writer();

app.use(logger({ write: (entry) => file.write(`${JSON.stringify(entry)}\n`) }));
```

To a logger that already has levels, such as pino, whose `info`, `warn`
and `error` take an object and a message:

```ts
import pino from 'pino';

const sink = pino();

app.use(logger({ write: ({ level, message, ...fields }) => sink[level](fields, message) }));
```

Logging never breaks a request. A `write` that throws, or returns a
promise that rejects, loses that entry only: the plugin catches the error
and prints it with `console.error`. The request is answered as it would have been, with its `X-Request-Id` and
`Server-Timing`, and a `log.info`, `log.warn` or `log.error` in a route
does not turn it into a 500:

```ts
const app = alxia()
	.use(logger({ write: () => { throw new Error('sink down'); } }))
	.get('/orders/:id', ({ log, reply }) => {
		log.info('order read'); // lost, and `Error: sink down` on stderr
		return reply(200, 'ok'); // still 200, with both headers
	});
```

`write` is not awaited: the response does not wait for it. An `async`
`write` whose promise rejects is caught the same way, its error printed
with `console.error` once it rejects, so a sink that sends each entry over
the network needs no `catch` of its own:

```ts
app.use(
	logger({
		write: async (entry) => {
			await fetch('https://logs.internal/entries', { method: 'POST', body: JSON.stringify(entry) });
		},
	}),
);
```

### `header`

The header is matched without regard to case, as every header is. Name the
one your proxy or your other services already use:

```ts
app.use(logger({ header: 'x-correlation-id' }));
```

### `generateId`

An id from a library you already use, or one sortable by time:

```ts
app.use(logger({ generateId: () => Bun.randomUUIDv7() })); // sortable by time
```

The id it makes must pass the same rule as an incoming one (see
[`trustIncomingId`](#trustincomingid)): 1 to 128 letters, digits, `_`,
`.`, `:`, `@` and `-`. One that does not, an empty string, a space, a
129th character, is replaced by a `crypto.randomUUID()` without a word. A
`generateId` that throws is replaced the same way, and its error printed
with `console.error`:

```ts
app.use(logger({ generateId: () => 'a b' })); // X-Request-Id: a new UUID, not "a b"
```

### `trustIncomingId`

When it is on, an id the request brings in `header` is kept, so a proxy, a
gateway or a calling service can thread one id through every hop. It is
kept only if it is 1 to 128 characters of letters, digits, `_`, `.`, `:`,
`@` and `-`:

```ts
/^[\w.:@-]{1,128}$/
```

Anything else (a space, a newline, a 129th character) is dropped without a
word, and a new id is made. An app that faces the internet directly, with
no proxy setting the header, should turn it off, so a client cannot choose
the id its requests are logged under:

```ts
app.use(logger({ trustIncomingId: false }));
```

### `serverTiming`

On by default: the response gets `total;dur=<ms>`, which the browser's
developer tools show in the request's timing tab. The entry is appended, so
a `Server-Timing` the route already set is kept beside it. Turn it off when
the timing should not leave the server:

```ts
app.use(logger({ serverTiming: false }));
```

### `skip`

A skipped request still gets its id, its header and its `Server-Timing`;
only its own entry is not written. What a route logs through `log` is still
written:

```ts
app.use(logger({ skip: (_, url) => url.pathname === '/health' || url.pathname.startsWith('/assets/') }));
```

A `skip` that throws logs the request, as if it had returned `false`, and
its error is printed with `console.error`.

## The request's entry

Once a request is answered, the plugin writes one `LogEntry`:

```ts
interface LogEntry {
	readonly time: string;                      // ISO 8601, when the entry is written
	readonly level: 'info' | 'warn' | 'error';
	readonly requestId: string;
	readonly message: string;                   // "GET /orders/7 200"
	readonly method?: string;
	readonly path?: string;
	readonly status?: number;
	readonly duration?: number;                 // milliseconds, two decimals
	readonly ip?: string;
	readonly [field: string]: unknown;          // the fields given to `log`
}
```

| Field | Value |
| --- | --- |
| `level` | `info` below 400, `warn` from 400 to 499, `error` from 500 |
| `message` | `<method> <path> <status>` |
| `path` | the URL's path, **without** its query string, so a token in the query never reaches the log |
| `duration` | from the plugin's `onRequest` hook to its `onResponse` hook, rounded to two decimals |
| `ip` | the app's `ctx.ip`; the key is absent when it is `undefined` |

Every request is answered, so every request gets an entry: a 404 or a 405
that matched no route, a 500 from a handler that threw, a response an
earlier `onRequest` hook sent on its own. The error behind a 500 is not in
the entry; the app prints it with `console.error`, and
[`onError`](#in-onerror) can log it with the request's id.

`ip` is the connection's address unless the app reads it otherwise. Behind
a proxy, that is the proxy; read the header it sets with the app's `ip`
option:

```ts
const app = alxia({
	ip: (request, server) =>
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
		server?.requestIP(request)?.address,
}).use(logger());
```

`app.request` and `app.fetch` run without a server, so their entries have
no `ip`.

## `log` and `requestId`

The routes declared after `use(logger())` read two more keys from their
context:

```ts
interface RequestLog {
	info(message: string, fields?: Record<string, unknown>): void;
	warn(message: string, fields?: Record<string, unknown>): void;
	error(message: string, fields?: Record<string, unknown>): void;
}

// in the context of every route after `use(logger())`:
// requestId: string
// log: RequestLog
```

Each call writes one entry through `write`, with the fields spread in
first, then `time`, `level`, `requestId` and `message`. Those four always
win, so a field of the same name is replaced:

```ts
log.info('paid', { order: 7, amount: 1200 });
// {"order":7,"amount":1200,"time":"…","level":"info","requestId":"…","message":"paid"}

log.info('paid', { requestId: 'mine', level: 'error' });
// {"requestId":"<the request's id>","level":"info",…}: the request's own values
```

`requestId` is the same string sent back in the header: hand it to the
services you call, so their logs carry it too:

```ts
app.use(logger()).post('/checkout', async ({ requestId, log, reply }) => {
	const response = await fetch('https://payments.internal/charges', {
		method: 'POST',
		headers: { 'x-request-id': requestId },
	});
	if (!response.ok) log.warn('charge refused', { status: response.status });
	return reply(response.ok ? 200 : 502, { requestId });
});
```

### Declared before, or after

`log` and `requestId` come from a `derive`, so they reach only the routes
and route hooks declared after `use(logger())`. A route declared before it
is a compile error, `Property 'log' does not exist`
([Troubleshooting](troubleshooting.md#property-log-does-not-exist-on-type-context)).
In a `derive` of your own, after the plugin, they are there:

```ts
app
	.use(logger())
	.derive(({ request, log }) => {
		const user = request.headers.get('x-user');
		if (user === null) log.warn('anonymous request');
		return { user };
	});
```

### In `onError`

An `onError` hook declared after the plugin reads `log`, but typed as
possibly `undefined`: the error may have come before the plugin's `derive`
ran. Log the error with the request's id:

```ts
app
	.use(logger())
	.onError((error, { log }) => {
		log?.error('request failed', { error: String(error) });
		return undefined; // the app still answers 500
	})
	.get('/boom', () => {
		throw new Error('boom');
	});
```

The entry `request failed` comes first, then `GET /boom 500` at `error`
level, both with the same `requestId`.

## Where it sits in the app

`logger()` is an app plugin: it adds the `log` and `requestId` route keys,
and two **global** hooks, an `onRequest` that gives the request its id and
an `onResponse` that writes the entry and sets the headers. Global hooks
apply to the whole app, wherever they are declared, so:

- every request is logged and gets the header, including the routes
  declared before `use(logger())` and those outside a `group` that uses it;
- the order of global hooks is the order declared. Use the plugin first, so
  its `duration` covers the `onRequest` hooks after it. Its `onResponse`
  then runs before those declared after it (CORS, security headers); they
  add headers but do not change the status it logs:

```ts
import { alxia } from '@alxia/core';
import { logger } from '@alxia/logger';

const app = alxia()
	.use(logger({ skip: (_, url) => url.pathname === '/health' }))
	.get('/health', ({ reply }) => reply(200, 'ok'))
	.group('/api', (api) => api.get('/me', ({ log, reply }) => {
		log.info('me');
		return reply(200, 'ok');
	}));
```

`duration` stops when the response object is ready, not when its body has
been sent: a streamed body or a large file is not counted.

A WebSocket upgrade gets no entry and no header: once upgraded, there is no
response for the `onResponse` hook to read.

## Testing

`write` makes the log a value a test can read. Through `app.request`, with
no server to listen:

```ts
import { expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { type LogEntry, logger } from '@alxia/logger';

const entries: LogEntry[] = [];
const app = alxia()
	.use(logger({ write: (entry) => entries.push(entry) }))
	.get('/hello', ({ requestId, log, reply }) => {
		log.info('greeting', { who: 'ada' });
		return reply(200, requestId);
	});

test('every entry carries the id sent back', async () => {
	entries.length = 0;
	const response = await app.request('/hello', { headers: { 'x-request-id': 'abc-123' } });
	expect(response.headers.get('x-request-id')).toBe('abc-123');
	expect(entries.map((entry) => entry.message)).toEqual(['greeting', 'GET /hello 200']);
	expect(entries.every((entry) => entry.requestId === 'abc-123')).toBe(true);
});
```

A fixed `generateId` makes the id predictable when the request brings none:

```ts
const app = alxia().use(logger({ write: () => {}, generateId: () => 'test-id' }));
```

## See also

- [Troubleshooting](troubleshooting.md): a missing header, a missing `log`,
  an id that was not kept.
- [`@alxia/core`'s hooks](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/hooks.md):
  the order a request runs through `onRequest`, `derive`, `onError` and
  `onResponse`.
