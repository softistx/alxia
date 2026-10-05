# Failures

This page covers what a client gets when the upstream fails, is slow, or the
request is too large, and what happens when the client leaves or the app shuts
down.

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia({ errors: 'problem' }).use(
	'/api',
	proxy('http://users.internal:8080', { rewrite: '/api', timeout: 5_000, bodyLimit: 1024 * 1024 }),
);
```

## The answers

| Case | Status | Body | Message in the logs, never sent |
| --- | --- | --- | --- |
| refused, unreachable, or reset before the headers | 502 | `{"error":"bad_gateway"}` | `proxy: <origin> failed: ConnectionRefused` |
| no response headers within `timeout` | 504 | `{"error":"gateway_timeout"}` | `proxy: <origin> sent no response within 5000 ms` |
| body over `bodyLimit` | 413 | the app's own format (`ContentTooLargeError`) | |
| `rewrite` climbs out of the target's path | 400 | `{"error":"bad_request"}` | `proxy: the path "<path>" rewrites outside the target's path "<base>"` |

Under `alxia({ errors: 'problem' })` they are RFC 9457 problems
(`application/problem+json`): `Bad Gateway`, detail `The upstream server could not be reached`;
`Gateway Timeout`, detail `The upstream server did not answer in time`; and for the 400,
detail `The request path leaves the upstream path`. The body never names the upstream.

They are thrown as `HttpError`s, so a logger or telemetry middleware declared
before the proxy sees them:

```ts
import { alxia } from '@alxia/core';
import { proxy, type BadGatewayBody } from '@alxia/proxy';

const res = await alxia()
	.use('/api', proxy('http://127.0.0.1:1'))
	.request('/api/x');
const body = (await res.json()) as BadGatewayBody; // { error: 'bad_gateway' }
```

The bodies are typed: `BadGatewayBody`, `GatewayTimeoutBody` and `OutsideTargetBody`.

## `timeout`

`timeout` (default `30_000` ms, above 0) is how long the exchange may stay
silent before the upstream sends the response's **headers**: it counts from
the request, and again from each chunk of the request body sent, so a long
upload that keeps moving is never cut, while a client or an upstream that
stalls for `timeout` is a 504. A slow body after the headers is not cut, so
server-sent events live on. An upstream that holds its headers until the first
chunk of its body counts as slow. A bad value throws a `TypeError` at
declaration.

A failure after the headers, an upstream that dies mid-body, cannot change the
status: the client's connection is cut.

## `bodyLimit`

Bytes, counted as the body streams. A declared `Content-Length` over it fails
before a byte is read. A route's own `bodyLimit` also counts when the proxy is
that route's middleware. The app-level `bodyLimit()` covers routes only, not a
request no route matches, so for `use('/api', proxy(…))` give the proxy its own.
Bun's `maxRequestBodySize` (128 MiB by default, `listen({ maxRequestBodySize })`)
applies before anything, and answers 413 itself.

## A client that leaves, a shutdown

- A client that aborts aborts the upstream request; observers see core's 499.
- On `SIGTERM`, `SIGINT` or `stop()`, proxied requests in flight drain within
  `shutdownTimeout`; when the server closes what is left, their upstream
  requests are aborted. A proxied `text/event-stream` ends at once.

Next: [WebSockets](websockets.md). A message you cannot place: [Troubleshooting](../troubleshooting.md).
