# Guide

This page covers `secureHeaders`: what it sends, how to change or drop each
header, the per-request nonce, which responses it reaches, and how a page or
another middleware sets its own policy.

```ts
import { alxia } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const app = alxia()
	.use(secureHeaders())
	.get('/health', ({ reply }) => reply(200, 'ok'));

app.listen(3000);
```

Every response of that app now carries the headers below, and none carries
`X-Powered-By` or `Server`.

## The signature

```ts
function secureHeaders(options: SecureHeadersOptions & { readonly nonce: true }): NoncePlugin;
function secureHeaders(options?: SecureHeadersOptions & { readonly nonce?: false }): SecureHeaders;

interface SecureHeadersOptions {
	readonly contentSecurityPolicy?: string | false;
	readonly strictTransportSecurity?: string | false;
	readonly xContentTypeOptions?: string | false;
	readonly xFrameOptions?: string | false;
	readonly referrerPolicy?: string | false;
	readonly crossOriginOpenerPolicy?: string | false;
	readonly crossOriginResourcePolicy?: string | false;
	readonly crossOriginEmbedderPolicy?: string | false;
	readonly originAgentCluster?: string | false;
	readonly xDnsPrefetchControl?: string | false;
	readonly xPermittedCrossDomainPolicies?: string | false;
	readonly permissionsPolicy?: string | false;
	readonly hidePoweredBy?: boolean;
}
```

`nonce` is not in `SecureHeadersOptions`: each overload adds it, so options
typed by that interface still give the plain `SecureHeaders`.

`secureHeaders` returns a middleware: give it to `app.use`, called, and the
app keeps its type. `SecureHeaders` is a `Middleware` from `@alxia/core`
that adds nothing to the context. It waits for the rest of the chain with
`settle`, then sets the headers on the response, so it covers every route
declared after it, and every request no route matches — a 404, a 405 —
because those run all of the app's top-level middlewares too. A route
declared **before** it is not covered. Used inside a `group`, it covers only
that group's routes, and not a 404 under the group's prefix: declare it on
the app. To vary a header for some routes, set it on their replies
([below](#a-header-a-route-sets-is-kept)).

The options are read once, when `secureHeaders(…)` is called; the header
values are fixed from then on, but for the nonce, which is new on every
request.

With `nonce: true` it returns a `NoncePlugin` instead: a middleware, still
given to `app.use` called, that covers the same responses as above, and which
adds `nonce` to the context of the routes declared after it
([below](#a-nonce-per-request)).

## The options

Each header option takes the header's value as a string, or `false` to
leave the header out. An option left out keeps the default.

| Option | Header | Default | What the default does |
| --- | --- | --- | --- |
| `contentSecurityPolicy` | `Content-Security-Policy` | `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` | a policy for an API: the response may load nothing, set no `<base>`, post no form, and be framed by no page |
| `strictTransportSecurity` | `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | over HTTPS, the browser uses HTTPS for this host and its subdomains for a year |
| `xContentTypeOptions` | `X-Content-Type-Options` | `nosniff` | the browser trusts `Content-Type` and does not guess |
| `xFrameOptions` | `X-Frame-Options` | `DENY` | no page may frame the response, for browsers that predate `frame-ancestors` |
| `referrerPolicy` | `Referrer-Policy` | `no-referrer` | links and requests from the response send no `Referer` |
| `crossOriginOpenerPolicy` | `Cross-Origin-Opener-Policy` | `same-origin` | a window of another origin opened from, or opening, this one gets no handle on it |
| `crossOriginResourcePolicy` | `Cross-Origin-Resource-Policy` | `same-origin` | another origin cannot embed the response with `<img>`, `<script>` or a `no-cors` fetch |
| `crossOriginEmbedderPolicy` | `Cross-Origin-Embedder-Policy` | not sent | — |
| `originAgentCluster` | `Origin-Agent-Cluster` | `?1` | the browser isolates the origin in its own agent cluster |
| `xDnsPrefetchControl` | `X-DNS-Prefetch-Control` | `off` | the browser does not resolve the response's links ahead of time |
| `xPermittedCrossDomainPolicies` | `X-Permitted-Cross-Domain-Policies` | `none` | Adobe clients load no cross-domain policy file |
| `permissionsPolicy` | `Permissions-Policy` | not sent | — the policy is the app's to write |

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `hidePoweredBy` | `boolean` | `true` | removes `X-Powered-By` and `Server` from every response, a route's own included |
| `nonce` | `boolean` | `false` | a fresh nonce per request, in the policy and on the context: [A nonce per request](#a-nonce-per-request) |

### A value

A string replaces the default as it is, with no parsing: write the header
exactly as it should go out.

```ts
app.use(
	secureHeaders({
		contentSecurityPolicy: "default-src 'self'; img-src 'self' data:",
		referrerPolicy: 'strict-origin-when-cross-origin',
		permissionsPolicy: 'camera=(), microphone=(), geolocation=()',
	}),
);
```

### `false`

`false` leaves the header out of every response the middleware touches.

```ts
app.use(secureHeaders({ xFrameOptions: false, strictTransportSecurity: false }));
```

An empty string is refused: `secureHeaders({ xFrameOptions: '' })` throws a
`TypeError` at startup
([troubleshooting](troubleshooting.md#typeerror-secureheaders--is-empty-give-false-to-leave-the--header-out)).
Use `false` to drop a header.

### The defaults, explicitly

With `exactOptionalPropertyTypes` on, an option set to `undefined` is a
compile error; with it off, `undefined` means the default. To keep the
default under a condition, leave the key out:

```ts
const production = Bun.env.NODE_ENV === 'production';

app.use(
	secureHeaders({
		...(production ? {} : { strictTransportSecurity: false }),
	}),
);
```

### `hidePoweredBy`

On by default: `X-Powered-By` and `Server` are deleted from the response,
even when a route set them.

```ts
const app = alxia()
	.use(secureHeaders())
	.get('/', ({ reply }) => reply(200, 'hi', { headers: { 'x-powered-by': 'php' } }));

(await app.request('/')).headers.get('x-powered-by'); // null
```

`hidePoweredBy: false` keeps whatever the route or another middleware sent.

## A header a route sets is kept

The middleware only fills in a header the response does not have yet. A route
that needs its own policy sets it on its reply, and the other defaults
still apply:

```ts
import { alxia } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const app = alxia()
	.use(secureHeaders({ referrerPolicy: 'same-origin', xFrameOptions: false }))
	.get('/page', ({ reply }) =>
		reply(200, '<p>hi</p>', {
			headers: { 'content-security-policy': "default-src 'self'" },
		}),
	);

const response = await app.request('/page');
response.headers.get('content-security-policy'); // "default-src 'self'"   — the route's
response.headers.get('x-content-type-options');  // 'nosniff'              — the default
response.headers.get('referrer-policy');         // 'same-origin'          — the option
response.headers.get('x-frame-options');         // null                   — false
```

`set.headers` in a handler or a `derive` works the same way, since it ends
up on the response before the middleware reads it.

That is how `@alxia/graphql`'s IDE loads under the strict default: it sets
the `Content-Security-Policy` it needs, and `secureHeaders` keeps it.

## A nonce per request

A policy that allows a page's inline scripts without `'unsafe-inline'`
names a nonce: `script-src 'nonce-…'`, and the same value on each
`<script nonce="…">`. It must be unguessable and new on every response.
`nonce: true` does both halves.

```ts
import { alxia } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const app = alxia()
	.use(
		secureHeaders({
			nonce: true,
			contentSecurityPolicy: "default-src 'self'; script-src 'self'; frame-ancestors 'none'",
		}),
	)
	.get('/', ({ nonce, reply }) =>
		reply(
			200,
			`<!doctype html><script nonce="${nonce}">document.title = 'ready'</script>`,
			{ headers: { 'content-type': 'text/html; charset=utf-8' } },
		),
	);

const response = await app.request('/');
response.headers.get('content-security-policy');
// "default-src 'self'; script-src 'self' 'nonce-Gm1y0S3h1JZcVvXQ4l6x0A=='; frame-ancestors 'none'"
await response.text();
// "<!doctype html><script nonce=\"Gm1y0S3h1JZcVvXQ4l6x0A==\">…"
```

### What it is

16 bytes from `crypto.getRandomValues`, base64: 24 characters, `==` at the
end. Each request makes its own, when the middleware runs,
and every reader of that request — the route, its middlewares, the header — gets
the same one. Two requests never share one.

### Where it goes in the policy

| The policy | The nonce goes |
| --- | --- |
| names `NONCE` | where `NONCE` stands, each time, and nowhere else |
| has no `NONCE`, has `script-src` or `script-src-elem` | at the end of each of those directives (their name in any case) |
| has neither, as the default policy | nowhere: `secureHeaders()` throws at startup; give `contentSecurityPolicy` with `nonce: true` |

`NONCE`, exported, is a placeholder string (`'nonce-{alxia}'`) that no real
policy contains. Use it to put the nonce in `style-src`, or in a directive
of your own choosing:

```ts
import { NONCE, secureHeaders } from '@alxia/secure-headers';

app.use(
	secureHeaders({
		nonce: true,
		contentSecurityPolicy: [
			"default-src 'self'",
			`script-src 'self' ${NONCE} 'strict-dynamic'`,
			`style-src 'self' ${NONCE}`,
		].join('; '),
	}),
);
```

Leaving `style-src` alone is the default on purpose: once a directive holds
a nonce, browsers ignore its `'unsafe-inline'`, and `style="…"` attributes,
which take no nonce, stop applying
([troubleshooting](troubleshooting.md#inline-style-attributes-stop-applying-once-style-src-has-the-nonce)).

### Who reads it

The header covers every response that comes back through the middleware, as
without the nonce: a 404 and a 500 get a policy with a nonce of their own.
`ctx.nonce` is typed and set on the routes declared **after** `app.use`, in
their middlewares and their handler, as any middleware's context. A route
declared before it gets neither a policy nor a `ctx.nonce`:

```ts
alxia()
	.get('/early', ({ reply }) => reply(200, 'no policy from this middleware, no ctx.nonce'))
	.use(secureHeaders({ nonce: true, contentSecurityPolicy: "script-src 'self'" }))
	.derive(({ nonce }) => ({ scriptTag: (code: string) => `<script nonce="${nonce}">${code}</script>` }))
	.get('/late', ({ scriptTag, reply }) => reply(200, scriptTag('…')));
```

A route that sets its own `Content-Security-Policy` keeps it, as
[above](#a-header-a-route-sets-is-kept); its `ctx.nonce` is then in no
header, unless it writes it into its own policy.

### With React Router

`@alxia/react-router` reads the nonce from the context, if one is there,
with `nonceOf(loadContext)` in `entry.server.tsx`. Neither package depends
on the other. See
[its guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#a-csp-nonce).

### Without `nonce: true`

Nothing changes: the same headers, the same values, no `nonce` on the
context. A policy that names `NONCE` without `nonce: true` is refused at
startup, so the placeholder never reaches a browser.

## Which responses get the headers

The middleware settles `next()`: it sets the headers on the response the
client would get, whatever produced it.

| Response | Headers |
| --- | --- |
| a route's reply, `static` and `file` included | yes |
| the core's 400, 404, 405 and 500, and an `onError` reply | yes |
| a `Response` another middleware returned (a CORS preflight, a redirect) | yes, when that middleware is declared after `secureHeaders` |
| a route declared before `app.use(secureHeaders())` | no: the middleware does not run for it |
| a WebSocket upgrade that succeeds (`101`) | no: the upgrade is not a response a middleware can decorate |
| a page served with `page()` | no: `Bun.serve` serves it, around no middleware |
| the 500 sent when a deprecated `around` hook itself throws | no |

```ts
const app = alxia().use(secureHeaders());

const response = await app.request('/nope');
response.status;                                // 404
response.headers.get('x-content-type-options'); // 'nosniff'
```

## Order with other middlewares

Middlewares nest: the first `use` is the outermost, and on the way out each
one sees the response of the ones after it. The middleware never overwrites
a header that is already there. So:

- a middleware declared **after** `secureHeaders` that sets one of its
  headers wins: `secureHeaders` finds it already there;
- a middleware declared **before** it that sets one of its headers wins too,
  by overwriting;
- a middleware declared **before** it that adds `X-Powered-By` or `Server`
  keeps it: `secureHeaders` deleted them before that one ran.

```ts
import { alxia, defineMiddleware, settle, withHeaders } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const referrerOrigin = defineMiddleware(async (ctx, next) =>
	withHeaders(await settle(ctx, next()), (headers) => headers.set('referrer-policy', 'origin')),
);

const app = alxia()
	.use(secureHeaders())
	.use(referrerOrigin)
	.get('/', ({ reply }) => reply(200, 'ok'));

(await app.request('/')).headers.get('referrer-policy'); // 'origin'
```

Declare `secureHeaders()` among the observers, first: `logger()`,
`telemetry()`, `secureHeaders()`, `cors()`, `compress()`. An
error-handling middleware — a `try`/`catch` around `next()`, or
`janusErrors()` — goes **after** it. `secureHeaders()` settles `next()`, so
an error is answered with the route's `onError` reply, its `HttpError`'s
status, or a 500 before a `try`/`catch` declared before it could see it, and
carries the headers either way. A guard on the app (`bearer`, a required
session) declared before it answers its `401` without them.

The deprecated `onResponse` and `around` hooks still run outside every
middleware: an `onResponse` hook sees the headers `secureHeaders` set,
wherever it is declared.

## A header the middleware does not know

The middleware sends the twelve headers above and nothing else. Another one —
`Content-Security-Policy-Report-Only` while a policy is being tried, say —
is a middleware of your own, with `settle` and `withHeaders` from
`@alxia/core`:

```ts
import { alxia, defineMiddleware, settle, withHeaders } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const reportOnly = defineMiddleware(async (ctx, next) =>
	withHeaders(await settle(ctx, next()), (headers) => {
		if (!headers.has('content-security-policy-report-only')) {
			headers.set('content-security-policy-report-only', "default-src 'self'; report-to csp");
		}
	}),
);

const app = alxia()
	.use(secureHeaders())
	.use(reportOnly);
```

See [Middleware](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/middleware.md)
in the core's guide for what a middleware may do.

## Recipes

### An app that serves HTML too

The default policy blocks everything a page loads. Loosen it for the whole
app when it serves its own pages, and keep framing refused:

```ts
app.use(
	secureHeaders({
		contentSecurityPolicy:
			"default-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
	}),
);
```

Or keep the strict default for the API and give the pages their policy on
their reply, as in [A header a route sets is kept](#a-header-a-route-sets-is-kept).
When the pages run inline scripts, add `nonce: true` rather than
`'unsafe-inline'`: [A nonce per request](#a-nonce-per-request).

### Framed by your own origin

Both `frame-ancestors` in the policy and `X-Frame-Options` refuse framing;
change both:

```ts
app.use(
	secureHeaders({
		contentSecurityPolicy: "default-src 'none'; frame-ancestors 'self'",
		xFrameOptions: 'SAMEORIGIN',
	}),
);
```

### Images or files embedded by another origin

`Cross-Origin-Resource-Policy: same-origin` stops another origin's
`<img>`, `<script>` or `no-cors` fetch from reading the response. A
CORS `fetch` is not affected. For a public asset host:

```ts
app.use(secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }));
```

### Sign-in in a popup

`Cross-Origin-Opener-Policy: same-origin` cuts the link between a page and
a popup of another origin, which a sign-in popup that reports back through
`window.opener` needs:

```ts
app.use(secureHeaders({ crossOriginOpenerPolicy: 'same-origin-allow-popups' }));
```

### Cross-origin isolation

`SharedArrayBuffer` and precise timers need the page to be cross-origin
isolated, which takes `Cross-Origin-Embedder-Policy` beside the default
`Cross-Origin-Opener-Policy: same-origin`:

```ts
app.use(secureHeaders({ crossOriginEmbedderPolicy: 'require-corp' }));
```

## In a real app

An API with a sign-in page, its own pages' policy, HSTS only in production,
and a test that holds the headers in place:

```ts
// app.ts
import { alxia } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const production = Bun.env.NODE_ENV === 'production';
const PAGE_POLICY =
	"default-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

export const app = alxia()
	.use(
		secureHeaders({
			permissionsPolicy: 'camera=(), microphone=(), geolocation=()',
			...(production ? {} : { strictTransportSecurity: false }),
		}),
	)
	.get('/api/me', ({ reply }) => reply(200, { name: 'Ada' }))
	.get('/sign-in', ({ reply }) =>
		reply(200, '<form method="post" action="/sign-in">…</form>', {
			headers: {
				'content-type': 'text/html; charset=utf-8',
				'content-security-policy': PAGE_POLICY,
			},
		}),
	);
```

```ts
// app.spec.ts
import { expect, test } from 'bun:test';
import { app } from './app';

test('the API keeps the strict policy', async () => {
	const response = await app.request('/api/me');
	expect(response.headers.get('content-security-policy')).toStartWith("default-src 'none'");
	expect(response.headers.get('x-frame-options')).toBe('DENY');
});

test('the sign-in page has its own', async () => {
	const response = await app.request('/sign-in');
	expect(response.headers.get('content-security-policy')).toContain("form-action 'self'");
	expect(response.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=()');
});

test('a 404 is covered too', async () => {
	const response = await app.request('/nope');
	expect(response.status).toBe(404);
	expect(response.headers.get('x-content-type-options')).toBe('nosniff');
});
```

## See also

- [Troubleshooting](troubleshooting.md): a browser refuses something, or
  TypeScript does.
- [Middleware](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/middleware.md)
  and [Groups and plugins](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/groups-and-plugins.md)
  in the core's guide.
