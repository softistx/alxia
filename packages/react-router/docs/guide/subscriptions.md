# Subscriptions for a BFF

This page is for a React Router app that is the backend of its own pages (a
BFF) and wants to show a GraphQL subscription in the browser: a room's
events, a chat, a live counter. The browser must not hold the API's token and
must not be able to send the API a document of its own, so the app exposes
**one resource route** that checks the user's session, looks the operation up
in a list the server holds, and relays the API's server-sent events.

`@alxia/react-router/subscription` is that route. It imports nothing (web APIs only), so it adds no peer.

## Expose a subscription

`allow` maps each operation name to the **document the server sends for it**.
Build the map from your codegen's documents, so the text is the one your
client was generated from:

```ts
// app/routes/events.ts: a resource route, served at /events
import { createSubscriptionProxy } from '@alxia/react-router/subscription';
import { print } from 'graphql';
import { ChatMessagesDocument, RoomEventsDocument } from '../generated/graphql';
import { cookies } from '../session.server';

const events = createSubscriptionProxy({
	endpoint: 'https://api.example.com/graphql',
	allow: {
		RoomEvents: print(RoomEventsDocument), // a TypedDocumentNode
		ChatMessages: print(ChatMessagesDocument),
		// or the document string codegen exports, or a literal
	},
	getToken: (request) => cookies.token(request),
	headers: (request) => ({
		'x-client-name': 'my-bff',
		'x-proxy-secret': process.env.PROXY_SECRET,
		'x-forwarded-for': request.headers.get('x-forwarded-for'),
		'accept-language': request.headers.get('accept-language'),
	}),
});

export const loader = events.loader; // GET: operationName and variables in the query string
export const action = events.action; // POST: the same in a JSON body
```

```ts
// app/routes.ts
import { route, type RouteConfig } from '@react-router/dev/routes';

export default [route('events', 'routes/events.ts')] satisfies RouteConfig;
```

The browser talks to `/events` with a client that speaks GraphQL over SSE in
its distinct connections mode, such as `graphql-sse`. It names the operation
and sends its variables; the `query` it sends, as `graphql-sse` always does,
is **ignored**:

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

`graphql-sse` sends a POST by default and a GET for `method: 'GET'`; both
work, each through the matching export.

## What the proxy does

| Step | Rule |
| --- | --- |
| Same site | Both methods run the rule of `jsonActions`: an `Origin` that is not the app's own, or a `Sec-Fetch-Site` other than `same-origin` or `none`, is a **403** (`origin` sets the app's origin; the request's own by default). It reads headers only. A POST must be `application/json`, else **415**. |
| Session | `getToken(request)` gives the token, read on the server from the HttpOnly cookie. Empty, `null`, `undefined` or a token holding a line break is a **401**; nothing goes upstream. |
| Request | The client's `operationName` and `variables` are read. A body that cannot be read (the client left) is a **400**; a body past 64 KiB (`Content-Length` first, then the bytes read), a query string past 16 KiB or `variables` past 16 KiB is a **400**, as is malformed input. Its `query` and `extensions` are ignored. |
| Allow-list | Each document of `allow` must define `subscription <key>` and no other operation (fragments are fine), or `createSubscriptionProxy` throws a `TypeError` when it is created. `operationName` must be a key of `allow`, else **403**. The proxy sends **its own document** for it, with the client's variables: no document, fragment, extension or persisted id of the client's reaches the API. |
| Upstream request | A `POST` to `endpoint` with `Accept: text/event-stream`, `Authorization: Bearer <token>` and your `headers`. The browser's own headers and cookies are never forwarded. A header name or value no header can hold (a line break) is a worded **500**. |
| Relay | Whole events are relayed in order, as the client takes them: a slow client holds the upstream back instead of growing a buffer, and a heartbeat is skipped while one is waiting. A heartbeat comment (`:`) goes out every `heartbeatMs` (15000 by default, `0` turns it off), never inside an event. An event of more than 1 MiB with no end cuts the stream with an `UPSTREAM_ERROR`. |
| End | The upstream's `complete`, or the end of its stream, closes the client's stream. A stream that breaks sends a `next` with an `UPSTREAM_ERROR` and a `complete`. |
| Abort | When the browser closes the request, the upstream request is aborted: no subscription is left running. A request that is already aborted never starts one. |
| Rate limit | An upstream **429** is passed through with `Retry-After` and `retryAfter` in the body (`{ "retryAfter": 12, "errors": [{ "extensions": { "code": "RATE_LIMITED", "retryAfter": 12 } }] }`), read from the upstream's header or body. The proxy never retries. |
| Other failures | An upstream 5xx, an unreachable API or an answer that is not an event stream is a **502** (`UPSTREAM_ERROR`); an upstream 4xx such as a 401 passes through. |

The stream is answered with `Content-Type: text/event-stream`,
`Cache-Control: no-store, no-transform` and `X-Accel-Buffering: no`, so no
adapter or reverse proxy needs to buffer it.

## Options

| Option | |
| --- | --- |
| `endpoint` | the API's GraphQL URL (required) |
| `allow` | operation name to the document sent upstream (required); each document must define `subscription <name>`, that operation alone, checked when the proxy is created |
| `getToken(request)` | the session's token, sync or async (required) |
| `headers` | a record, `Headers`, or `(request) => record`; a `null` or `undefined` value is left out |
| `origin` | the app's origin for the same-site check, a string or a getter; the request's own by default |
| `heartbeatMs` | 15000 |
| `fetch` | the `fetch` used upstream (the global one); useful in specs |

## Keep the stream alive

Bun closes an idle connection after `idleTimeout` seconds (10 by default).
The heartbeat covers it as long as `heartbeatMs` is shorter, and so is a proxy's
read timeout. Behind nginx, keep `proxy_buffering off` for the route (the
`X-Accel-Buffering: no` header does it per response).

## Cross-site requests

Both methods refuse a request from another site (the rule above), and the
session cookie should stay `SameSite=Lax` (`sessionCookies` does it). The
allow-list is what the browser may start; because the documents are the
server's, it cannot start anything else, a mutation included. The route does
not stop a signed-in user from starting an allowed subscription as often as
they like: rate-limit it (`@alxia/rate-limit`) if the API does not.

## Testing

Give the proxy a fake API through `fetch`, or start a `Bun.serve` that
answers with an event stream, and call `events.action({ request })`; the
answer is a plain `Response`.
