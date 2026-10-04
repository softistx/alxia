# Guide

This page covers what `telemetry()` records and when: the span it opens
around each request, how it is named, what it carries, how a trace crosses
services, each option with its default, and how to close it, test it, and
call another service from inside it.

```ts
import { alxia } from '@alxia/core';
import { telemetry } from '@alxia/telemetry';
import { consoleExporter, createLogger } from '@nxgt/telemetry';

const tracing = telemetry({ service: 'checkout', exporters: [consoleExporter()] });
const log = createLogger('Orders');

const app = alxia()
	.use(tracing)
	.get('/orders/:id', ({ params, span, reply }) => {
		span?.attribute('order.id', params.id);
		log.info('order read');
		return reply(200, { id: params.id });
	})
	.onStop(() => tracing.telemetry.close());

app.listen(3000);
```

`GET /orders/o-1` now writes a server span named `GET /orders/:id` to the
console, and the `order read` log line carries that span's `traceId` and
`spanId`. Swap `consoleExporter()` for any other `@nxgt/telemetry`
exporter, and nothing else changes.

## The signature

```ts
function telemetry(
	options: TelemetryPluginOptions,
): Middleware<…> & { telemetry: Telemetry }; // give it to `app.use`, first

interface TelemetryContext {
	readonly span: SpanScope | undefined;
	readonly telemetry: Telemetry;
}

type TelemetryPluginOptions =
	| (Hooks & TelemetryOptions & { readonly service: string; readonly instance?: undefined })
	| (Hooks & { readonly instance: Telemetry; readonly service?: undefined });

interface Hooks {
	readonly traced?: (ctx: RequestContext) => boolean;
	readonly spanName?: (ctx: RequestContext) => string;
	readonly traceResponse?: boolean;
}
```

`SpanScope`, `Telemetry` and `TelemetryOptions` are `@nxgt/telemetry`'s;
`RequestContext` is `@alxia/core`'s. `telemetry()` returns a middleware:
pass it to `app.use`, called. A `use()` on the app runs on every request,
so it traces them all, a 404 included, and it adds `span` and `telemetry`
to what is declared **after** it: the middlewares and the routes. The
telemetry it writes to is also on the middleware itself, as `.telemetry`,
for the code that is not a route. Give it to `use` first, with the other
observers (`logger`, `secureHeaders`, `cors`, `compress`).

## The span

One span per request, of kind `server`, opened by the middleware. It
holds everything the request runs after it: the middlewares, validation,
the route's own middlewares and handler, whatever they await, and the
answer to an error: `telemetry()` settles `next()`, so the span sees the
response the client gets, an `onError` reply or a 500 included. A log written with `createLogger` anywhere inside it,
and a span opened with `span()`, belong to it.

```ts
import { alxia } from '@alxia/core';
import { telemetry } from '@alxia/telemetry';
import { consoleExporter, createLogger, span } from '@nxgt/telemetry';

const log = createLogger('Orders');

const app = alxia()
	.use(telemetry({ service: 'checkout', exporters: [consoleExporter()] }))
	.get('/orders/:id', async ({ params, reply }) => {
		const order = await span('orders.find', () => ({ id: params.id })); // a child of the server span
		log.info('order read');                                            // carries the server span's ids
		return reply(200, order);
	});
```

Because a `use()` on the app runs on every request, a route declared before
`use(telemetry(...))` is traced too; it only cannot read `span` and
`telemetry` from its context, and a request no route matches is traced as
well. A middleware declared **before** `telemetry()` is outside the span.
A WebSocket upgrade is not traced: there is no response to time.

### A streamed body

A response whose body is a stream of unknown length (a React Router page
rendered as it goes, an `eventStream` reply, a `ReadableStream` of your
own) keeps the span open until that body has ended, so the span's
duration is the time to the last byte. The middleware passes the body through
a stream of its own, one chunk at a time:

| The body | The span |
| --- | --- |
| sent whole | ends then, its status from the response |
| the client left before its end | ends then, `ok`, with an `http.response.aborted` event |
| the stream failed | ends then, `error`, with the stream's error as its exception |

An endless event stream's span ends when its client leaves. A response
with no body, or with a `Content-Length` header (`@alxia/core` sets it on
every reply of a string, JSON, a buffer or a file), ends the span when it
is handed over and is left as it is: Bun sends those bodies without
JavaScript, a file with `sendfile`. A raw `Response` a handler or a middleware builds, even
of a string or a `Bun.file`, has no such header until Bun sends it: it is
treated as a stream, and timed to its end. An unsampled span is never
exported, so its body is never wrapped.

What decides is the `Content-Length` of the response `telemetry()` sees on
the way out. `@alxia/compress` removes it from the body it compresses, so
with `use(compress())` declared before `use(telemetry(...))`, a compressed
JSON reply is a stream too, and its span lasts until it has been sent.

In a test, a streamed route's span ends only once its body has been read
or cancelled: read it before `close()`, or the span is never exported.

```ts
const response = await app.request('/events');
await response.body?.cancel(); // or `await response.text()` for a body that ends
await instance.close();
```

### Its name

| The request | The span's name |
| --- | --- |
| when it opens | `spanName(ctx)`, by default `"<METHOD> <path>"`: `GET /orders/o-1` |
| routing matched a route | `"<METHOD> <route>"`: `GET /orders/:id`, and `http.route` is set |
| no route matched (`404`, `405`) | stays `spanName(ctx)`, `"<METHOD> <path>"` by default |

A route's name replaces any `spanName`: one dashboard row per route, not
one per order. So `spanName` only names what routing did not match (an
unmatched request still gets its span). A
`HEAD` request answered by a `GET` route is named `HEAD /orders/:id`.

### Its status, and the route's error

| The response | The span's status | Its exception |
| --- | --- | --- |
| `2xx`, `3xx`, `4xx` replied | `ok` | none |
| a `4xx` an error-handling middleware made of a thrown error | `ok` | none: the middleware caught it |
| a `4xx` the route boundary made of a thrown error (a deprecated `onError` hook, an `HttpError`) | `ok` | the error |
| `499`, the client hung up mid-request | `ok` | the `AbortError` |
| a `5xx` from a throw | `error` | the error |
| a `5xx` the route replied | `error` | none |
| a streamed body that failed midway ([A streamed body](#a-streamed-body)) | `error` | the stream's error |

A `401` a guard answered is the server working, so a 4xx never marks a
span. An error that reaches the route boundary is still recorded, as
`ctx.error` holds it. One an error-handling middleware catches is not: the
span sees only the 400 it answered. Here a middleware after `telemetry`
turns a `RangeError` into a 400:

```ts
import { alxia, defineMiddleware } from '@alxia/core';
import { telemetry } from '@alxia/telemetry';
import { consoleExporter } from '@nxgt/telemetry';

const app = alxia()
	.use(telemetry({ service: 'checkout', exporters: [consoleExporter()] }))
	.use(
		defineMiddleware(async ({ reply }, next) => {
			try {
				return await next();
			} catch (error) {
				if (error instanceof RangeError) return reply(400, { error: 'out_of_range' as const });
				throw error;
			}
		}),
	)
	.get('/range', () => {
		throw new RangeError('out of range');
	});

await app.request('/range'); // 400; the span is ok, with no exception: the middleware caught it
```

### What it records

| Attribute | Exported as | Value | When |
| --- | --- | --- | --- |
| `http.request.method` | `HTTP_METHOD` | `GET` | always |
| `url.path` | `URL_PATH` | `/orders/o-1` | always |
| `url.scheme` | `URL_SCHEME` | `http` | always |
| `server.address` | `SERVER_ADDRESS` | the request URL's host name | always |
| `server.port` | `SERVER_PORT` | `3000`, a number | when the request URL names a port |
| `client.address` | `CLIENT_ADDRESS` | the caller's address, as the app's `ip` option reads it | when there is one: not through `app.request` |
| `http.route` | `HTTP_ROUTE` | `/orders/:id` | once routing matched |
| `http.response.status_code` | `HTTP_STATUS` | `200`, a number | always |

They are the names of `@nxgt/telemetry-hono`, so a span from either reads
the same in a dashboard. The constants are exported for code that reads
spans back, a test for one:

```ts
import { HTTP_ROUTE, HTTP_STATUS } from '@alxia/telemetry';
import type { SpanRecord } from '@nxgt/telemetry';

function routeOf(span: SpanRecord): string {
	return `${String(span.attributes[HTTP_ROUTE])} ${String(span.attributes[HTTP_STATUS])}`;
}
```

All of them are the server span's own: a child span — a database call, an
outgoing request — and a log written inside the request carry its trace
and span ids, not the request's path, method or the client's address. An
attribute every log of a request should carry is yours to give, with
`@nxgt/telemetry`'s `withAttributes`: it reaches what runs inside it, so
a middleware declared after `telemetry()` covers the rest of the request:

```ts
import { alxia, defineMiddleware } from '@alxia/core';
import { telemetry } from '@alxia/telemetry';
import { withAttributes } from '@nxgt/telemetry';

const app = alxia()
	.use(telemetry({ service: 'shop' }))
	.use(
		defineMiddleware((ctx, next) =>
			withAttributes({ 'tenant.id': ctx.request.headers.get('x-tenant') ?? 'none' }, next),
		),
	);
```

## Across services

**In.** An inbound `traceparent` header continues its trace: the span takes
its trace id, and the caller's span id as its parent. A header that cannot
be read starts a fresh trace, as a request without one does.

**Out.** Inside a request, the current span says the header an outgoing
call should carry:

```ts
import { alxia } from '@alxia/core';
import { telemetry } from '@alxia/telemetry';
import { consoleExporter, span } from '@nxgt/telemetry';

const app = alxia()
	.use(telemetry({ service: 'checkout', exporters: [consoleExporter()] }))
	.post('/orders/:id/reserve', async ({ params, reply }) => {
		const stock = await span('stock.reserve', { kind: 'client' }, (scope) =>
			fetch(`https://stock.example.com/reserve/${params.id}`, {
				method: 'POST',
				headers: { traceparent: scope.traceparent() },
			}),
		);
		return reply(stock.ok ? 200 : 502, { reserved: stock.ok });
	});
```

`currentTraceparent()` from `@nxgt/telemetry` says the same thing without a
scope at hand. With httpyz, [`@nxgt/telemetry-httpyz`](https://www.npmjs.com/package/@nxgt/telemetry-httpyz)
does it for every call.

**Back.** With `traceResponse: true`, the response carries the span's
`traceparent`, so a caller can find the trace of the request it made:

```ts
import { alxia } from '@alxia/core';
import { telemetry } from '@alxia/telemetry';
import { consoleExporter } from '@nxgt/telemetry';

const app = alxia()
	.use(telemetry({ service: 'checkout', exporters: [consoleExporter()], traceResponse: true }))
	.get('/', ({ reply }) => reply(200, 'ok'));

const response = await app.request('/');
response.headers.get('traceparent'); // '00-<trace id>-<span id>-01'
```

## Options

`telemetry()` takes either a `service`, and builds the telemetry, or an
`instance`, and adopts it. Never both.

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `service` | `string` | required, without `instance` | the service name every signal groups by; the telemetry is built with `createTelemetry(service, options)` and installed |
| `instance` | `Telemetry` | required, without `service` | a telemetry you built: used as it is, neither installed nor closed by the middleware |
| `traced` | `(ctx: RequestContext) => boolean` | every request | whether a request gets a span |
| `spanName` | `(ctx: RequestContext) => string` | `"<METHOD> <path>"` | the span's name when it opens, kept when no route matches |
| `traceResponse` | `boolean` | `false` | sets `traceparent` on the response |

With `service`, every [`TelemetryOptions`](https://www.npmjs.com/package/@nxgt/telemetry)
of `@nxgt/telemetry` is accepted alongside:

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `version`, `environment` | `string` | none | stamped on every signal's resource |
| `attributes` | `Record<string, unknown>` | none | stamped on the resource too |
| `exporters` | `readonly Exporter[]` | none | where signals go, in order; with none, they go nowhere |
| `sampler` | `Sampler` | `alwaysSample` | which traces keep their spans; logs are never sampled |
| `minimum` | `Severity` | `info` | logs below it are never built |
| `stackTraces` | `boolean` | `true` | whether a recorded exception carries its stack |
| `batch`, `linger`, `drainTimeout` | `number` | `512`, `1000` ms, `10000` ms | when the pipeline flushes, and how long `close()` waits |
| `onExportError` | `(failure: unknown) => void` | `console.error` | what a failed export does |

### `service` or `instance`

`service` is the short way, for an app whose telemetry is this middleware's:
the telemetry is installed, so a logger used outside any request — at
start-up, in a job — finds it too.

```ts
import { telemetry } from '@alxia/telemetry';
import { consoleExporter } from '@nxgt/telemetry';

const tracing = telemetry({
	service: 'checkout',
	version: '1.4.0',
	environment: 'production',
	exporters: [consoleExporter()],
});
tracing.telemetry; // the Telemetry it built, to close on shutdown
```

`instance` is for a telemetry the app already has: built at start-up and
shared with a worker, or built per test.

```ts
import { alxia } from '@alxia/core';
import { telemetry } from '@alxia/telemetry';
import { consoleExporter, createTelemetry } from '@nxgt/telemetry';

const shared = createTelemetry('checkout', { exporters: [consoleExporter()] }).install();

const app = alxia().use(telemetry({ instance: shared }));
```

The middleware runs each traced request inside the instance, so the logs in it
reach it either way. Outside a request, and in a request `traced` said no
to, a logger only finds a telemetry that is installed: call `install()` on
an instance the whole process writes to, as above.

### `traced`

```ts
telemetry({
	service: 'checkout',
	exporters: [consoleExporter()],
	traced: (ctx) => ctx.url.pathname !== '/health' && ctx.url.pathname !== '/ready',
});
```

A request it says no to runs without a span: its routes read `span` as
`undefined`, and still read `telemetry`.

### `spanName`

```ts
telemetry({
	service: 'checkout',
	exporters: [consoleExporter()],
	spanName: (ctx) => `${ctx.request.method} ${ctx.url.pathname.split('/')[1] ?? ''}`,
});
```

It runs when the span opens, where `ctx.route` is already known, and is
`undefined` on a request no route matches. Once a route has matched, the
span is renamed after it whatever `spanName` said.

A `traced` or `spanName` that throws costs its answer, never the request:
the request is traced, or named `"<METHOD> <path>"`, and nothing is logged.

## What the routes read

```ts
import { alxia } from '@alxia/core';
import { telemetry } from '@alxia/telemetry';
import { consoleExporter } from '@nxgt/telemetry';

const app = alxia()
	.use(telemetry({ service: 'checkout', exporters: [consoleExporter()] }))
	.get('/orders/:id', ({ params, span, telemetry: current, reply }) => {
		span?.attribute('order.id', params.id);          // SpanScope | undefined
		span?.event('cache.miss');
		return reply(200, { service: current.resource.service });
	});
```

| Field | Type | What it is |
| --- | --- | --- |
| `span` | `SpanScope \| undefined` | the server span: `attribute`, `attributes`, `event`, `fail`, `traceparent()`, a writable `name` and `status`; `undefined` when `traced` said no |
| `telemetry` | `Telemetry` | the telemetry the middleware writes to, traced or not |

Only the routes declared after `use(telemetry(...))`, in the same app or
group, read them.

## Shutting down

The telemetry batches what it receives; `close()` ships the backlog, and
has to be awaited, or the last batch is lost. The middleware closes nothing,
not even a telemetry it built: close it in `onStop`, which `app.stop()`
runs, and stop the app when the process is asked to end.

```ts
import { alxia } from '@alxia/core';
import { telemetry } from '@alxia/telemetry';
import { consoleExporter } from '@nxgt/telemetry';

const tracing = telemetry({ service: 'checkout', exporters: [consoleExporter()] });

const app = alxia()
	.use(tracing)
	.get('/', ({ reply }) => reply(200, 'ok'))
	.onStop(() => tracing.telemetry.close());

app.listen(3000);

process.on('SIGTERM', async () => {
	await app.stop();
	process.exit(0);
});
```

Once closed, a telemetry takes nothing more: the app still answers, and
the spans of later requests are dropped.

## Sending to a collector

[`@nxgt/telemetry-otlp`](https://www.npmjs.com/package/@nxgt/telemetry-otlp)
ships to any OpenTelemetry collector:

```sh
bun add @nxgt/telemetry-otlp
```

```ts
import { alxia } from '@alxia/core';
import { telemetry } from '@alxia/telemetry';
import { ratioSampler } from '@nxgt/telemetry';
import { otlpExporter } from '@nxgt/telemetry-otlp';

const tracing = telemetry({
	service: 'checkout',
	version: '1.4.0',
	environment: 'production',
	sampler: ratioSampler(0.1),
	exporters: [otlpExporter({ endpoint: 'http://localhost:4318' })],
	traced: (ctx) => ctx.url.pathname !== '/health',
});

const app = alxia()
	.use(tracing)
	.get('/', ({ reply }) => reply(200, 'ok'))
	.onStop(() => tracing.telemetry.close());

app.listen(3000);
```

With `ratioSampler(0.1)`, one trace in ten keeps its spans. The others
still open one, so their logs carry a trace id, and `span` is defined in
the routes; it is only not exported.

## Testing

Give each test its own telemetry, as an `instance`, with an exporter that
keeps what it receives, and close it before reading: `close()` is what
flushes.

```ts
import { afterEach, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { telemetry } from '@alxia/telemetry';
import {
	createTelemetry,
	type Exporter,
	type Signal,
	type SpanRecord,
	uninstallTelemetry,
} from '@nxgt/telemetry';

afterEach(() => uninstallTelemetry());

test('a route gets one server span, named after it', async () => {
	const signals: Signal[] = [];
	const exporter: Exporter = {
		export(_resource, batch) {
			signals.push(...batch);
		},
	};
	const instance = createTelemetry('test', { exporters: [exporter] });
	const app = alxia()
		.use(telemetry({ instance }))
		.get('/users/:id', ({ params, reply }) => reply(200, { id: params.id }));

	await app.request('/users/7');
	await instance.close();

	const spans = signals.filter((signal): signal is SpanRecord => signal.type === 'span');
	expect(spans[0]?.name).toBe('GET /users/:id');
	expect(spans[0]?.attributes['http.response.status_code']).toBe(200);
});
```

An `instance` is not installed, so tests do not share one through the
process. A middleware built with `service` installs its telemetry for the whole
process; `uninstallTelemetry()` after each test takes it back out.

To continue a trace in a test, send the header a caller would:

```ts
await app.request('/users/1', {
	headers: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
});
// the span's trace id is 4bf92f3577b34da6a3ce929d0e0e4736, its parent 00f067aa0ba902b7
```

When something does not show up as expected, see
[Troubleshooting](troubleshooting.md).
