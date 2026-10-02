# Troubleshooting

Each entry is headed by what you see: a TypeScript error, a response, or
what is missing from the log or from a response. `@alxia/logger` throws no
error of its own; what goes wrong is where it sits in the app, and what
`write` does.

**Types**

- [`Property 'log' does not exist on type 'Context<…>'`](#property-log-does-not-exist-on-type-context)
- [`'log' is possibly 'undefined'`](#log-is-possibly-undefined)

**Responses**

- [No `X-Request-Id` on the response, and the error `write` threw in the server log](#no-x-request-id-on-the-response-and-the-error-write-threw-in-the-server-log)
- [`500 {"error":"internal"}` from a route that calls `log`](#500-errorinternal-from-a-route-that-calls-log)
- [The `X-Request-Id` sent back is not the one the request brought](#the-x-request-id-sent-back-is-not-the-one-the-request-brought)

**The log**

- [A client chooses the id its requests are logged under](#a-client-chooses-the-id-its-requests-are-logged-under)
- [The entries have no `ip`, or the proxy's](#the-entries-have-no-ip-or-the-proxys)
- [`duration` is `0`, or shorter than the request took](#duration-is-0-or-shorter-than-the-request-took)
- [A WebSocket connection has no entry](#a-websocket-connection-has-no-entry)
- [Requests outside the group are logged](#requests-outside-the-group-are-logged)
- [A skipped path still shows up in the log](#a-skipped-path-still-shows-up-in-the-log)
- [A field given to `log` is replaced](#a-field-given-to-log-is-replaced)

## Types

### `Property 'log' does not exist on type 'Context<…>'`

```text
error TS2339: Property 'log' does not exist on type 'Context<Empty, "/early", Empty>'.
```

The same comes for `requestId`.

**When:** a route reads `log` or `requestId`, but is declared before
`use(logger())`.

**Why:** both come from the plugin's `derive`, which reaches only the
routes declared after it. At runtime too, `ctx.log` would be `undefined`
there.

**Fix:** use the plugin first:

```ts
const app = alxia()
	.use(logger())
	.get('/early', ({ log, reply }) => {
		log.info('early');
		return reply(200, 'ok');
	});
```

### `'log' is possibly 'undefined'`

```text
error TS18048: 'log' is possibly 'undefined'.
```

**When:** an `onError` hook declared after the plugin calls `log.error(…)`.

**Why:** an `onError` hook also runs for an error thrown before the
plugin's `derive` had run, when there is no `log` yet.

**Fix:** call it optionally:

```ts
app.use(logger()).onError((error, { log }) => {
	log?.error('request failed', { error: String(error) });
	return undefined;
});
```

## Responses

### No `X-Request-Id` on the response, and the error `write` threw in the server log

**When:** `write` throws while writing the request's entry: a closed file,
a sink that is down, a `JSON.stringify` of a value it cannot serialise.

**Why:** the entry is written before the headers are set, in the same
`onResponse` hook. The app catches what the hook throws, prints it with
`console.error`, and sends the response without the hook's work: no
`X-Request-Id`, no `Server-Timing`. The status is unchanged.

**Fix:** make `write` safe; a log line is not worth a request:

```ts
app.use(
	logger({
		write: (entry) => {
			try {
				sink.write(entry);
			} catch (error) {
				console.error('log sink failed', error);
			}
		},
	}),
);
```

### `500 {"error":"internal"}` from a route that calls `log`

**When:** the route calls `log.info`, `log.warn` or `log.error`, and
`write` throws.

**Why:** `log` calls `write` synchronously in the handler, so what it
throws is the handler's error: the app answers 500. The request's own entry
then throws too, so the response also has no `X-Request-Id`.

**Fix:** the same `write` with a `try`, above.

### The `X-Request-Id` sent back is not the one the request brought

**When:** the request sent an id in the header, and the response carries a
new UUID instead.

**Why:** an incoming id is kept only when `trustIncomingId` is on (the
default), and when it is 1 to 128 characters of letters, digits, `_`, `.`,
`:`, `@` and `-`. Anything else, a space, a newline, a longer value, is
dropped without a word so it cannot forge a log line. The header is also
the one named by `header`, `x-request-id` by default.

**Fix:** send an id that matches, in the header the plugin reads:

```ts
/^[\w.:@-]{1,128}$/.test('abc-123'); // true: kept
/^[\w.:@-]{1,128}$/.test('a b');     // false: replaced

app.use(logger({ header: 'x-correlation-id' })); // if your proxy uses another header
```

## The log

### A client chooses the id its requests are logged under

**When:** the app faces the internet directly, and a client sends its own
`X-Request-Id`.

**Why:** `trustIncomingId` is on by default, for the app behind a proxy or
a gateway that sets the header. Without one, the header is whatever the
client sends, so two clients can share an id.

**Fix:** turn it off where no proxy sets the header:

```ts
app.use(logger({ trustIncomingId: false }));
```

### The entries have no `ip`, or the proxy's

**When:** the `ip` key is missing, or it is the same address for every
request.

**Why:** `ip` is the app's `ctx.ip`, the connection's address by default,
and left out of the entry when it is `undefined`. `app.request` and
`app.fetch` run without a server, so there is no address. Behind a proxy,
the connection is the proxy's.

**Fix:** read the header your proxy sets, with the app's `ip` option, and
only from a proxy you trust:

```ts
const app = alxia({
	ip: (request, server) =>
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
		server?.requestIP(request)?.address,
}).use(logger());
```

### `duration` is `0`, or shorter than the request took

**When:** a request's `duration` is `0`, or a download takes far longer
than its `duration`.

**Why:** `duration` runs from the plugin's `onRequest` hook to its
`onResponse` hook. An `onRequest` hook declared before the plugin that
answers on its own (a CORS preflight, a redirect) skips the plugin's, so
the clock starts at the response: `0`. `onRequest` hooks before the plugin
are not counted either. And the clock stops when the response is ready, not
when its body has been sent.

**Fix:** use the plugin first, so it times every other hook:

```ts
import { alxia } from '@alxia/core';
import { cors } from '@alxia/cors';
import { logger } from '@alxia/logger';

const app = alxia().use(logger()).use(cors());
```

A streamed body's own time is not in `duration`; time it in the stream if
you need it.

### A WebSocket connection has no entry

**When:** a `ws` route's connections never show up in the log, and the
upgrade response has no `X-Request-Id`.

**Why:** once a request is upgraded there is no response, so the
`onResponse` hook that writes the entry does not run.

**Fix:** log from the socket's handlers yourself, with `write`'s sink.

### Requests outside the group are logged

**When:** `use(logger())` sits inside a `group`, and requests to routes
outside the group, or to no route at all, are logged and get the header.

**Why:** the plugin's `onRequest` and `onResponse` are global hooks: they
apply to the whole app, wherever they are declared. Only `log` and
`requestId` are scoped to the routes after it.

**Fix:** to leave requests out of the log, name them in `skip`:

```ts
app.group('/api', (api) => api.use(logger({ skip: (_, url) => !url.pathname.startsWith('/api/') })));
```

### A skipped path still shows up in the log

**When:** a path named in `skip` still has entries.

**Why:** `skip` leaves out the request's own entry only. What its route
writes through `log` is still written, and the request still gets its id
and headers.

**Fix:** take the `log` calls out of that route, or keep them and expect
their entries:

```ts
app
	.use(logger({ skip: (_, url) => url.pathname === '/health' }))
	.get('/health', ({ reply }) => reply(200, 'ok')); // no entry at all
```

### A field given to `log` is replaced

**When:** `log.info('…', { level: 'debug' })` or `{ requestId: … }`, and the
entry shows other values.

**Why:** the fields are spread first, then `time`, `level`, `requestId` and
`message` are set, so those four are always the plugin's.

**Fix:** use another key:

```ts
log.info('job queued', { jobRequestId: job.id, severity: 'debug' });
```
