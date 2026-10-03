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

A header a route sets itself is kept: a page that needs its own policy sets
it on its reply.

## A nonce per request

`nonce: true` makes a fresh nonce for each request (128 random bits,
base64), puts it in the policy as `'nonce-…'`, and gives it to the routes
declared after the plugin as `ctx.nonce`. The header and the context always
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

Each option takes a value, or `false` to leave the header out; an empty
value is refused at startup. `nonce` is off by default.
`X-Powered-By` and `Server` are removed unless `hidePoweredBy: false`.

## API

| export | |
| --- | --- |
| `secureHeaders(options?)` | the plugin: a function `Plugin`, or with `nonce: true` a `NoncePlugin` |
| `SecureHeadersOptions` | its options: the headers and `hidePoweredBy`; `nonce` is added by each overload |
| `Setting` | a header option's type: its value, or `false` to leave it out |
| `NONCE` | where the nonce goes in `contentSecurityPolicy`, each time it is named |
| `NonceContext` | what `nonce: true` adds to the context: `nonce`, a string |
| `NoncePlugin` | what `secureHeaders({ nonce: true })` returns: an app plugin adding `NonceContext` |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/secure-headers/docs): every option and its default, the per-request nonce, which responses get the headers, a page's own policy, the order with other hooks, and recipes.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/secure-headers/docs/troubleshooting.md): an error message or a browser refusal, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/secure-headers/docs/roadmap.md): what is coming, and what is not planned.
