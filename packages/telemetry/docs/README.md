# @alxia/telemetry documentation

The [package README](../README.md) is the short version. This folder is
the long one: the span each request gets and what it records, how a trace
crosses services, every option with its default, and what to do when a
span or a log does not show up where you expected it.

| Page | Read it when |
| --- | --- |
| [Guide](guide.md) | choosing between `service` and `instance`, leaving a health check untraced, continuing a caller's trace or calling another service, closing the telemetry on shutdown, sending to a collector, or testing the spans |
| [Troubleshooting](troubleshooting.md) | `tsc` refused an option or a route, the server logged `[telemetry] export failed`, or a span or a log is missing or not what you expected |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |
