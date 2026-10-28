# Subscriptions for a BFF

This page is for a React Router app that is the backend of its own pages (a
BFF) and wants to show a GraphQL subscription in the browser: a room's
events, a chat, a live counter. The browser must not hold the API's token and
must not get an open pass-through to the API, so the app exposes **one
resource route** that checks the user's session, checks the operation, and
relays the API's server-sent events.

`@alxia/react-router/subscription` is that route. It imports nothing (web APIs
only) and adds no peer.

## Expose a subscription

```ts
// app/routes/events.ts: a resource route, served at /events
import { createSubscriptionProxy } from '@alxia/react-router/subscription';
import { cookies } from '../session.server';

const events = createSubscriptionProxy({
	endpoint: 'https://api.example.com/graphql',
	allow: ['RoomEvents', 'ChatMessages'],
	getToken: (request) => cookies.token(request),
	headers: (request) => ({
		'x-client-name': 'my-bff',
		'x-proxy-secret': process.env.PROXY_SECRET,
		'x-forwarded-for': request.headers.get('x-forwarded-for'),
		'accept-language': request.headers.get('accept-language'),
	}),
});

export const loader = events.loader; // GET: the operation in the query string
export const action = events.action; // POST: the operation in a JSON body
```

```ts
// app/routes.ts
import { route, type RouteConfig } from '@react-router/dev/routes';

export default [route('events', 'routes/events.ts')] satisfies RouteConfig;
```

The browser then talks to `/events` with any client that speaks GraphQL over
SSE in its distinct connections mode, such as `graphql-sse`:

```ts
import { createClient } from 'graphql-sse';

const client = createClient({ url: '/events', singleConnection: false });

const dispose = client.subscribe(
	{
		query: 'subscription RoomEvents($id: ID!) { roomEvents(id: $id) { id kind } }',
		operationName: 'RoomEvents',
		variables: { id: roomId },
	},
	{ next: show, error: report, complete: () => {} },
);
```

`graphql-sse` sends a POST by default and a GET with `credentials` for
`method: 'GET'`; both work, each through the matching export.

## What the proxy does

| Step | Rule |
| --- | --- |
| Session | `getToken(request)` gives the token, read on the server from the HttpOnly cookie. `null`, `undefined` or `''` answers **401** and nothing goes upstream. |
| Allow-list | The document is scanned for its top-level definitions. Every one must be a **named `subscription` listed in `allow`**: a mutation, a query, a shorthand `{ … }` or an anonymous subscription answers **403**, even beside an allowed one. A request with no `query` is allowed only when its persisted id (`extensions.persistedQuery.sha256Hash`, `extensions.documentId` or `extensions.id`) is listed. Malformed input answers **400**. Nothing refused is sent upstream. |
| Upstream request | A `POST` to `endpoint` with the client's `query`, `operationName`, `variables` and `extensions` untouched, `Accept: text/event-stream`, `Authorization: Bearer <token>` and your `headers`. The browser's own headers and cookies are never forwarded. |
| Relay | Whole events are relayed, in order. A heartbeat comment (`:`) goes out every `heartbeatMs` (15000 by default, `0` turns it off), never inside an event. |
| End | The upstream's `complete`, or the end of its stream, closes the client's stream. A stream that breaks sends a `next` with an `UPSTREAM_ERROR` and a `complete`. |
| Abort | When the browser closes the request, the upstream request is aborted: no subscription is left running. |
| Rate limit | An upstream **429** is passed through with `Retry-After` and `retryAfter` in the body (`{ "retryAfter": 12, "errors": [{ "extensions": { "code": "RATE_LIMITED", "retryAfter": 12 } }] }`), read from the upstream's header or body. The proxy never retries. |
| Other failures | An upstream 5xx, an unreachable API or an answer that is not an event stream is a **502** (`UPSTREAM_ERROR`); an upstream 4xx such as a 401 passes through as it is. |

The stream is answered with `Content-Type: text/event-stream`,
`Cache-Control: no-store, no-transform` and `X-Accel-Buffering: no`, so no
adapter or reverse proxy needs to buffer it.

## Options

| Option | |
| --- | --- |
| `endpoint` | the API's GraphQL URL (required) |
| `allow` | operation names, or persisted ids (required) |
| `getToken(request)` | the session's token, sync or async (required) |
| `headers` | a record, `Headers`, or `(request) => record`; a `null` or `undefined` value is left out |
| `heartbeatMs` | 15000 |
| `fetch` | the `fetch` used upstream (the global one); useful in specs |

## Keep the stream alive

Bun closes an idle connection after `idleTimeout` seconds (10 by default).
The heartbeat covers it as long as `heartbeatMs` is shorter, and so is a proxy's
read timeout. When the app is behind nginx, keep `proxy_buffering off` for the
route (the `X-Accel-Buffering: no` header does it per response).

## Cross-site requests

The route trusts the session cookie, like any other. Keep the cookie
`SameSite=Lax` (`sessionCookies` does): a cross-site POST then carries no
session and answers 401, and the allow-list limits what a same-site page can
start. Subscriptions are read-only; a mutation is never relayed.

## Testing

Give the proxy a fake API through `fetch`, or start a `Bun.serve` that
answers with an event stream, and call `events.action({ request })`; the
answer is a plain `Response`.
