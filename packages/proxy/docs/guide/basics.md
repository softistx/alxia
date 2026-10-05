# The basics

This page covers forwarding requests to one upstream: giving `proxy()` to
`use()`, stripping a prefix, what is kept and streamed, and where the proxy
sits among your routes.

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia()
	.use('/api', proxy('http://users.internal:8080', { rewrite: '/api' }));

app.listen({ port: 3000 });
```

`GET /api/users?page=2` reaches `http://users.internal:8080/users?page=2`: the
method, the headers, the body and the query string go as they came, and the
upstream's response comes back as it was. Install with
`bun add @alxia/proxy @alxia/core`.

```ts no-check
function proxy<Ctx = unknown>(target: string | URL, options?: ProxyOptions<Ctx>): ProxyMiddleware<Ctx>;
```

## The target

An absolute `http:` or `https:` URL, checked once where the proxy is
declared, with no query, fragment or credentials. A path in it is the base of
every upstream path: `proxy('http://up:8080/v2')` sends `/users` to `/v2/users`.
A target that does not fit throws a `TypeError` at declaration, not on a request.
Credentials go in `headers.request` (see [Headers](headers.md)).

## `rewrite`

| `rewrite` | Request | Upstream path |
| --- | --- | --- |
| none | `/api/users` | `/api/users` |
| `'/api'` | `/api/users` | `/users` |
| `'/api'` | `/api` | `/` |
| `(path) => path.replace('/v1', '/v2')` | `/v1/users` | `/v2/users` |

A string is a prefix that starts with `/` and does not end with one; it is
compared without case, as the router does. A function gets the request's path
and returns a path: it is always put under the target, whatever it returns
(see [Security](security.md)). The query string is always kept.

## Where the proxy sits

`use(path, middleware)` runs on the requests under `path`, after the
middlewares declared before it, and never calls `next`. Core has no `.all()`,
so this is the form for any method under a path.

- A route declared **before** the `use` stays local.
- A route declared **after** it, under the same path, is shadowed: the proxy
  answers first.
- A request no route matches runs every `use()`, so the proxy answers it.

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia()
	.get('/api/health', ({ reply }) => reply(200, { ok: true }))   // local
	.use('/api', proxy('http://users.internal:8080', { rewrite: '/api' }))
	.get('/api/never', ({ reply }) => reply(200, 'unreachable'));  // shadowed
```

The proxy is also a route middleware, for one route, with that route's own
options; its handler is never reached:

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia().post(
	'/upload',
	{ bodyLimit: 10 * 1024 * 1024 },
	proxy('http://files.internal:9000'),
	({ reply }) => reply(200, 'unreachable'),
);
```

## What is kept and streamed

- Nothing is buffered: the upstream reads the first chunk of the request
  before the client sends the second, and the client reads the first chunk of
  the response before the upstream sends the second. Server-sent events pass
  through; one ends cleanly when the app starts to shut down.
- Redirects are passed back, never followed; a gzip body passes through as is,
  with its `Content-Encoding`.
- Hop-by-hop headers are stripped both ways: `connection`, `keep-alive`, `te`,
  `trailer`, `transfer-encoding`, `upgrade`, every `proxy-*` header, and each
  header `Connection` names. Several `Set-Cookie` stay several.
- When the client sent no `Accept` or `User-Agent`, Bun's `fetch` adds `accept: */*` and
  `user-agent: Bun/<version>`.

## Typed context

A callback reads `ProxyContext<Ctx>`: the request, `url`, `server`, `ip`,
`route`, and what earlier middlewares added. `Ctx` is inferred from an
annotated parameter, or given as a type argument:

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const tenant = proxy<{ tenant: string }>('http://api.internal', {
	headers: { request: (headers, ctx) => headers.set('x-tenant', ctx.tenant) },
});

alxia().use(async (_ctx, next) => next({ tenant: 'acme' })).use(tenant); // compiles
// alxia().use(tenant)  // a compile error: `tenant` is missing from the context
```

## Spec-first apps

`proxy()` given to `use()` and `proxy.mount()` declare no route. A proxy given to a
route is one: `@alxia/openapi`'s `matchesSpec` ignores routes that are not in
the spec by default, and reports them under `strict: true`.

Next: [Headers](headers.md), [Mounting a prefix](mounting.md), [Failures](failures.md).
