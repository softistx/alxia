# A CSP nonce

This page covers a Content-Security-Policy without `'unsafe-inline'`: the
policy in `app/server.ts`, the nonce passed on in `app/entry.server.tsx`, and
why the nonce can stay loose.

React Router renders inline scripts: the hydration data, the module
loader, the scroll restoration, and with streaming one more per resolved
`<Await>`. A policy without `'unsafe-inline'` allows them only when each
carries the nonce the policy names. React Router writes it on every one of
them, and on its `modulepreload` links, when `entry.server.tsx` passes it
to `<ServerRouter nonce>` and to React's renderer
([React Router's security guide](https://reactrouter.com/how-to/security)).

`@alxia/secure-headers` makes the nonce: `secureHeaders({ nonce: true })`
draws a fresh one per request, adds it to the policy's `script-src`, and
puts it on the context of the routes after it, the catch-all included.
`nonceOf(loadContext)` reads it in the entry.

## 1. The policy, in `app/server.ts`

```ts
import { createServer } from '@alxia/react-router';
import { secureHeaders } from '@alxia/secure-headers';

export default createServer({
	configure: (app) =>
		app.use(
			secureHeaders({
				nonce: true,
				contentSecurityPolicy: [
					"default-src 'self'",
					"script-src 'self'",
					"style-src 'self' 'unsafe-inline'",
					"img-src 'self' data:",
					"connect-src 'self'",
					"form-action 'self'",
					"base-uri 'self'",
					"frame-ancestors 'none'",
				].join('; '),
			}),
		),
});
```

`script-src 'self'` goes out as `script-src 'self' 'nonce-…'`, a new
value on every response. `'self'` still allows the bundles under
`/assets`, and `connect-src 'self'` the single-fetch data requests.

## 2. The nonce, in `app/entry.server.tsx`

React Router's template has no entry. The package's own passes the nonce to
`<ServerRouter>` and to React's renderer, and provides it to the page
(`useNonce()`, [the document](document.md)):

```tsx
// app/entry.server.tsx
export {
	handleRequest as default,
	streamTimeout,
} from '@alxia/react-router/entry';
```

It reads `nonceOf(loadContext)` by default; `createEntry({ nonce })`
takes another source ([the entry](document.md#the-entry)). The root passes
the same nonce to `<Links>`, `<ScrollRestoration>` and `<Scripts>` with
`useNonce()`.

### An entry of your own

An entry that is not the package's reveals React Router's, then adds an
import, the nonce in two places, and `DocumentNonce` around the router:

```sh
bunx react-router reveal entry.server
```

```diff
 // app/entry.server.tsx, as reveal writes it
 import { PassThrough } from "node:stream";

+import { nonceOf } from "@alxia/react-router";
+import { DocumentNonce } from "@alxia/react-router/document";
 import type { EntryContext, RouterContextProvider } from "react-router";
 …
     const { pipe, abort } = renderToPipeableStream(
-      <ServerRouter context={routerContext} url={request.url} />,
+      <DocumentNonce nonce={nonceOf(loadContext)}>
+        <ServerRouter context={routerContext} url={request.url} nonce={nonceOf(loadContext)} />
+      </DocumentNonce>,
       {
+        nonce: nonceOf(loadContext),
         [readyOption]() {
```

`loadContext` is the entry's fifth parameter, the `RouterContextProvider`
alxia hands React Router; the revealed file already declares it. With
`renderToReadableStream`, the web entry, the option is the same: `{ nonce:
nonceOf(loadContext), … }`.

That is all: under `react-router dev` and from the build, every `<script>`
of a page carries the nonce of its own response's policy, Vite's dev
scripts included.

## How it stays loose

`nonceOf` reads `nonce` from alxia's context if it is a string, and
returns `undefined` otherwise: no middleware set one, or the request did not come
through alxia at all. `ServerRouter` and React then render no `nonce`
attribute. So:

- this package does not depend on `@alxia/secure-headers`, nor the reverse;
- the same `entry.server.tsx` serves an app with or without the policy;
- a nonce of your own works too, from any `derive` in `configure` that
  returns `{ nonce: string }`; the policy is then yours to write with it.

```ts
configure: (app) => app.derive(() => ({ nonce: myNonce() })),
```

Under `exactOptionalPropertyTypes`, spread it in only when there is one:
see [the troubleshooting entry](../troubleshooting.md#type---nonce-string--undefined--is-not-assignable-to-type-serverrouterprops-with-exactoptionalpropertytypes-true).
