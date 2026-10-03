# Replies

This page covers what a handler returns: `reply` with and without response
schemas, how a body is encoded, headers and cookies, redirects, and how a
thrown error becomes a response.

```ts
import { alxia } from '@alxia/core';
import { z } from 'zod';

const User = z.object({ id: z.number(), name: z.string() });

const app = alxia().get(
	'/users/:id',
	{
		params: z.object({ id: z.coerce.number() }),
		response: { 200: User, 404: z.object({ error: z.literal('not_found') }) },
	},
	({ params, reply }) =>
		params.id === 1 ? reply(200, { id: 1, name: 'Ada' }) : reply(404, { error: 'not_found' }),
);
```

## `reply(status, body?, init?)`

```ts
reply(201, user);
reply(204);                                         // no body
reply(200, csv, { headers: { 'content-type': 'text/csv' } });
```

| Argument | Type | Effect |
| --- | --- | --- |
| `status` | a `StatusCode` | the response status |
| `body` | depends on the route, below | encoded as in [Bodies](#how-a-body-is-sent) |
| `init.headers` | `HeadersInit` | headers of this reply, over those on `set.headers` — except `Vary`, whose names are added to theirs, and `Set-Cookie`, each of which is sent |

It returns a `Reply<Status, Body>`: a value, not a `Response`. A handler
cannot return a raw `Response`; that keeps every outcome in the route's
type.

### With response schemas

`response` maps each status the route may answer to the schema of its
body. `reply` then takes only a declared status, with a body the schema
**accepts** (its input):

```ts
app.get('/users', { response: { 200: User } }, ({ reply }) =>
	reply(201, { id: 1, name: 'x' }), // compile error: 201 is not declared
);
app.get('/users', { response: { 200: User } }, ({ reply }) =>
	reply(200, { id: '1', name: 'x' }), // compile error: the body does not match
);
```

At runtime the body is validated again, and the schema's **output** is
what is sent. An unknown key the schema strips — a password hash on a
database row — never leaves the server:

```ts
const row = { id: 1, name: 'Ada', password: 'secret' };
app.get('/me', { response: { 200: User } }, ({ reply }) => reply(200, row));
// → {"id":1,"name":"Ada"}
```

A body its schema refuses at runtime — data the types could not see, a
`JSON.parse`, a cast — is answered with a **500**, and the server logs a
`ResponseValidationError`:

```
GET /users/:id: the 200 reply does not match its schema: name: …
```

The client never reads a shape the route did not declare. A status the
route did not declare is a 500 too, and the server logs the route and the
status, with the issue code `undeclared_status` in `issues`:

```
ResponseValidationError: GET /users/:id declares no 201 reply
```

When the body may be `undefined` — `z.undefined()`, `.optional()` — it may
be left out: `reply(204)`.

### Without response schemas

Any status, any body. The body's type is still kept, so a client reads it:

```ts
app.get('/health', ({ reply }) => reply(200, { ok: true as const }));
// the client reads { status: 200, data: { ok: true } }
```

### Shortcuts

`reply` has one method per common status. Each one is the same reply as
`reply(status, body, init)`, checked and typed the same way, so the client
and the OpenAPI document cannot tell them apart:

| Shortcut | Is |
| --- | --- |
| `reply.ok(body?, init?)` | `reply(200, body, init)` |
| `reply.created(body?, init?)` | `reply(201, body, init)` |
| `reply.accepted(body?, init?)` | `reply(202, body, init)` |
| `reply.noContent(init?)` | `reply(204, undefined, init)` |
| `reply.badRequest(body?, init?)` | `reply(400, body, init)` |
| `reply.unauthorized(body?, init?)` | `reply(401, body, init)` |
| `reply.forbidden(body?, init?)` | `reply(403, body, init)` |
| `reply.notFound(body?, init?)` | `reply(404, body, init)` |
| `reply.conflict(body?, init?)` | `reply(409, body, init)` |
| `reply.html(status, html, init?)` | `reply(status, html, init)`, sent as `text/html;charset=utf-8` unless `init` sets a `content-type` |

```ts
app.get(
	'/users/:id',
	{ params: z.object({ id: z.coerce.number() }), response: { 200: User, 404: NotFound } },
	({ params, reply }) => {
		const user = users.get(params.id);
		return user ? reply.ok(user) : reply.notFound({ error: 'not_found' });
	},
);

app.delete('/users/:id', { response: { 204: z.undefined() } }, ({ reply }) => reply.noContent());
app.get('/', ({ reply }) => reply.html(200, '<h1>Welcome</h1>'));
```

The body may be left out where `reply(status)` may: always without
schemas, and where the status's schema takes `undefined` with them. With
`response` schemas, a route has a shortcut only for a status it declares —
`noContent` only when its 204 takes `undefined` — and its body is checked
the same way:

```ts
// response: { 200: User }
({ reply }) => reply.notFound({ error: 'not_found' }); // Property 'notFound' does not exist
({ reply }) => reply.html(200, '<p>…</p>');            // 200's schema takes no string
```

There is no `reply.json` and no `reply.text`: a string is already sent as
`text/plain` and an object as JSON ([How a body is sent](#how-a-body-is-sent)).
A hook's `reply` has the shortcuts too: `return reply.unauthorized({ error:
'unauthenticated' as const })` in a `derive` ends the request, and is added
to the type of every route after it, like `reply(401, …)`.

### `validateResponses`

```ts
const app = alxia({ validateResponses: false });
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `validateResponses` | `boolean` | `true` | `false` sends each declared reply as the handler gave it, unchecked and unstripped; socket messages too |

A status the route does not declare is still a 500. Turning validation off
also turns off the stripping: keep it on wherever a body may hold more than
its schema.

## How a body is sent

| Body | Sent as | Headers set |
| --- | --- | --- |
| `undefined`, or a status `101`, `204`, `205`, `304` | no body | — |
| a `string` | text | `content-type: text/plain;charset=utf-8` unless set, `content-length` |
| a `Blob` (a `Bun.file`), `ArrayBuffer`, typed array | as it is | `content-length` unless set, so an `onResponse` hook can read the size; the type `Response` sets |
| a `ReadableStream`, `FormData`, `URLSearchParams` | as it is | what `Response` sets: no `content-length` while the hooks run |
| an async iterable | [server-sent events](server-sent-events.md) | `content-type: text/event-stream`, `cache-control: no-cache`, `x-accel-buffering: no` |
| anything else | JSON | `content-type: application/json` unless set, `content-length` |

```ts
app.get('/report.pdf', ({ reply }) =>
	reply(200, Bun.file('./reports/latest.pdf'), {
		headers: { 'content-disposition': 'attachment; filename="report.pdf"' },
	}),
);
```

A client reads a binary body as a `Blob`, and a `Date` as the string JSON
makes of it ([The app's type](types.md#jsonifyt)).

## Headers and cookies: `set`

`set.headers` (a `Headers`) and `set.cookies` (a `Bun.CookieMap`) apply to
the reply the request ends with, whatever its status: the handler's, a
hook's, an `onError`'s, or the 400 of a refused request.

```ts
app.post('/login', { body: z.object({ user: z.string() }) }, ({ body, set, reply }) => {
	set.cookies.set('session', createSession(body.user), {
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		path: '/',
	});
	set.headers.set('cache-control', 'no-store');
	return reply(204);
});

app.post('/logout', ({ set, reply }) => {
	set.cookies.delete('session');
	return reply(204);
});
```

Each cookie set or deleted is one `Set-Cookie` header. `init.headers` on
the reply wins over `set.headers` for the same name, except `Set-Cookie`:
every one given — in `set.headers`, in `init.headers` (a `Headers` with
`append`), or through `set.cookies` — is sent. The 500 of an unhandled
error is sent without them.

To read cookies, declare them in the route's schema, or read
`ctx.cookies` without one ([Routes](routes.md#the-schema)).

## Redirects

```ts
app.get('/old', ({ redirect }) => redirect('/new'));        // 302
app.get('/docs', ({ redirect }) => redirect(new URL('https://example.com/docs'), 308));
```

```ts
type RedirectFunction = <const Status extends RedirectStatus = 302>(
	location: string | URL,
	status?: Status,
) => Reply<Status, undefined>;
```

`redirect` needs no response schema, even on a route that declares others:
the redirect is added to the route's outcomes.

## Errors

Prefer returning a reply: it is part of the route's type, and the client
reads it. When code deep in a call throws, the error goes, in order:

1. to the route's `onError` hooks, declared before it, in the order
   declared. The first to return a reply answers ([Hooks](hooks.md#onerror));
2. if it is an `HttpError`, it is answered with its status and body;
3. anything else is logged with `console.error` and answered
   `500 { "error": "internal" }`. Nothing of the error leaks.

```ts
import { alxia, HttpError } from '@alxia/core';

const app = alxia()
	.onError((error, { reply }) =>
		error instanceof RangeError ? reply(422, { error: 'range' as const }) : undefined,
	)
	.get('/range', () => {
		throw new RangeError(); // → 422 {"error":"range"}
	})
	.get('/teapot', () => {
		throw new HttpError(418, { error: 'teapot' }); // → 418 {"error":"teapot"}
	});
```

```ts
class HttpError<Status extends number = number, Body = unknown> extends Error {
	constructor(status: Status, body: Body, message?: string);
	readonly status: Status;
	readonly body: Body;
}
```

An `onError` reply is added to the type of the routes after it. A thrown
`HttpError` is not: the client reads it as a status the route never
declared.

Every route's type includes `500 { error: 'internal' }`
(`InternalErrorBody`), so a client always handles it.

## Problem details: `problem`

`problem(details, init?)` is a reply whose body is a problem as RFC 9457
(which obsoletes RFC 7807) defines it. Its status is the problem's
`status`, and its `content-type` is `application/problem+json` unless
`init` sets one. Every other member is an extension, kept as given and in
the body's type:

```ts
import { alxia, problem } from '@alxia/core';

const app = alxia().post('/upload', ({ request }) =>
	Number(request.headers.get('content-length')) > 50_000_000
		? problem({ type: 'urn:ietf:params:jmap:error:limit', status: 413, limit: 'maxSizeRequest' })
		: problem({ type: 'about:blank', status: 501, title: 'Not Implemented' }),
);
// the client reads 413 { type: 'urn:ietf:params:jmap:error:limit'; status: 413; limit: 'maxSizeRequest' }
```

```ts
interface ProblemDetails<Status extends ClientErrorStatus | ServerErrorStatus> {
	readonly type?: string;     // a URI; absent, it is about:blank
	readonly title?: string;
	readonly status: Status;    // the response's status
	readonly detail?: string;
	readonly instance?: string;
}
```

On a route with `response` schemas, a problem is a reply like any other:
its status must be declared and its body accepted by that status's schema.
[`onRefusal`](hooks.md#onrefusal) answers a refused request with one.
`@alxia/client` reads `application/problem+json` as JSON.

## Types

```ts
class Reply<Status extends number = number, Body = unknown> {
	readonly status: Status;
	readonly body: Body;
	readonly headers: HeadersInit | undefined;
}
type AnyReply = Reply<any, any>;
interface ReplyInit { readonly headers?: HeadersInit }
```

`TypedReplyFunction<Responses>` is `reply` with schemas,
`FreeReplyFunction` without — each with its shortcuts,
`TypedShortcuts<Responses>` and `FreeShortcuts`; `SHORTCUTS` maps each
shortcut to its status, and `Shortcuts` is its type — and `DeclaredReply<Responses>` every reply a
route with schemas may return. `HandlerResult<Schema>` is what its handler
may return.

## See also

- [Server-sent events](server-sent-events.md): a reply that streams.
- [Static files](static-files.md): files with ETags, ranges and 304s.
- [Hooks](hooks.md): replies that end a request before the handler.
