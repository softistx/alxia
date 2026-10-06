# Headers

This page covers the headers the proxy sends and receives: what it sets by
itself, how to add, remove or compute one on each side, and how the client's
address and scheme reach the upstream.

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia().use(
	'/api',
	proxy('http://users.internal:8080', {
		rewrite: '/api',
		headers: {
			request: { 'x-api-key': 'secret', cookie: null },
			response: { server: null },
		},
	}),
);
```

## `headers`

```ts no-check
interface ProxyHeaders<Ctx> {
	request?: HeaderEdit<Ctx>;    // what the upstream receives
	response?: HeaderEdit<Ctx>;   // what the client receives
}
type HeaderEdit<Ctx> =
	| Record<string, HeaderValue<Ctx>>
	| ((headers: Headers, ctx: ProxyContext<Ctx>) => void);
type HeaderValue<Ctx> = string | null | ((ctx: ProxyContext<Ctx>) => string | null | undefined);
```

| Value | Effect |
| --- | --- |
| a string | sets the header |
| `null` | removes it |
| a function | computes it per request: a string sets, `null` removes, `undefined` leaves it |

A function `(headers, ctx) => void` instead of a record gets all the headers
to change. Edits apply after the proxy's own: on the request, after the
hop-by-hop strip, the forwarding headers and `Host`; on the response, after the
strip and the rebase. So an edit has the last word, and a header the proxy sets
cannot be forged by the client.

```ts
import { alxia, type BaseContext } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia()
	.use(async (_ctx, next) => next({ user: { id: 'u1' } }))
	.use(
		'/api',
		proxy('http://users.internal:8080', {
			headers: {
				request: (headers, ctx: BaseContext & { user: { id: string } }) => {
					headers.delete('authorization');
					headers.set('x-user-id', ctx.user.id);
				},
			},
		}),
	);
```

## `Host`

The upstream gets its own host. `preserveHost: true` sends the client's, for
an upstream that serves virtual hosts. `X-Forwarded-Host` carries the client's
host in both cases. Behind `alxia({ proxy: trustProxy(…) })`, "the client's" is
what the trusted proxy said (core's `originalUrl(ctx)`), so a chain stays truthful. The client's port, if any, is part of
`X-Forwarded-Host`; `X-Forwarded-Port` is not sent.

## Forwarding headers

| Option | Default | Effect |
| --- | --- | --- |
| `xForwarded` | `true` | appends the peer to `X-Forwarded-For`, sets `X-Forwarded-Proto` (the scheme the client used) and `X-Forwarded-Host` (the host it asked for): the request's own, or, behind `alxia({ proxy: trustProxy(…) })`, what the trusted proxy said |
| `trustForwarded` | `false` | keeps the incoming `X-Forwarded-Proto` and `-Host` when present: only for an app behind a proxy you trust |
| `forwarded` | `false` | appends an RFC 7239 element: `for=203.0.113.9;host=api.example.com;proto=https` (an IPv6 address quoted: `"[::1]"`), `host` and `proto` as above |

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia().use('/api', proxy('http://users.internal:8080', {
	forwarded: true,
	trustForwarded: true,   // this app sits behind a load balancer that sets them
}));
```

The peer address is the socket's, or the app's `ip`. `X-Forwarded-For` is
appended to, never replaced: what the client wrote stays on the left. The
upstream must read it from the right; see [Security](security.md).

Next: [Security](security.md).
