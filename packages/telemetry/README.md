# @alxia/telemetry

Traces and logs for [alxia](https://www.npmjs.com/package/@alxia/core), on
[`@nxgt/telemetry`](https://www.npmjs.com/package/@nxgt/telemetry): no
OpenTelemetry SDK, no dependency. One server span per request, around
everything the request runs, named for its route — and every log written
inside it carrying its trace id.

```sh
bun add @alxia/telemetry @nxgt/telemetry @alxia/core
bun add -d typescript
```

`@nxgt/telemetry` is a peer: the app's own copy, shared with its loggers.

## Usage

```ts
import { alxia } from '@alxia/core';
import { telemetry } from '@alxia/telemetry';
import { consoleExporter, createLogger } from '@nxgt/telemetry';

const tracing = telemetry({
	service: 'checkout',
	version: '1.4.0',
	exporters: [consoleExporter()], // or @nxgt/telemetry-otlp's otlpExporter
	traced: (ctx) => ctx.url.pathname !== '/health',
});

const log = createLogger('Orders');

const app = alxia()
	.use(tracing)
	.get('/orders/:id', ({ params, span, reply }) => {
		span?.attribute('order.id', params.id);
		log.info('order read');                 // carries this request's traceId
		return reply(200, { id: params.id });
	})
	.onStop(() => tracing.telemetry.close()); // awaited, or the last batch is lost

app.listen(3000);
```

## The span

- It is opened by the middleware: it holds every middleware after it, the
  handler, everything they await and the answer to an error. Give it to
  `use` first, so it wraps everything, a request no route matches included.
  A streamed body (a
  page rendered as it goes, an event stream) keeps it open until the body
  has been sent: one that fails midway makes it an error, a client that
  leaves adds an `http.response.aborted` event.
- An inbound `traceparent` continues its trace, as a child of the caller's
  span. An unusable one starts a fresh trace: the header came from a
  stranger.
- It starts as `GET /orders/o-1` and is renamed `GET /orders/:id` once
  routing has matched, with `http.route`: one dashboard row per route, not
  per order. A request no route matched (a 404, a 405) gets a span too, and
  keeps its path.
- A route's error is its exception. Only a 5xx, or a streamed body that
  fails midway, makes the span an error: a 401 a guard answered is the
  server working.
- `traceResponse: true` says the `traceparent` back on the response.

## What it records

| attribute | |
| --- | --- |
| `http.request.method`, `url.path`, `url.scheme` | the request |
| `server.address`, `server.port`, `client.address` | where it was addressed, and from |
| `http.route` | the route, once matched |
| `http.response.status_code` | the status |

They are `@nxgt/telemetry-hono`'s names: a span from either reads the same
in a dashboard.

## Options

The usual `@nxgt/telemetry` options and a `service`, or an existing
telemetry as `instance` — adopted, never closed. And:

| option | default | |
| --- | --- | --- |
| `traced` | every request | `(ctx) => boolean`: a health check |
| `spanName` | `"<METHOD> <path>"` | the name the span opens with; a matched route renames it |
| `traceResponse` | `false` | says `traceparent` back |

A `traced` or `spanName` that throws costs its answer, never the request.

## API

| export | |
| --- | --- |
| `telemetry(options)` | the middleware, given to `app.use`, with the telemetry it writes to as `.telemetry`; what is after it reads `span` and `telemetry` |
| `TelemetryContext` | what it adds to the context: `span` and `telemetry` |
| `TelemetryPluginOptions` | its options: `service` and `@nxgt/telemetry`'s options, or an `instance`; `traced`, `spanName`, `traceResponse` |
| `HTTP_METHOD`, `URL_PATH`, `URL_SCHEME`, `HTTP_ROUTE`, `HTTP_STATUS`, `SERVER_ADDRESS`, `SERVER_PORT`, `CLIENT_ADDRESS` | the attribute names a server span carries: `http.request.method`, `url.path`, `url.scheme`, `http.route`, `http.response.status_code`, `server.address`, `server.port`, `client.address` |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/telemetry/docs): the span each request gets and what it records, how a trace crosses services, every option with its default, shutting down, and testing.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/telemetry/docs/troubleshooting.md): a `tsc` error, an export failure, or a span or a log that is missing.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/telemetry/docs/roadmap.md): what is coming, and what is not planned.
