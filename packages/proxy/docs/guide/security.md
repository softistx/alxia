# Security

This page covers what keeps the proxy from being pointed at another host, how
far its forwarded headers can be trusted, and what to strip before a request
or a response crosses.

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia().use('/api', proxy('http://users.internal:8080', {
	rewrite: '/api',
	headers: { request: { cookie: null }, response: { server: null, 'x-powered-by': null } },
}));
```

## The upstream is fixed

The target is checked once, at declaration: an absolute `http:` or `https:`
URL, with no query, fragment or credentials. It is not a function of the
request, so a request cannot choose it; declare one proxy per upstream. Each
request's path is set as a path on a copy of the target URL, and the result's
origin is checked against the target before the fetch. A request that tries
otherwise gets a 400 `{"error":"bad_request"}` or is kept under the target.

The specs send each of these, and none reaches a second server: `//evil/x`,
`/http://evil/x`, `/%2F%2Fevil/x`, `/@evil/x`, dot segments, an absolute-form
request line (`GET http://evil/x HTTP/1.1`), `GET /\evil/x`, a foreign `Host`
and `X-Forwarded-Host`, and a `rewrite` that returns an absolute URL. A
`rewrite` function that climbs out of the target's path with `..` is the 400
(`OutsideTargetBody`).

## Forwarded headers

- `X-Forwarded-For` is appended to. Whatever the client wrote stays left of
  the entry the proxy adds, so the upstream reads it **from the right**; for
  an alxia upstream, core's `forwardedIp({ trusted: 1 })`.
- `X-Forwarded-Proto` and `-Host` are overwritten, unless `trustForwarded` is
  on. Turn it on only behind a proxy you trust, which itself overwrites them.
- With `alxia({ proxy: trustProxy(…) })`, the values written are core's
  `originalUrl(ctx)`: what the outermost trusted proxy said, so a chain of
  alxia apps stays truthful with no `trustForwarded`. A client that is no
  trusted proxy changes nothing, whatever headers it sends.

## Strip what must not cross

After the guard has verified the token, the upstream needs an identity, not the
credential. A header the proxy sets is overwritten, so a client cannot forge it
through the proxy:

```ts
import { alxia, type BaseContext } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia()
	.use(async (_ctx, next) => next({ user: { sub: 'u1' } }))   // your guard
	.use('/api', proxy('http://users.internal:8080', {
		rewrite: '/api',
		headers: {
			request: {
				authorization: null,
				cookie: null,
				'x-user-id': (ctx: BaseContext & { user: { sub: string } }) => ctx.user.sub,
			},
			response: { server: null, 'x-powered-by': null },
		},
	}));
```

Make the upstream accept `x-user-id` only from the proxy (a network policy):
a client could send it to the upstream directly otherwise.

Credentials the proxy itself holds go in `headers.request`, never in the target URL.

Back: [The basics](basics.md), [Headers](headers.md).
