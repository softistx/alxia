# Calling routes

This page covers `client()` and the calls it makes: where they go, what
each one may send — params, query, headers, cookies, a body — and how each
value is put on the wire.

```ts
// server.ts
import { alxia } from '@alxia/core';
import { z } from 'zod';

export const app = alxia()
	.get(
		'/users/:id',
		{
			params: z.object({ id: z.coerce.number() }),
			response: { 200: z.object({ id: z.number(), name: z.string() }) },
		},
		({ params, reply }) => reply(200, { id: params.id, name: 'Ada' }),
	)
	.post(
		'/users',
		{
			headers: z.object({ 'x-tenant': z.string() }),
			body: z.object({ name: z.string().min(1) }),
			response: { 201: z.object({ name: z.string(), tenant: z.string() }) },
		},
		({ body, headers, reply }) => reply(201, { name: body.name, tenant: headers['x-tenant'] }),
	);

export type App = typeof app;
```

```ts
// anywhere else: a browser bundle, another service, a script
import { client } from '@alxia/client';
import type { App } from './server';

const api = client<App>('http://localhost:3000');

const user = await api.get('/users/:id', { params: { id: 1 } });
const created = await api.post('/users', {
	headers: { 'x-tenant': 'acme' },
	body: { name: 'Grace' },
});
```

Import the app **as a type**: the client needs `typeof app` only, so a
bundle built from this file holds none of the server's code.

## `client(target, options?)`

```ts
function client<App extends AppLike>(target: Target | App, options?: ClientOptions): Client<App>;

type Target =
	| string
	| URL
	| { readonly fetch: (request: Request) => Promise<Response> };

interface ClientOptions {
	readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
	readonly fetch?: (request: Request) => Promise<Response>;
}
```

### The target

| Target | Calls go | Type the client with |
| --- | --- | --- |
| a base URL, `string` or `URL` | over HTTP, to the base URL followed by the route's path | `client<App>(url)` |
| the app itself | to its `fetch`, in process: no server, no port | `client(app)`, inferred |
| anything with `fetch(request)` | to that function | `client<App>(handler)` |

The base URL may carry a path: `client<App>('https://example.com/api')`
calls `https://example.com/api/users/1`. Trailing slashes are dropped. It
must be absolute, even in a browser: `'/api'` alone fails every call with
`TypeError: Invalid URL` ([Troubleshooting](../troubleshooting.md#typeerror-invalid-url));
`new URL('/api', location.origin)` is the same origin, absolute.

In process, the request's URL is `http://alxia.local/<path>`: a handler
that reads `request.url` sees that host. Testing in process is on
[Testing](testing.md).

### Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `headers` | `HeadersInit`, or a function returning one or its promise | none | Sent with every call. A function is called on every call, so a token read there is always the current one. A socket sends an object only, and only under Bun ([sockets](events-and-sockets.md)). |
| `fetch` | `(request: Request) => Promise<Response>` | the global `fetch` | What a URL target calls. Ignored when the target is an app or a handler: that is already the `fetch`. |

```ts
import { client } from '@alxia/client';
import type { App } from './server';

declare function currentToken(): Promise<string>;

const api = client<App>('https://api.example.com', {
	headers: async () => ({ authorization: `Bearer ${await currentToken()}` }),
	fetch: async (request) => {
		const started = performance.now();
		const response = await fetch(request);
		console.log(request.method, request.url, response.status, performance.now() - started);
		return response;
	},
});
```

## The client's methods

The client has one method per HTTP method the app answers — `get`, `post`,
`put`, `patch`, `delete`, `options`, `head`, `query` — and `ws` when it declares a
socket ([Events and sockets](events-and-sockets.md)). A method the app does
not answer is not on the type: `api.put` on an app without a `PUT` route is
a compile error.

```ts
type CallMethod<Routes, M extends Method> = <const Path extends PathsFor<Routes, M>>(
	path: Path,
	...args: CallArgs<InputOf<Routes, Path, M>>
) => Promise<CallResult<OutputOf<Routes, Path, M>>>;
```

The path is the route's path **as declared**, parameters included —
`'/users/:id'`, not `'/users/1'` — and only a path that answers that method
compiles. The second argument is required when the route needs something
(a parameter, a required header or body), and optional otherwise.

## What a call may send

| Option | Present when | Typed as | Sent as |
| --- | --- | --- | --- |
| `params` | the path has parameters | `{ [name]: string \| number }` | each value encoded into the path |
| `query` | the route has a `query` schema | the schema's input | the query string |
| `headers` | the route has a `headers` schema | the schema's input | request headers |
| `cookies` | the route has a `cookies` schema | the schema's input, always optional | the `cookie` header |
| `body` | the route has a `body` schema | the schema's input | JSON, or as is (below) |
| `init` | always | `Omit<RequestInit, 'method' \| 'body'>` | merged into the request: `cache`, `credentials`, `redirect`, extra `headers`… |
| `signal` | always | `AbortSignal` | the request's signal; wins over `init.signal` |

What `params`, `query`, `headers`, `cookies` and `body` are typed as comes
from the route: see [The app's type](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/types.md#input-what-a-client-sends)
in `@alxia/core`'s guide. A schema that coerces with `z.coerce` has
`unknown` as its input, so the client accepts anything there;
[`@alxia/zod`](https://www.npmjs.com/package/@alxia/zod)'s `zq` keeps the
type a caller means to send.

### Params

```ts
await api.get('/users/:id', { params: { id: 'a b' } }); // GET /users/a%20b
await api.get('/files/*', { params: { '*': 'docs/a b.txt' } }); // GET /files/docs/a%20b.txt
```

Each value is encoded with `encodeURIComponent`. A wildcard keeps its
slashes and encodes each segment between them. `fillPath`, exported, does
the same for a path you build yourself:

```ts
import { fillPath } from '@alxia/client';

fillPath('/users/:id', { id: 'a b' }); // '/users/a%20b'
fillPath('/files/*', { '*': 'a b/c' }); // '/files/a%20b/c'
fillPath('/users/:id', {}); // throws TypeError: /users/:id: the parameter :id is missing
```

### Query, headers and cookies

```ts
await api.get('/search', {
	query: { tag: ['a', 'b'], since: new Date('2026-01-01'), page: undefined },
});
// GET /search?tag=a&tag=b&since=2026-01-01T00%3A00%3A00.000Z
```

| Value | Sent as |
| --- | --- |
| an array (query only) | the key repeated, once per item |
| `undefined` | nothing: the key is left out |
| a `Date` | ISO 8601 |
| any other object | its JSON |
| anything else | `String(value)` |

Cookies are joined into one `cookie` header, each name and value encoded
with `encodeURIComponent`. That works from Bun or Node. In a browser,
`cookie` is a header `fetch` may not set, so typed cookies are dropped
there: the browser sends the origin's own cookies instead, given
`init: { credentials: 'include' }` across origins.

### Bodies

```ts
await api.post('/users', { headers: { 'x-tenant': 'acme' }, body: { name: 'Grace' } });
// content-type: application/json, body: {"name":"Grace"}
```

| Body | Sent as | `content-type` set to |
| --- | --- | --- |
| a `string` | as is | `text/plain;charset=utf-8` |
| `FormData`, `URLSearchParams`, `Blob`, `ArrayBuffer`, a typed array, a `ReadableStream` | as is | what `fetch` sets for it, if anything |
| anything else | `JSON.stringify(body)` | `application/json` |

A `QUERY` route — a read whose criteria travel in the body — is called the
same way, and its result is read like a `GET`'s:

```ts
const found = await api.query('/users/search', { body: { name: 'Ada' } });
if (found.status === 200) found.data; // typed by the route's 200
```

A `content-type` you send — in `ClientOptions.headers`, `init.headers` or
the route's typed `headers` — is never replaced.

### Headers: which wins

From lowest to highest, a later one replacing an earlier one of the same
name:

1. `ClientOptions.headers`, for every call;
2. `init.headers`, for this call;
3. the route's typed `headers`, for this call;
4. `cookies`, appended to any `cookie` header already set.

```ts
const api = client<App>('http://localhost:3000', { headers: { 'accept-language': 'en' } });
await api.get('/users/:id', {
	params: { id: 1 },
	init: { headers: { 'accept-language': 'fr' } }, // this call is sent in French
});
```

### Cancelling

```ts
const result = await api.get('/users/:id', {
	params: { id: 1 },
	signal: AbortSignal.timeout(5_000),
});
```

An aborted call rejects with the signal's error — `AbortError` for
`abort()`, `TimeoutError` for `AbortSignal.timeout` — and never resolves to
a result ([Troubleshooting](../troubleshooting.md#aborterror-the-operation-was-aborted)).
In process, with `client(app)`, the call rejects the same way, as soon as
the signal aborts; the handler is not stopped, and runs to its end with
nothing to answer.

## A realistic client

A browser module that every component imports, the token read on each call:

```ts
// api.ts
import { client } from '@alxia/client';
import type { App } from '../server/app';

export const api = client<App>(new URL('/api', location.origin), {
	headers: () => {
		const token = localStorage.getItem('token');
		return token ? { authorization: `Bearer ${token}` } : {};
	},
});
```

```ts
// user-page.ts
import { api } from './api';

export async function loadUser(id: number) {
	const result = await api.get('/users/:id', { params: { id }, init: { cache: 'no-store' } });
	if (result.status === 200) return result.data;
	if (result.status === 404) return null;
	throw new Error(`GET /users/${id} answered ${result.status}`);
}
```

What the result holds, and how to read it, is on
[Reading results](results.md).

## See also

- [Reading results](results.md): `status`, `ok`, `data` and `response`.
- [Events and sockets](events-and-sockets.md): `text/event-stream` and `api.ws()`.
- [Testing](testing.md): calling the app in process, and testing its types.
