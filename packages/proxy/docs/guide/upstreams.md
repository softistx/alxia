# Several upstreams

This page covers giving one proxy a list of upstreams: how each request
picks one, the one case where a request goes on to another, and how an
upstream that failed to connect is set aside for a while.

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const users = ['http://users-1.internal:8080', 'http://users-2.internal:8080', 'http://users-3.internal:8080'];

const app = alxia()
	.use('/api', proxy(users, { rewrite: '/api' }))
	.plugin(proxy.mount('/legacy', ['http://old-1:3000', 'http://old-2:3000']))
	.ws('/live', proxy.ws(['ws://chat-1.internal:8080', 'ws://chat-2.internal:8080']));
```

## The list

Wherever `proxy()`, `proxy.mount()` and `proxy.ws()` take a target, they
take a list of targets too: the same first argument, one URL or several.
A single URL is a list of one, and behaves exactly as it always has.

Each URL in the list is checked as a single target is, at declaration: an
absolute URL of an allowed scheme, with no query, fragment or credentials.
The list is fixed there; no request can add to it or choose from it, so the
proxy is no more an open relay with ten upstreams than with one (see
[Security](security.md#the-upstream-is-fixed)). An empty list throws.

Every option applies to every upstream: `rewrite`, `headers`, `timeout`,
`bodyLimit`. A redirect or a cookie is rebased against the upstream that
sent it.

## Round-robin

Each request takes the next upstream in the order given: with three, the
first request goes to the first, the fourth to the first again. A socket
route counts each upgrade as a request. The rotation is per proxy: two
`proxy()` calls given the same list rotate on their own.

## Retries: only a request no upstream received

A request goes on to the next upstream **only when the one it tried
provably never received a byte of it**:

| The attempt failed with | Retried | Why |
| --- | --- | --- |
| a refused connection (`ConnectionRefused`, `ECONNREFUSED`) | yes | nothing listens there: no byte left |
| a host name that does not resolve (`ENOTFOUND`, `EAI_AGAIN`) | yes | no connection was opened |
| a reset, or a connection closed before the headers (`ECONNRESET`, …) | no | the upstream may have received the request, or part of it |
| no headers within `timeout` (a 504) | no | Bun's `fetch` does not say whether the connect completed, so a timeout cannot prove the upstream never received the request |
| any answer, a `500` or a `503` included | no | the upstream's answer is passed back as it is |
| the client went away | no | there is nobody left to answer |

A request **with a body** goes on only if the first upstream never asked
for a chunk of it. The proxy reads the body as the upstream pulls it and
holds nothing back, so a body an upstream started reading cannot be sent
again; after a refused connect, no upstream asked, and the whole body goes
to the next one. The method does not matter: a `POST` whose connect was
refused is retried, because it never left; a `GET` that was reset is not,
because it did.

A socket route retries the same way, and only its connect: `proxy.ws()`
opens the upstream socket before it upgrades the client, so while the
connect fails (Bun closes the attempt with 1006 and `Failed to connect`),
the next upstream is tried, and the client is upgraded once one opens. An
upstream that answered the handshake with anything but a `101` was reached,
and is a 502.

`retries` is how many more upstreams one request may try after the first:
by default the number of upstreams − 1, so a request tries each upstream at
most once, and a single upstream is never retried. `0` turns retries off;
more than the number of upstreams − 1 throws, since trying again an
upstream that just refused the connection is pointless.

```ts
import { proxy } from '@alxia/proxy';

proxy(['http://a.internal', 'http://b.internal', 'http://c.internal'], { retries: 1 }); // at most two of the three
```

The `timeout` runs for each attempt. A retry follows a refused connect or a
failed lookup, which fail at once, so it adds next to nothing to the time a
request takes.

## Cooldown

An upstream whose connect failed is skipped by the rotation for `cooldown`
milliseconds (5 000 by default), so the requests that follow go straight to
the others instead of each paying a failed connect first. Once its cooldown
has passed, it is in the rotation again; the first request it answers puts
it back for good. `cooldown: 0` never skips one. Only a failed connect cools
an upstream down: one that resets, times out or answers a `500` stays in the
rotation.

When every upstream left for a request is cooling down, the proxy does not
answer a 502 at once: it tries the one that failed longest ago, the likeliest
to be back.

```ts
import { proxy } from '@alxia/proxy';

proxy(['http://a.internal', 'http://b.internal'], { cooldown: 30_000 });
```

The cooldown is passive: the proxy learns an upstream is down from the
requests it sends, and runs no health check of its own.

## When every upstream fails

The request gets the answer of the last upstream it tried, as with a single
target: a 502 `{"error":"bad_gateway"}`, or a 504 past `timeout`, in the
app's error format; for a socket route, before any `101`. The log line names
that last upstream. See [Failures](failures.md).

Next: [Failures](failures.md). A message you cannot place:
[Troubleshooting](../troubleshooting.md).
