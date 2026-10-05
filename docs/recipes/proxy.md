# Put an app in front of other services

**The problem.** The browser talks to one server, the app, but some of what
it asks for lives elsewhere: a users service on the private network, an old
application being replaced page by page. The app should authenticate and
rate-limit every request first, then forward it, the body and the response
streamed, and answer a clear 502 or 504 when the service is down or slow.
This is a backend for frontend, a gateway, or a progressive migration.

```sh
bun add @alxia/core @alxia/proxy @alxia/jwt @alxia/rate-limit
bun add -d typescript
```

## The app

`proxy(target)` is a middleware that forwards every request it runs on.
Given to `all('/api/*', …)`, it is one route for every method and path
under `/api`, beside which a local route — `/api/me` here — keeps its own
methods, declared before or after it. Given to `use('/api', …)` instead, it
would take every request under `/api`, and shadow a route declared after it
there. `proxy.mount(prefix, target)` is a plugin that takes everything under
a prefix, and rewrites the old application's redirects and cookies back
under it. What is declared before any of them runs first: the guard, the
rate limit.

```ts
// file: src/app.ts
import { alxia, type BaseContext } from '@alxia/core';
import { bearer, createJwt, type JwtClaims } from '@alxia/jwt';
import { proxy } from '@alxia/proxy';
import { rateLimit } from '@alxia/rate-limit';

export const jwt = createJwt({
	secret: Bun.env['JWT_SECRET'] ?? 'a-development-secret-of-32-bytes!!',
});

export function gateway(services: { users: string; legacy: string }) {
	return (
		alxia({ errors: 'problem' })
			// Answered here, never forwarded: declared before the proxies.
			.get('/health', ({ reply }) => reply(200, { status: 'up' }))
			.use(rateLimit({ limit: 100, windowMs: 60_000 }))
			// Everything under /legacy, any method, prefix stripped; its
			// Location and cookies rebased under /legacy.
			.plugin(proxy.mount('/legacy', services.legacy))
			.use(bearer({ jwt }))
			.all(
				'/api/*',
				proxy(services.users, {
					rewrite: '/api', // /api/users/7 → /users/7, the query kept
					timeout: 5_000,
					headers: {
						request: {
							// The service trusts the gateway, not the client's token.
							authorization: null,
							'x-user-id': (ctx: BaseContext & { user: JwtClaims }) =>
								ctx.user.sub,
						},
					},
				}),
			)
			// A route of its own under /api: answered here, though declared after.
			.get('/api/me', ({ user, reply }) => reply(200, { id: user.sub }))
	);
}
```

```ts
// file: src/server.ts
import { gateway } from './app';

gateway({
	users: Bun.env['USERS_URL'] ?? 'http://users.internal:8080',
	legacy: Bun.env['LEGACY_URL'] ?? 'http://old-app:3000',
}).listen(Number(Bun.env['PORT'] ?? 3000));
```

The upstreams are fixed here, when the app is built: no request can make
the proxy call another host, whatever its path or its `Host` header.

## Test it against real upstreams

Each spec starts the services as `Bun.serve` servers on free ports, then
calls the gateway with `app.request`.

```ts
// file: src/app.spec.ts
import { afterAll, expect, test } from 'bun:test';
import { gateway, jwt } from './app';

const users = Bun.serve({
	port: 0,
	fetch: (request) =>
		Response.json({
			path: new URL(request.url).pathname,
			user: request.headers.get('x-user-id'),
			token: request.headers.get('authorization'),
		}),
});
const legacy = Bun.serve({
	port: 0,
	fetch: () =>
		new Response(null, {
			status: 302,
			headers: { location: '/login', 'set-cookie': 'sid=1; Path=/' },
		}),
});
afterAll(() => {
	users.stop(true);
	legacy.stop(true);
});

const app = gateway({ users: users.url.href, legacy: legacy.url.href });

test('/api needs a token, and the service gets the user, not the token', async () => {
	expect((await app.request('/api/users/7')).status).toBe(401);
	const token = await jwt.sign({ sub: 'u42' });
	const response = await app.request('/api/users/7', {
		headers: { authorization: `Bearer ${token}` },
	});
	expect(await response.json()).toEqual({ path: '/users/7', user: 'u42', token: null });
});

test('/api/me is answered by the gateway, beside the proxied /api/*', async () => {
	const token = await jwt.sign({ sub: 'u42' });
	const response = await app.request('/api/me', {
		headers: { authorization: `Bearer ${token}` },
	});
	expect(await response.json()).toEqual({ id: 'u42' });
});

test("the old application's redirect and cookie stay under /legacy", async () => {
	const response = await app.request('/legacy/account');
	expect(response.status).toBe(302);
	expect(response.headers.get('location')).toBe('/legacy/login');
	expect(response.headers.getSetCookie()).toEqual(['sid=1; Path=/legacy']);
});

test('a service that is down is a 502 problem', async () => {
	const down = gateway({ users: 'http://127.0.0.1:9', legacy: legacy.url.href });
	const token = await jwt.sign({ sub: 'u42' });
	const response = await down.request('/api/users', {
		headers: { authorization: `Bearer ${token}` },
	});
	expect(response.status).toBe(502);
	expect(response.headers.get('content-type')).toBe('application/problem+json');
});

test('/health is answered by the gateway itself', async () => {
	expect(await (await app.request('/health')).json()).toEqual({ status: 'up' });
});
```

## What else it does

- **Streaming.** Request and response bodies are streamed both ways,
  server-sent events included, and never buffered; the proxy's `bodyLimit`
  caps an upload as it streams.
- **Failures.** A 502 when the upstream cannot be reached, a 504 when its
  response headers take longer than `timeout` (30 s by default), in the
  app's error format. A client that leaves aborts the upstream request, and a
  graceful shutdown lets in-flight requests drain before aborting them.
- **WebSockets.** `app.ws('/live/*', proxy.ws('ws://chat.internal:8080'))`
  relays a socket's frames and close codes, behind the route's middlewares;
  the upstream opens first, so the `101` carries its subprotocol and a dead
  upstream is a 502. A slow reader pauses the other side, and past
  `maxBuffered` (1 MiB) both close with 1013.
- **Spec first.** `@alxia/openapi`'s `matchesSpec` ignores the requests a
  proxy forwards by default: `mount` declares no route, and the `all`
  route is reported in `extra` as `ALL /api/*`, a failure only under
  `strict`.
- **`all` or `use`.** `all('/api/*', proxy(url))` is one route, in the route
  table; a path of its own under it (`/api/me`) answers its other methods
  with a 405, not the proxy. `use('/api', proxy(url))` forwards everything
  under `/api` the routes declared before it leave, a method `/api/me`
  lacks included.

## Reference

- [`@alxia/proxy`](../../packages/proxy/README.md) and its
  [guide](../../packages/proxy/docs/README.md): every option, the headers it
  sets and strips, mounting, failures, WebSockets, security
- [Authenticate requests](authentication.md): the guard before the proxy
- [Caching and rate limiting with Redis](caching-and-rate-limiting.md): a
  limit shared by every gateway process
- [Health checks and graceful shutdown](health-and-shutdown.md): the drain
  the proxied requests finish within
