# @alxia/proxy

A reverse proxy for [alxia](https://www.npmjs.com/package/@alxia/core), as a
middleware, with no dependency: a path or a prefix forwarded to one fixed
upstream, streamed both ways, behind your own auth, rate limit and logger.
Redirects and cookies rebased, failures answered as a 502 or a 504, and
WebSockets relayed.

```sh
bun add @alxia/proxy @alxia/core
bun add -d typescript
```

`@alxia/core` and `typescript` are required peers.

## Usage

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia()
	.get('/health', ({ reply }) => reply(200, { ok: true }))   // declared before: stays local
	.use('/api', proxy('http://users.internal:8080', { rewrite: '/api' }));
	// GET /api/users?page=2 -> http://users.internal:8080/users?page=2

app.listen({ port: 3000 });
```

The proxy never calls `next`: what it runs on is answered by the upstream.
The middlewares before it run first.

## Mount a prefix

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia().plugin(proxy.mount('/legacy', 'http://old-app:3000'));
// /legacy and /legacy/... go to the upstream, the prefix stripped,
// its Location headers and cookies put back under /legacy
```

## Relay a WebSocket

```ts
import { alxia } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia().ws('/live/*', proxy.ws('ws://chat.internal:8080', { rewrite: '/live' }));
```

The upstream socket is opened first, offered the client's subprotocols, and
the client's `101` names the one it chose. An upstream that cannot be
reached answers the upgrade with a 502, or a 504 past `timeout`, in the
app's error format: no socket opens. Frames pass as they came, and a close
on one side closes the other with its code.

## Change the headers

```ts
import { alxia, type BaseContext } from '@alxia/core';
import { proxy } from '@alxia/proxy';

const app = alxia()
	.use(async (_ctx, next) => next({ user: { id: 'u1' } }))   // your auth
	.use(
		'/api',
		proxy('http://users.internal:8080', {
			rewrite: '/api',
			headers: {
				request: {
					authorization: null,                       // the upstream never sees the token
					'x-user-id': (ctx: BaseContext & { user: { id: string } }) => ctx.user.id,
				},
				response: { server: null, 'x-powered-by': null },
			},
		}),
	);
```

A callback names what it reads in its parameter's type; `use()` then refuses an
app whose context does not give it.

## Traps

- A route declared after `use('/api', proxy(…))` under `/api` is never reached; declare it before.
- The upstream sees its own `Host`. Add `preserveHost: true` for a virtual host.
- A redirect or cookie keeps the upstream's address unless `rebase` is on (it is, for `proxy.mount`).
- An app's `bodyLimit()` covers its routes, not the requests no route matches that `use('/api', proxy(…))` forwards: give the proxy its own `bodyLimit`.
- Spec-first apps: proxied routes are ignored by `@alxia/openapi`'s `matchesSpec` by default and reported under `strict`; `proxy()` given to `use()` and `proxy.mount()` declare no route at all.
- The upstream's client address is the proxy's. It reads `X-Forwarded-For` from the right.

## Options

| option | default | |
| --- | --- | --- |
| `rewrite` | none | a prefix to strip, or `(path) => string`; the query is kept |
| `rebase` | `false` (`proxy.mount`: its prefix) | `true` or a prefix: `Location` and cookie `Domain`/`Path` put back under it |
| `preserveHost` | `false` | send the client's `Host` |
| `xForwarded` | `true` | `X-Forwarded-For`, `-Proto`, `-Host` |
| `trustForwarded` | `false` | keep the incoming `X-Forwarded-Proto` and `-Host` |
| `forwarded` | `false` | add an RFC 7239 `Forwarded` element |
| `headers` | none | `{ request?, response? }`: a record, or a function `(headers, ctx) => void` |
| `timeout` | `30_000` | milliseconds of silence allowed until the upstream's response headers, counted again from each body chunk sent; past it, a 504 |
| `bodyLimit` | none | bytes of request body; past it, a 413 |

## API

| export | |
| --- | --- |
| `proxy(target, options?)` | the middleware: forwards what it runs on to `target`; given to `use(path?, …)` or a route |
| `proxy.mount(prefix, target, options?)` | a plugin forwarding everything under `prefix`, rebased |
| `proxy.ws(target, options?)` | the handlers of a `ws()` route relayed to an upstream socket, opened before the client's `101` |
| `BAD_GATEWAY_CLOSE` | deprecated: `1014`, the close code an unreachable upstream socket used to get; it is now a 502 over HTTP |
| `ProxyOptions<Ctx>`, `SocketProxyOptions<Ctx>` | the options, and those of `proxy.ws` |
| `ProxyHeaders<Ctx>`, `HeaderEdit<Ctx>`, `HeaderValue<Ctx>`, `ProxyContext<Ctx>` | the `headers` option, and what its callbacks read |
| `ProxyMiddleware<Ctx>`, `ProxyMount<Prefix, Ctx>`, `SocketProxy<Ctx>` | what the three functions return |
| `BadGatewayBody`, `GatewayTimeoutBody`, `OutsideTargetBody` | the bodies of the 502, the 504 and the 400 |

## Documentation

- [Guide](https://github.com/softistx/alxia/blob/develop/packages/proxy/docs/README.md): a page per area: the basics, headers, mounting a prefix, failures, WebSockets and security.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/proxy/docs/troubleshooting.md): an error message, or a request that does not reach the upstream, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/proxy/docs/roadmap.md): what is coming, and what is not planned.
- [Recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md): [Put an app in front of other services](https://github.com/softistx/alxia/blob/develop/docs/recipes/proxy.md).
