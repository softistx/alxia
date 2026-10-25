# @alxia/secure-headers

Secure HTTP headers on every response of an
[alxia](https://www.npmjs.com/package/@alxia/core) app, 404s included, with
no dependency.

```sh
bun add @alxia/secure-headers @alxia/core
bun add -d typescript
```

## Usage

```ts
import { secureHeaders } from '@alxia/secure-headers';

app.use(secureHeaders());
app.use(secureHeaders({ contentSecurityPolicy: "default-src 'self'", xFrameOptions: false }));
```

`secureHeaders()` is a middleware: every response that comes back through
it carries the headers, a 404's, an error's and a refused preflight's
included. A header a route sets itself is kept: a page that needs its own
policy sets it on its reply.

## A nonce per request

`nonce: true` makes a fresh nonce for each request (128 random bits,
base64), puts it in the policy as `'nonce-…'`, and gives it to the routes
declared after the middleware as `ctx.nonce`. The header and the context always
carry the same one, so a page's inline scripts need no `'unsafe-inline'`.

```ts
import { alxia } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const app = alxia()
	.use(
		secureHeaders({
			nonce: true,
			// The nonce is added to script-src (and script-src-elem).
			contentSecurityPolicy: "default-src 'self'; script-src 'self'",
		}),
	)
	.get('/', ({ nonce, reply }) =>
		reply(200, `<script nonce="${nonce}">console.log('allowed')</script>`, {
			headers: { 'content-type': 'text/html' },
		}),
	);
// content-security-policy: default-src 'self'; script-src 'self' 'nonce-3q2+7w…=='
```

To place it yourself, in `style-src` say, write `NONCE` where it goes;
each occurrence becomes the request's `'nonce-…'`, and `script-src` is then
left as written:

```ts
import { NONCE, secureHeaders } from '@alxia/secure-headers';

app.use(
	secureHeaders({
		nonce: true,
		contentSecurityPolicy: `default-src 'self'; script-src 'self' ${NONCE}; style-src 'self' ${NONCE}`,
	}),
);
```

A policy with nowhere to put the nonce (no `script-src`, no `NONCE`) is
refused at startup, the default policy included: give `contentSecurityPolicy`
with `nonce: true`. Without `nonce: true`, the headers are what they always
were. With `@alxia/react-router`, `nonceOf(loadContext)` hands it to
`entry.server.tsx` ([its README](https://github.com/softistx/alxia/tree/develop/packages/react-router#a-csp-nonce)).

## A policy from directives

`csp()` writes the policy from directives, in the order you list them, and
checks it once at startup. A list of sources is an array, `true` is a bare
directive and `false` leaves one out; `NONCE` passes through, for
`nonce: true` to replace on each request.

```ts
import { csp, NONCE, secureHeaders } from '@alxia/secure-headers';

app.use(
	secureHeaders({
		nonce: true,
		contentSecurityPolicy: csp({
			'default-src': ["'self'"],
			'script-src': ["'self'", NONCE],
			'object-src': ["'none'"],
			'upgrade-insecure-requests': true,
		}),
	}),
);
// default-src 'self'; script-src 'self' 'nonce-…'; object-src 'none'; upgrade-insecure-requests
```

An empty source list, a source holding `;`, `,` or a space, a name that is
not lowercase letters, digits and hyphens starting with a letter, and a policy with no directive are
refused with a `TypeError` that starts `csp():`.

## Clearing the browser on sign-out

```ts
import { clearSiteData } from '@alxia/secure-headers';

const cleared = clearSiteData(['cache']);

app.use('/sign-out', cleared).use('/sign-out.data', cleared);
```

`Clear-Site-Data: "cache"` is sent on a 2xx or 3xx answer to a `POST`, so
nothing of the visit stays in the browser's HTTP cache on a shared device. A
GET, a 400, a 403 or a 500 clears nothing. `{ methods: ['POST', 'DELETE'] }`
widens the rule. A route's own `Clear-Site-Data` is kept. React Router's client-side sign-out posts `/sign-out.data`,
so mount both paths. An empty list or an unknown type is refused with a
`TypeError` that starts `clearSiteData():`.

## Pages

`pageHeaders()` is `secureHeaders` for server-rendered pages: a strict policy
with a nonce per request, HSTS and `upgrade-insecure-requests` only over
HTTPS, `Referrer-Policy: strict-origin-when-cross-origin`, and
`Cache-Control: private, no-store`, since a cache must never store a nonce.

```ts
import { createServer } from '@alxia/react-router';
import { pageHeaders } from '@alxia/secure-headers';

export default createServer({
	configure: (app) => app.use(pageHeaders({ https: import.meta.env.PROD })),
});
```

`https` is required and never read from the environment. `PAGE_DIRECTIVES`
is the policy: `'self'` for everything, scripts only with the nonce (and what
they load, `'strict-dynamic'`), nonced `<style>` elements, no `<base>`, forms
to this site, no framing. `directives` merges over it: a list replaces a
directive's sources, `false` removes the directive.

```ts
app.use(
	pageHeaders({
		https: true,
		directives: {
			'img-src': ["'self'", 'https://images.example'],
			'manifest-src': false,
		},
	}),
);
```

Any other `secureHeaders` option passes through and wins over the preset's;
`contentSecurityPolicy` and `nonce` are not options here, and an explicit
`undefined` keeps the preset's value. A `script-src`, or a `script-src-elem`
list, without `NONCE` is refused with a `TypeError` that starts
`pageHeaders():`; so is removing `default-src`, `base-uri` or `object-src`.
`csp()` refuses a keyword written without its quotes (`self` for `'self'`) with
a `TypeError` that starts `csp():`. `clearSiteData()` sends nothing for a
request another site made (`Sec-Fetch-Site` or `Origin`), unless
`crossSite: true`.

## Defaults

| header | default | option |
| --- | --- | --- |
| `Content-Security-Policy` | `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` | `contentSecurityPolicy` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | `strictTransportSecurity` |
| `X-Content-Type-Options` | `nosniff` | `xContentTypeOptions` |
| `X-Frame-Options` | `DENY` | `xFrameOptions` |
| `Referrer-Policy` | `no-referrer` | `referrerPolicy` |
| `Cross-Origin-Opener-Policy` | `same-origin` | `crossOriginOpenerPolicy` |
| `Cross-Origin-Resource-Policy` | `same-origin` | `crossOriginResourcePolicy` |
| `Cross-Origin-Embedder-Policy` | not sent | `crossOriginEmbedderPolicy` |
| `Origin-Agent-Cluster` | `?1` | `originAgentCluster` |
| `X-DNS-Prefetch-Control` | `off` | `xDnsPrefetchControl` |
| `X-Permitted-Cross-Domain-Policies` | `none` | `xPermittedCrossDomainPolicies` |
| `Permissions-Policy` | not sent | `permissionsPolicy` |
| `Cache-Control` | not sent | `cacheControl` |

Each option takes a value, or `false` to leave the header out; an empty
value is refused at startup. `nonce` is off by default.
`X-Powered-By` and `Server` are removed unless `hidePoweredBy: false`.

`cacheControl` is for pages that carry a nonce or a viewer's data:
`cacheControl: 'private, no-store'` keeps a cache from storing them. A route's
own `Cache-Control` wins, and a 404 or a thrown error gets it too.

## API

| export | |
| --- | --- |
| `secureHeaders(options?)` | the middleware, for `app.use`: a `SecureHeaders`, or with `nonce: true` a `NonceMiddleware` |
| `SecureHeadersOptions` | its options: the headers (`cacheControl` included) and `hidePoweredBy`; `nonce` is added by each overload |
| `Setting` | a header option's type: its value, or `false` to leave it out |
| `csp(directives)` | a `Content-Security-Policy` string from directives, checked at startup |
| `CspDirectives` | its argument: directive names to a `CspValue`, any name allowed |
| `CspDirectiveName` | the directive names it completes |
| `CspValue` | a directive's value: a list of sources, `true` for a bare directive, `false` to leave it out |
| `clearSiteData(types, options?)` | a middleware sending `Clear-Site-Data` on a 2xx or 3xx answer to a `POST` (or `options.methods`) |
| `ClearSiteDataType` | a value of the header: `'cache'`, `'cookies'`, `'storage'`, `'executionContexts'`, `'clientHints'`, `'prefetchCache'`, `'prerenderCache'` or `'*'` |
| `ClearSiteDataOptions` | its options: `methods`, `['POST']` by default |
| `ClearSiteData` | what `clearSiteData()` returns: a middleware that adds nothing to the context |
| `pageHeaders(options)` | `secureHeaders({ nonce: true, … })` for server-rendered pages: `PAGE_DIRECTIVES` with a nonce, HSTS with `https`, no-store |
| `PageHeadersOptions` | its options: `https` (required), `directives`, and every `secureHeaders` option but the policy and `nonce` |
| `PAGE_DIRECTIVES` | the page policy's 13 directives, a `CspDirectives` |
| `NONCE` | where the nonce goes in `contentSecurityPolicy`, each time it is named |
| `NonceContext` | what `nonce: true` adds to the context: `nonce`, a string |
| `SecureHeaders` | what `secureHeaders()` returns: a middleware that adds nothing to the context |
| `NonceMiddleware` | what `secureHeaders({ nonce: true })` returns: a middleware adding `NonceContext` |

## Traps

`use` it first: a route declared before `app.use(secureHeaders())` gets no
header, and `ctx.nonce` exists only on routes declared after it. It
settles `next()` without swallowing the error: a `try`/`catch` middleware
catches it wherever it stands, but only one declared after
`secureHeaders()` has the headers on its reply. Declare error-handling
middleware after it.

```ts
const app = alxia().use(secureHeaders()).use(errorHandler).get(...);
```

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/secure-headers/docs): every option and its default, the per-request nonce, `csp()`, `pageHeaders()`, `cacheControl` and `clearSiteData()`, which responses get the headers, a page's own policy, the order with other middlewares, and recipes.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/secure-headers/docs/troubleshooting.md): an error message or a browser refusal, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/secure-headers/docs/roadmap.md): what is coming, and what is not planned.
