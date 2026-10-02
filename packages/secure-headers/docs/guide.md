# Guide

This page covers `secureHeaders`: what it sends, how to change or drop each
header, which responses it reaches, and how a page or another plugin sets
its own policy.

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
function secureHeaders(options?: SecureHeadersOptions): Plugin;

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

`secureHeaders` returns a function `Plugin` from `@alxia/core`: give it to
`use`, called, and the app keeps its type. It adds one global `onResponse`
hook, so where it sits in the chain does not matter for which routes it
reaches: every route, declared before or after it, is covered. Used inside
a `group`, it still covers the whole app — a group's global hooks are the
app's. To vary a header for some routes, set it on their replies
([below](#a-header-a-route-sets-is-kept)).

The options are read once, when `secureHeaders(…)` is called; the header
values are fixed from then on.

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

`false` leaves the header out of every response the plugin touches.

```ts
app.use(secureHeaders({ xFrameOptions: false, strictTransportSecurity: false }));
```

An empty string is **not** the same: `''` sends the header with an empty
value. Use `false` to drop it.

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

`hidePoweredBy: false` keeps whatever the route or another hook sent.

## A header a route sets is kept

The plugin only fills in a header the response does not have yet. A route
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
up on the response before the plugin reads it.

That is how `@alxia/openapi`'s reference page and `@alxia/graphql`'s IDE
load under the strict default: each sets the `Content-Security-Policy` it
needs, and `secureHeaders` keeps it.

## Which responses get the headers

The plugin runs as an `onResponse` hook, so it reaches what the app's
`onResponse` hooks reach:

| Response | Headers |
| --- | --- |
| a route's reply, `static` and `file` included | yes |
| the core's 400, 404, 405 and 500 | yes |
| a `Response` an `onRequest` hook returned (a CORS preflight, a redirect) | yes |
| a WebSocket upgrade that succeeds (`101`) | no: `onResponse` hooks do not run for it |
| a page served with `page()` | no: `Bun.serve` serves it, around no hook |
| the 500 sent when an `around` hook itself throws | no |

```ts
const app = alxia().use(secureHeaders());

const response = await app.request('/nope');
response.status;                                // 404
response.headers.get('x-content-type-options'); // 'nosniff'
```

## Order with other `onResponse` hooks

`onResponse` hooks run in the order they are declared, and the plugin never
overwrites a header that is already there. So:

- a hook declared **before** `secureHeaders` that sets one of its headers
  wins;
- a hook declared **after** it that sets one of its headers wins too, by
  overwriting;
- a hook declared **after** it that adds `X-Powered-By` or `Server` keeps
  it: the plugin deleted them before that hook ran.

```ts
import { alxia, withHeaders } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const app = alxia()
	.onResponse((response) =>
		withHeaders(response, (headers) => headers.set('referrer-policy', 'origin')),
	)
	.use(secureHeaders())
	.get('/', ({ reply }) => reply(200, 'ok'));

(await app.request('/')).headers.get('referrer-policy'); // 'origin'
```

## A header the plugin does not know

The plugin sends the twelve headers above and nothing else. Another one —
`Content-Security-Policy-Report-Only` while a policy is being tried, say —
is a hook of your own, with `withHeaders` from `@alxia/core`:

```ts
import { alxia, withHeaders } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const app = alxia()
	.use(secureHeaders())
	.onResponse((response) =>
		withHeaders(response, (headers) => {
			if (!headers.has('content-security-policy-report-only')) {
				headers.set(
					'content-security-policy-report-only',
					"default-src 'self'; report-to csp",
				);
			}
		}),
	);
```

See [Hooks](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/hooks.md#onresponse)
in the core's guide for what an `onResponse` hook may do.

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
- [Hooks](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/hooks.md)
  and [Groups and plugins](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/groups-and-plugins.md)
  in the core's guide.
