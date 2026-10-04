# Troubleshooting

Each entry is headed by the text you see: an error from `tsc`, a line in
the server log, or, for what prints nothing, what you see in your traces.

**Types**

- [`Property 'span' does not exist on type 'Context<…>'`](#property-span-does-not-exist-on-type-context)
- [`Type 'Alxia<Empty, "", never>' is not assignable to type 'TelemetryPluginOptions'`](#type-alxiaempty--never-is-not-assignable-to-type-telemetrypluginoptions)
- [`Property 'service' is missing in type '…' but required in type '{ readonly service: string; readonly instance?: undefined; }'`](#property-service-is-missing-in-type--but-required-in-type--readonly-service-string-readonly-instance-undefined-)
- [`Type 'Telemetry' is not assignable to type 'undefined'`](#type-telemetry-is-not-assignable-to-type-undefined)
- [`Object literal may only specify known properties, and 'version' does not exist in type 'Hooks & { readonly instance: Telemetry; … }'`](#object-literal-may-only-specify-known-properties-and-version-does-not-exist-in-type-hooks---readonly-instance-telemetry--)
- [`Type 'string | undefined' is not assignable to type 'string'` in `spanName`](#type-string--undefined-is-not-assignable-to-type-string-in-spanname)

**Server log**

- [`[telemetry] export failed`](#telemetry-export-failed)

**Missing signals**

- [Nothing is exported, or the last requests are missing](#nothing-is-exported-or-the-last-requests-are-missing)
- [A log written in a route has no `traceId`, or never arrives](#a-log-written-in-a-route-has-no-traceid-or-never-arrives)
- [A log written outside a request never arrives](#a-log-written-outside-a-request-never-arrives)
- [Logs carry a `traceId`, but its span is never exported](#logs-carry-a-traceid-but-its-span-is-never-exported)
- [Spans stop arriving, and the app still answers](#spans-stop-arriving-and-the-app-still-answers)
- [No span for a WebSocket connection](#no-span-for-a-websocket-connection)
- [The response has no `traceparent` header](#the-response-has-no-traceparent-header)

**Unexpected spans**

- [The span starts a new trace although the caller sent `traceparent`](#the-span-starts-a-new-trace-although-the-caller-sent-traceparent)
- [`spanName` only shows on requests no route matched](#spanname-only-shows-on-requests-no-route-matched)
- [A streamed request's span lasts as long as its stream](#a-streamed-requests-span-lasts-as-long-as-its-stream)
- [A span has an exception, and its status is `ok`](#a-span-has-an-exception-and-its-status-is-ok)

## Types

### `Property 'span' does not exist on type 'Context<…>'`

```text
error TS2339: Property 'span' does not exist on type 'Context<Empty, "/before", Empty>'.
```

**When:** a route reads `span` or `telemetry`, and is declared before
`plugin(telemetry(...))`.

**Why:** the plugin gives `span` and `telemetry` to the routes declared
after it. The request is still traced, since the span is opened by a global
hook; the route only cannot reach it.

**Fix:** mount the plugin first:

```ts
const app = alxia()
	.plugin(telemetry({ service: 'checkout', exporters: [consoleExporter()] }))
	.get('/orders/:id', ({ params, span, reply }) => {
		span?.attribute('order.id', params.id);
		return reply(200, { id: params.id });
	});
```

### `Type 'Alxia<Empty, "", never>' is not assignable to type 'TelemetryPluginOptions'`

```text
error TS2769: No overload matches this call.
  Overload 1 of 2, '(plugin: (app: Alxia<Empty, "", never>) => …): …', gave the following error.
    Argument of type '(options: TelemetryPluginOptions) => …' is not assignable to parameter of type '(app: Alxia<Empty, "", never>) => …'.
      Types of parameters 'options' and 'app' are incompatible.
        Type 'Alxia<Empty, "", never>' is not assignable to type 'TelemetryPluginOptions'.
```

**When:** `app.plugin(telemetry)`, without calling it.

**Why:** `telemetry` makes the plugin; it is not the plugin, and it needs a
`service` or an `instance`.

**Fix:**

```ts
alxia().plugin(telemetry({ service: 'checkout', exporters: [consoleExporter()] }));
```

### `Property 'service' is missing in type '…' but required in type '{ readonly service: string; readonly instance?: undefined; }'`

```text
error TS2345: Argument of type '{ exporters: never[]; }' is not assignable to parameter of type 'TelemetryPluginOptions'.
  Type '{ exporters: never[]; }' is not assignable to type 'Hooks & TelemetryOptions & { readonly service: string; readonly instance?: undefined; }'.
    Property 'service' is missing in type '{ exporters: never[]; }' but required in type '{ readonly service: string; readonly instance?: undefined; }'.
```

**When:** `telemetry({ exporters: [...] })`, with neither `service` nor
`instance`.

**Why:** the telemetry the plugin builds needs a service name: every signal
groups by it, and there is no default.

**Fix:** name the service, or hand over a telemetry you built:

```ts
telemetry({ service: 'checkout', exporters: [consoleExporter()] });
```

### `Type 'Telemetry' is not assignable to type 'undefined'`

```text
error TS2345: Argument of type '{ service: string; instance: Telemetry; }' is not assignable to parameter of type 'TelemetryPluginOptions'.
  Types of property 'instance' are incompatible.
    Type 'Telemetry' is not assignable to type 'undefined'.
```

**When:** `telemetry({ service, instance })`.

**Why:** `service` builds a telemetry, `instance` adopts one; the plugin
writes to exactly one.

**Fix:** keep `instance`, whose service name was given to `createTelemetry`:

```ts
const instance = createTelemetry('checkout', { exporters: [consoleExporter()] });

telemetry({ instance });
```

### `Object literal may only specify known properties, and 'version' does not exist in type 'Hooks & { readonly instance: Telemetry; … }'`

```text
error TS2353: Object literal may only specify known properties, and 'version' does not exist in type 'Hooks & { readonly instance: Telemetry; readonly service?: undefined; }'.
```

The same for `exporters`, `sampler`, `environment`, or any other
`@nxgt/telemetry` option.

**When:** `@nxgt/telemetry` options next to `instance`.

**Why:** an adopted telemetry is already built; the plugin cannot change
its exporters or its resource.

**Fix:** give them to `createTelemetry`:

```ts
const instance = createTelemetry('checkout', {
	version: '1.4.0',
	exporters: [consoleExporter()],
});

telemetry({ instance, traceResponse: true });
```

### `Type 'string | undefined' is not assignable to type 'string'` in `spanName`

```text
error TS2322: Type '(ctx: RequestContext) => string | undefined' is not assignable to type '(ctx: RequestContext) => string'.
  Type 'string | undefined' is not assignable to type 'string'.
    Type 'undefined' is not assignable to type 'string'.
```

**When:** `spanName: (ctx) => ctx.route`.

**Why:** `spanName` runs before routing, where `ctx.route` is always
`undefined`. The route already names the span once it matches.

**Fix:** name what routing has not matched from the path, or leave
`spanName` out:

```ts
telemetry({
	service: 'checkout',
	exporters: [consoleExporter()],
	spanName: (ctx) => `${ctx.request.method} unmatched`,
});
```

## Server log

### `[telemetry] export failed`

Followed by the exporter's error, such as
`OtlpUnreachableError: [telemetry] http://localhost:4318/v1/traces did not answer for traces after 3 attempt(s)`.

**When:** an exporter throws or rejects: a collector that is down, a wrong
endpoint, a refused key.

**Why:** `@nxgt/telemetry` reports a failed export through
`onExportError`, which is `console.error` by default. The request it came
from was answered long before: an export never costs a request.

**Fix:** point the exporter at a collector that answers, and send the
failures where you want them:

```ts
telemetry({
	service: 'checkout',
	exporters: [otlpExporter({ endpoint: 'http://localhost:4318' })],
	onExportError: (failure) => metrics.increment('telemetry.export_failed', String(failure)),
});
```

## Missing signals

### Nothing is exported, or the last requests are missing

**When:** a script or a test exits right after its requests, or a server
is stopped, and the last spans and logs never reach the exporter — with
`consoleExporter()`, nothing is printed.

**Why:** the telemetry batches signals, and ships a batch when it is full
or a second after it started. A process that exits first loses it. The
plugin never closes the telemetry, not even one it built from `service`.

**Fix:** close it in `onStop`, await `app.stop()` on shutdown, and await
`close()` in a script or a test before reading what was exported:

```ts
const app = alxia()
	.plugin(tracing)
	.onStop(() => tracing.telemetry.close());

process.on('SIGTERM', async () => {
	await app.stop();
	process.exit(0);
});
```

### A log written in a route has no `traceId`, or never arrives

**When:** a span is exported for the request, but a `log.info` inside it
is missing, or arrives without `span`.

**Why:** the logger comes from another copy of `@nxgt/telemetry` than the
one `@alxia/telemetry` uses: the request's span is held by one copy, and
the other cannot see it. It is a peer for that reason, and a second copy
appears when a package depends on a version the app's range does not
satisfy.

**Fix:** keep one copy, with a single range for every package that needs
it, and check:

```sh
bun pm ls --all | grep @nxgt/telemetry@
```

### A log written outside a request never arrives

**When:** a log at start-up, in a job or a timer, or in a request `traced`
said no to, while the logs in traced requests arrive.

**Why:** the plugin was given an `instance`. It runs each traced request
inside that telemetry, but does not install it, so a logger with no request
around it finds none.

**Fix:** install the instance the whole process writes to:

```ts
const instance = createTelemetry('checkout', { exporters: [consoleExporter()] }).install();

alxia().plugin(telemetry({ instance }));
```

### Logs carry a `traceId`, but its span is never exported

**When:** a `sampler` such as `ratioSampler(0.1)` is set; most requests
have logs with a trace id that no span in the backend has.

**Why:** a sampler decides which traces keep their spans; logs are never
sampled. A sampled-out request still opens its span, so `span` is defined
in the route and the logs carry its ids, but the span is not exported.

**Fix:** that is sampling working. Raise the ratio, or sample nothing out:

```ts
telemetry({ service: 'checkout', sampler: alwaysSample, exporters: [consoleExporter()] });
```

### Spans stop arriving, and the app still answers

**When:** after `close()` on the plugin's telemetry — often a test that
closes it in one case and sends requests in the next.

**Why:** a closed telemetry takes nothing more, and the plugin keeps
writing to it; the requests are answered as usual.

**Fix:** build a plugin, with its own telemetry, per test:

```ts
const instance = createTelemetry('test', { exporters: [exporter] });
const app = alxia().plugin(telemetry({ instance }));
```

### No span for a WebSocket connection

**When:** a route declared with `app.ws`.

**Why:** `@alxia/core` runs no `around` hook for a WebSocket upgrade, as
there is no response to wrap, and the span is opened by one.

**Fix:** open a span for the work a message does:

```ts
app.ws('/rooms/:room', {}, {
	message: (socket, message) =>
		span('room.message', () => socket.send(String(message))),
});
```

### The response has no `traceparent` header

**When:** a caller looks for the trace of the request it made.

**Why:** the plugin says `traceparent` back only with `traceResponse`, and
only on a request `traced` let through.

**Fix:**

```ts
telemetry({ service: 'checkout', exporters: [consoleExporter()], traceResponse: true });
```

## Unexpected spans

### The span starts a new trace although the caller sent `traceparent`

**When:** the server span has no parent, and a trace id of its own.

**Why:** the header could not be read as a W3C `traceparent`: a header from
a stranger is not trusted, so a fresh trace starts.

**Fix:** send the header the caller's current span says, unchanged, in the
`00-<32 hex trace id>-<16 hex span id>-<2 hex flags>` form:

```ts
await fetch('https://checkout.example.com/orders/o-1', {
	headers: { traceparent: currentTraceparent() ?? '' },
});
```

### `spanName` only shows on requests no route matched

**When:** a `spanName` is set, and the matched requests are still named
`GET /orders/:id`.

**Why:** `spanName` is the name before routing. Once a route matches, the
span is renamed `"<METHOD> <route>"`, so a dashboard has one row per route.

**Fix:** to add to a routed span, set an attribute rather than the name:

```ts
app.get('/orders/:id', ({ params, span, reply }) => {
	span?.attribute('order.id', params.id);
	return reply(200, { id: params.id });
});
```

### A streamed request's span lasts as long as its stream

**When:** the span of a page streamed as it renders, or of an event
stream, lasts seconds or minutes, or ends only when the client closes the
tab, with an `http.response.aborted` event.

**Why:** a streamed body keeps the server span open until it has been
sent, so the span measures what the client received. An event stream
that never ends on its own ends its span when its client leaves; the
event says so, and the status stays `ok`: the server did nothing wrong.

**Fix:** none is needed. To keep an event stream out of a latency
dashboard, filter on its route, or leave it untraced:

```ts
app.plugin(telemetry({ service: 'checkout', exporters, traced: (ctx) => ctx.url.pathname !== '/events' }));
```

### A span has an exception, and its status is `ok`

**When:** a route throws, and an `onError` hook answers with a `4xx`.

**Why:** the error is recorded as the span's exception, but only a
`5xx`, or a streamed body that fails midway, makes a span an error: a
`400` the app chose to answer is the server working.

**Fix:** none needed. For an error that should mark the span, answer it
with a `5xx`, or let it throw to the `500`.
