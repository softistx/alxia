# Roadmap

What `@alxia/telemetry` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/telemetry/CHANGELOG.md).

## Now

Nothing scheduled yet.

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

### 0.1.0

- **One server span per request.** `alxia().use(telemetry({ service, exporters }))`
  opens a span around everything a request runs — hooks, handler, what
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
