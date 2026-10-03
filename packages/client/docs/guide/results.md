# Reading results

This page covers what a call resolves to: a union with one member per
status the route may answer, so checking `status` or `ok` tells the
compiler what `data` is.

```ts
import { client } from '@alxia/client';
import type { App } from './server';

const api = client<App>('http://localhost:3000');

const result = await api.get('/users/:id', { params: { id: 1 } });
switch (result.status) {
	case 200:
		console.log(result.data.name); // string
		break;
	case 404:
		console.log(result.data.error); // 'not_found'
		break;
	case 400:
		console.log(result.data.issues); // the request was refused: which part, and why
		break;
	case 500:
		console.log(result.data.error); // 'internal'
		break;
}
```

for a route declared as:

```ts
alxia().get(
	'/users/:id',
	{
		params: z.object({ id: z.coerce.number() }),
		response: {
			200: z.object({ id: z.number(), name: z.string(), createdAt: z.date() }),
			404: z.object({ error: z.literal('not_found') }),
		},
	},
	({ params, reply }) => /* … */,
);
```

## `CallResult`

```ts
type CallResult<Output> = Output extends Outcome<infer Status, infer Data>
	? {
			readonly status: Status;
			readonly ok: Status extends SuccessStatus ? true : false;
			readonly data: Data;
			readonly response: Response;
		}
	: never;
```

| Field | What it is |
| --- | --- |
| `status` | the response's status: one of the route's statuses, as a literal |
| `ok` | `true` for a 2xx, `false` otherwise; narrows like `status` |
| `data` | the body, already read and decoded (below), typed by the status |
| `response` | the `Response` itself, for its headers; its body has been read |

A call does not throw for a status: a 404 or a 500 resolves like a 200.
It rejects only when no response arrives — the server cannot be reached,
the signal aborted — or when a body that says it is JSON is not
([Troubleshooting](../troubleshooting.md)).

## Which statuses are in the union

Every status the route may answer, as `@alxia/core` types it:

| Status | When it is in the union |
| --- | --- |
| each declared `response` status | the route has `response` schemas |
| each reply the handler returns | it has none |
| a redirect (`302`, `308`…), with `data: undefined` | the handler may return `redirect` |
| each reply of a `derive`, `wrap` or `onError` declared before the route | always: a guard's 401 is there |
| `400`, `ValidationErrorBody` | the route validates a part of its request, and no `onRefusal` hook is declared before it |
| each reply of the `onRefusal` hook declared before the route, in place of the 400 and the 413 | the route validates a part of its request, or has a `bodyLimit` |
| `413`, `ContentTooLargeBody` | the route has a `bodyLimit`, its own or from a `bodyLimit()` before it, and no `onRefusal` hook is declared before it, or one that may return nothing |
| `500`, `InternalErrorBody` | always |

So a route with no schema still reads its 500:

```ts
// app.get('/health', ({ reply }) => reply(200, 'ok'))
const health = await api.get('/health');
health.data; // 'ok' | InternalErrorBody
```

Not in the union: the 404, 405 and 426 an app answers **outside** every
route (a path or method that matches none), and a `Response` returned by a
global hook. A call that reaches one still resolves, with a status the type
does not list ([Troubleshooting](../troubleshooting.md#a-status-the-type-does-not-list)).

The full rules are in `@alxia/core`'s
[The app's type](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/types.md#output-every-outcome-a-client-may-read).

## Narrowing

`data` is a union until something narrows it; reading a field that only one
member has is a compile error:

```ts
const result = await api.get('/users/:id', { params: { id: 1 } });
result.data.name;
// error TS2339: Property 'name' does not exist on type 'ValidationErrorBody | InternalErrorBody | { id: number; name: string; createdAt: string; } | { error: "not_found"; }'.

if (result.status === 200) result.data.name; // string
```

`ok` narrows to the successes, or to every failure at once:

```ts
if (!result.ok) {
	result.status; // 404 | 400 | 500
	return;
}
result.data.name; // string
```

### The 400

A route that validates its request may answer `400` with the issues:

```ts
interface ValidationErrorBody {
	readonly error: 'validation';
	readonly issues: readonly {
		readonly target: 'params' | 'query' | 'headers' | 'cookies' | 'body' | 'message';
		readonly path: readonly (string | number)[];
		readonly code: string;
		readonly message: string;
	}[];
}
```

```ts
const created = await api.post('/users', { headers: { 'x-tenant': 'acme' }, body: { name: '' } });
if (created.status === 400) {
	for (const issue of created.data.issues) {
		console.log(issue.target, issue.path.join('.'), issue.message); // body name Too small: …
	}
}
```

The types already refuse most of what the server would: a 400 is what a
schema checks beyond its type — a minimum length, a format — or what came
from outside the types.

An app that answers refusals in its own format, with `@alxia/core`'s
[`onRefusal`](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/hooks.md#onrefusal),
gives the client that format in place of `ValidationErrorBody`. A problem
sent as `application/problem+json` is read as JSON, its members typed:

```ts
// server: .onRefusal((refusal) => refusal.kind === 'validation' ? problem({ type: 'urn:ietf:params:jmap:error:notRequest', status: 400, detail: `the ${refusal.part} is invalid` }) : undefined)
const sent = await api.post('/jmap', { body: { using: [] } });
if (sent.status === 400) {
	sent.data.type;   // 'urn:ietf:params:jmap:error:notRequest'
	sent.data.detail; // `the ${RequestPart} is invalid`
}
```

A hook that may return nothing for some refusals leaves the default 400
in the union beside its own.

## How `data` is read

The body is read once, before the call resolves, by the response's
`content-type`:

| Response | `data` |
| --- | --- |
| `204` or `304` | `undefined` |
| `text/event-stream` | an `AsyncIterable` of the events ([Events and sockets](events-and-sockets.md)) |
| a type containing `json` | the parsed JSON; `undefined` for an empty body |
| any other `text/*` | the text |
| anything else | a `Blob`; `undefined` for an empty body |

### As it crossed the wire

`data` is typed as JSON gives it back, not as the server held it:

| Server sends | `data` holds |
| --- | --- |
| a `Date` | its ISO 8601 `string` |
| a `Blob`, `ReadableStream`, `ArrayBuffer`, a typed array | a `Blob` |
| an async iterable of `T` | an `AsyncIterable` of `T` as JSON |
| a `Map` or a `Set` | `Record<string, never>`: an empty object |
| a function, a `bigint` | dropped |

```ts
if (result.status === 200) {
	result.data.createdAt; // string, though the schema says z.date()
	const createdAt = new Date(result.data.createdAt);
}
```

### The response

`response` is there for what is not the body: its headers above all.

```ts
const result = await api.get('/users/:id', { params: { id: 1 } });
const etag = result.response.headers.get('etag');
```

Its body is already read into `data`: `response.json()` throws
`TypeError: Body already used`, and `response.clone()` throws too.

## Redirects

Over HTTP, `fetch` follows redirects: a route that answers `302` resolves
to the status of the page it points to, which is not in the route's type.
To read the redirect itself, ask `fetch` not to follow it:

```ts
// app.get('/old', ({ redirect }) => redirect('/new'))
const moved = await api.get('/old', { init: { redirect: 'manual' } });
if (moved.status === 302) moved.response.headers.get('location'); // '/new'
```

In process (`client(app)`), there is no `fetch` to follow it: the `302`
comes back as is. In a browser, a manual redirect is an opaque response,
with status `0`.

## A realistic loader

A helper that turns a result into what a page renders, every status
handled:

```ts
import { client } from '@alxia/client';
import type { App } from './server';

const api = client<App>('https://api.example.com');

type User = { id: number; name: string; createdAt: string };

export async function loadUser(id: number): Promise<User | null> {
	const result = await api.get('/users/:id', { params: { id } });
	switch (result.status) {
		case 200:
			return result.data;
		case 404:
			return null;
		case 400:
			throw new Error(`refused: ${result.data.issues.map((issue) => issue.message).join(', ')}`);
		case 500:
			throw new Error('the server failed');
	}
}
```

Without a `default`, a status added to the route later — a 403 from a new
guard — makes this function a compile error until it is handled.

## See also

- [Calling routes](calls.md): what a call sends.
- [Events and sockets](events-and-sockets.md): a `data` that streams.
- [Troubleshooting](../troubleshooting.md): a call that rejects, or a status the type does not list.
