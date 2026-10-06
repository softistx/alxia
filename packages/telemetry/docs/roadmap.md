# Roadmap

What `@alxia/telemetry` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/telemetry/CHANGELOG.md).

## Now

Nothing in progress.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A second telemetry implementation.** `@alxia/telemetry` is an adapter
  over `@nxgt/telemetry`, a peer: the spans, the logs, the sampling and the
  exporters are its, and so is everything they gain.
- **The OpenTelemetry SDK.** Signals go out through `@nxgt/telemetry`'s
  exporters — to a collector with `@nxgt/telemetry-otlp` — with no SDK and
  no runtime dependency.

## Shipped

### 0.7.2

- **The public port in a span.** `server.port` is the public port behind a trusted proxy that sends `X-Forwarded-Port`, read through core's `originalUrl(ctx)`.

### 0.7.0

- **The public scheme and host behind a proxy.** `url.scheme`,
  `server.address` and `server.port` read `originalUrl(ctx)`: behind
  `alxia({ proxy: trustProxy(…) })`, a request a trusted TLS proxy
  forwarded is traced as `https` and the public host, not the app's own.

### 0.6.0

- **Each operation over a socket.** A WebSocket upgrade gets a span that ends with its answer, and behind `@alxia/graphql`'s `ws: true` every query, mutation and subscription on the socket a span of its own, a child of the upgrade's: `subscription OnNote`, with `graphql.operation.*`, from its start to its end, an error when answered with errors ([guide](guide.md#the-operations-of-a-socket)).

### 0.5.0

- **The GraphQL operation on the span.** Behind `@alxia/graphql`, the span is named `query GetNotes` and carries `graphql.operation.name` and `graphql.operation.type`, OpenTelemetry's conventions; a batched body is `batch GetNotes,AddNote` ([guide](guide.md#a-graphql-operation)).

### 0.4.0

- **A middleware, not a plugin (0.4).** `app.use(telemetry({ ... }))` opens a span for every request, a 404 or a 405 included, around everything after it, and sees the response the client gets. `app.plugin(telemetry(...))`, the deprecated form, was removed in 0.5.

### 0.2.0

- **A streamed body is in its span.** A page rendered as it goes, or an
  event stream, keeps the server span open until its body has been sent:
  the span lasts to the last byte, a body that fails midway makes it an
  error, and a client that leaves midway adds an `http.response.aborted`
  event.

### 0.1.0

- **One server span per request.** `alxia().use(telemetry({ service, exporters }))`
  opens a span around everything a request runs — middlewares, handler, what
  they await — and every log written with `@nxgt/telemetry`'s
  `createLogger` inside it carries its trace id.
- **Named for the route.** The span is renamed `GET /orders/:id` once
  routing has matched, with `http.route`: one dashboard row per route.
- **Traces across services.** An inbound `traceparent` is continued, an
  unreadable one starts a fresh trace, and `traceResponse` says it back.
- **Errors where they belong.** A route's error is the span's exception;
  only a 5xx marks the span an error.
- **The same names as Hono's.** The attributes are
  `@nxgt/telemetry-hono`'s, exported as constants, so a span from either
  reads the same in a dashboard.
- **Your telemetry, or one built for you.** `service` with
  `@nxgt/telemetry`'s options, or an existing `instance`, adopted; `traced`
  and `spanName` to choose and name the spans. Routes read `span` and
  `telemetry`.
