# Troubleshooting

Each entry is headed by what you see: a TypeScript error, a response, or
what is missing from the log or from a response. `@alxia/logger` throws no
error of its own, and logging never breaks a request: a `write`, a `skip`
or a `generateId` that throws, or an `async` `write` that rejects, has its
error printed with `console.error` while the request is answered as it
would have been. What goes wrong is
where the middleware sits in the app, and what those options return.

**Types**

- [`Property 'log' does not exist on type 'Context<…>'`](#property-log-does-not-exist-on-type-context)

**Responses**

- [The `X-Request-Id` sent back is not the one the request brought](#the-x-request-id-sent-back-is-not-the-one-the-request-brought)
- [The `X-Request-Id` is a UUID, not the id `generateId` made](#the-x-request-id-is-a-uuid-not-the-id-generateid-made)

**The log**

- [A client chooses the id its requests are logged under](#a-client-chooses-the-id-its-requests-are-logged-under)
- [The entries have no `ip`, or the proxy's](#the-entries-have-no-ip-or-the-proxys)
- [`duration` is `0`, or shorter than the request took](#duration-is-0-or-shorter-than-the-request-took)
- [A streamed request's entry comes long after the request](#a-streamed-requests-entry-comes-long-after-the-request)
- [A WebSocket connection has no entry](#a-websocket-connection-has-no-entry)
- [`logger()` logs a 500, not the reply of my `try`/`catch` middleware](#logger-logs-a-500-not-the-reply-of-my-trycatch-middleware)
- [Requests outside the group are not logged](#requests-outside-the-group-are-not-logged)
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

**Why:** both are added by the middleware, which reaches only what is
declared after it. At runtime too, `ctx.log` would be `undefined` there.

**Fix:** mount `logger()` first:

```ts
const app = alxia()
	.use(logger())
	.get('/early', ({ log, reply }) => {
		log.info('early');
		return reply(200, 'ok');
	});
```

## Responses

### The `X-Request-Id` sent back is not the one the request brought

**When:** the request sent an id in the header, and the response carries a
new UUID instead.

**Why:** an incoming id is kept only when `trustIncomingId` is on (the
default), and when it is 1 to 128 characters of letters, digits, `_`, `.`,
`:`, `@` and `-`. Anything else, a space, a newline, a longer value, is
dropped without a word so it cannot forge a log line. The header is also
the one named by `header`, `x-request-id` by default.

**Fix:** send an id that matches, in the header the middleware reads:

```ts
/^[\w.:@-]{1,128}$/.test('abc-123'); // true: kept
/^[\w.:@-]{1,128}$/.test('a b');     // false: replaced

app.use(logger({ header: 'x-correlation-id' })); // if your proxy uses another header
```

### The `X-Request-Id` is a UUID, not the id `generateId` made

**When:** a request that brings no id is answered with a new UUID, though
`generateId` is set.

**Why:** the id `generateId` makes must pass the rule an incoming id does,
1 to 128 letters, digits, `_`, `.`, `:`, `@` and `-`, or it is
replaced by a `crypto.randomUUID()` without a word. A `generateId` that
throws is replaced too; its error is in the server log, from
`console.error`.

**Fix:** make an id that matches:

```ts
app.use(logger({ generateId: () => `job:${crypto.randomUUID()}` })); // kept
app.use(logger({ generateId: () => 'job 7' }));                      // a space: replaced
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

**Why:** `duration` runs from the moment `logger()` receives the request
to the moment its response is settled. A middleware declared before it
that answers on its own (a CORS preflight, a redirect) never calls
`next()`, so `logger()` does not run: no entry. One declared before it
that does call `next()` is not counted in the time. And for a body of known length, a file included,
the clock stops when the response is handed to Bun, not when its last byte
has been sent: only a streamed body, one with no `Content-Length`, is
timed to its end.

**Fix:** mount `logger()` first, so it times every other middleware:

```ts
import { alxia } from '@alxia/core';
import { cors } from '@alxia/cors';
import { logger } from '@alxia/logger';

const app = alxia().use(logger()).use(cors());
```

A large file sent to a slow client is the case that stays short: Bun sends
it with `sendfile`, which `logger()` does not wrap. Its `Content-Length`
tells the client how long it is; the time to send it is the proxy's or the
client's to measure.

### A streamed request's entry comes long after the request

**When:** the entry of a page streamed as it renders, or of an event
stream, is written seconds or minutes after the request, or only when the
client closes the tab.

**Why:** a streamed body is logged once it has ended, so `duration` and
`outcome` say what the client actually received. An event stream that
never ends on its own is logged when its client leaves, with `outcome:
'aborted'`, at `warn`.

**Fix:** none is needed. The time to the response is in `timeToHeaders`.
To keep an event stream's `warn` out of an alert, filter on its path or on
`outcome`, or `skip` it:

```ts
app.use(logger({ skip: (_, url) => url.pathname === '/events' }));
```

### A GraphQL entry has no `operationName`

**When:** a `POST /graphql` is logged without `operationName` or
`operationType`.

**Why:** the fields come from what `@alxia/graphql` reports when it
executes an operation. A request refused before it executes (a syntax
error, an invalid document), an operation over `ws: true`, an endpoint
that is not `@alxia/graphql`, or a `@alxia/core` or `@alxia/graphql` older
than the one that reports it, have none. An anonymous operation has an
`operationType` and no name.

**Fix:** none for a refused document. Otherwise update the packages
together, and give `logger()` to `use` before `graphql()`
([the guide](guide.md#a-graphql-operation)).

### A WebSocket connection has no entry

**When:** a `ws` route's connections never show up in the log, and the
upgrade response has no `X-Request-Id`.

**Why:** once a request is upgraded there is no response, so there is
nothing for `logger()` to settle and no entry is written.

**Fix:** log from the socket's handlers yourself, with `write`'s sink.

### `logger()` logs a 500, not the reply of my `try`/`catch` middleware

**When:** a middleware wraps `next()` in a `try`/`catch` and answers errors
in its own format (a 503, a problem document), and the log line for that
request shows a 500.

**Why:** `logger()` settles `next()`: it logs the response the error would be
answered with, an `HttpError`'s status or a 500, then
the error goes on to the middlewares around it. Declared **before**
`logger()`, the catcher still catches the error, but the logger inside it
saw the 500, not its reply. The same holds for `telemetry()` and
`secureHeaders()`.

**Fix:** declare the error-handling middleware after the observers, so they
see its reply:

```ts
import { alxia, defineMiddleware } from '@alxia/core';
import { logger } from '@alxia/logger';

const app = alxia()
	.use(logger())
	.use(
		defineMiddleware(async (_ctx, next) => {
			try {
				return await next();
			} catch (error) {
				return new Response('try again', { status: 503 });
			}
		}),
	);
```

### Requests outside the group are not logged

**When:** `use(logger())` sits inside a `group`, and requests to routes
outside the group, or to no route at all, get no entry and no header.

**Why:** a group's middlewares stay inside the group: its routes, and the
unmatched requests under its prefix. Nothing outside the prefix, and no route
declared after the group, is logged by it.

**Fix:** `use` it on the app, and leave requests out with `skip`:

```ts
app.use(logger({ skip: (_, url) => !url.pathname.startsWith('/api/') }));
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
`message` are set, so those four are always the logger's.

**Fix:** use another key:

```ts
log.info('job queued', { jobRequestId: job.id, severity: 'debug' });
```
