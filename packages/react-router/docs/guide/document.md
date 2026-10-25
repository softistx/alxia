# The document

This page covers what the root route renders for the page's CSP nonce, from
`@alxia/react-router/document`: the nonce on the server and in the browser,
an inline script that carries it, and the theme-boot recipe.

`/document` is safe to import in the browser and imports only `react`.

| export | |
| --- | --- |
| `DocumentNonce({ nonce, children })` | provides this response's nonce to the server render |
| `useNonce()` | the page's nonce, on the server and in the browser |
| `InlineScript({ code, nonce? })` | an inline `<script>` with the nonce |
| `CspNonceMeta()` | `<meta property="csp-nonce" nonce>` |

## The nonce on the server

With `secureHeaders({ nonce: true })` the context carries a fresh nonce per
request ([A CSP nonce](csp-nonce.md)). The server render needs it in the
React tree too, so that the root, and every boundary that replaces it, can
read it with `useNonce()`. Wrap the router in `entry.server.tsx`:

```tsx
// app/entry.server.tsx
import { nonceOf } from '@alxia/react-router';
import { DocumentNonce } from '@alxia/react-router/document';

const nonce = nonceOf(loadContext);

<DocumentNonce nonce={nonce}>
	<ServerRouter context={routerContext} url={request.url} />
</DocumentNonce>;
```

Do not put the nonce in a loader's data: the browser hides a nonce from the
page, and loader data would print it as text in the hydration script and in
every `.data` answer. An error page after an action's error runs no loader,
and still reads the nonce, since the provider is above the router.

## The nonce in the browser

React Router's client knows no nonce, and React would find `nonce` on the
server's elements and none in its own: a hydration mismatch. So in the
browser `useNonce()` reads the `nonce` property of the document's first
`script[nonce]` once (the browser hides the attribute, not the property),
and caches it. `DocumentNonce` is not needed there. With no such script it
returns `undefined`.

The first read is cached per module copy. A test with a DOM keeps it across
tests: reset modules between them, or render the server path with
`DocumentNonce`.

Pass it to what React Router renders:

```tsx
// app/root.tsx
import { useNonce } from '@alxia/react-router/document';

export function Layout({ children }: { children: React.ReactNode }) {
	const nonce = useNonce();
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<meta charSet="utf-8" />
				<Links nonce={nonce} />
			</head>
			<body>
				{children}
				<ScrollRestoration nonce={nonce} />
				<Scripts nonce={nonce} />
			</body>
		</html>
	);
}
```

## The theme-boot script

A theme library stores the choice (light, dark) and applies it with a class
or an attribute on `<html>`. Applied after hydration, the page paints in the
wrong theme first. The cure is an inline, synchronous script in `<head>`,
which runs before the first paint. alxia ships the mechanism, not the
script: the code is the theme library's own boot script (for example a UI
kit's `themeBootScript()`), kept as a constant.

```tsx
// app/root.tsx
import {
	CspNonceMeta,
	InlineScript,
	useNonce,
} from '@alxia/react-router/document';
import { themeBootScript } from '<your theme library>';

const THEME_BOOT = themeBootScript();

export function Layout({ children }: { children: React.ReactNode }) {
	const nonce = useNonce();
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<InlineScript code={THEME_BOOT} />
				<meta charSet="utf-8" />
				<CspNonceMeta />
				<Links nonce={nonce} />
			</head>
			<body>{children}</body>
		</html>
	);
}
```

- **Place it first in `<head>`**, before `<Links>`: an inline script is
  synchronous and runs before the first paint, without waiting for a
  stylesheet. Only a `<meta charSet>` may come before it.
- **Keep `suppressHydrationWarning` on `<html>`**: the script changes its
  `class` and `style` before React hydrates, and React would warn that they
  differ from the server's HTML. It silences that element's attributes only.
- **The nonce is the response's**: `script-src 'nonce-…' 'strict-dynamic'`
  allows the script because it carries it. `InlineScript` uses `useNonce()`
  on the server and the document's nonce in the browser, so the attribute
  matches during hydration. `nonce` overrides it for one script.
- **With no nonce**, the script renders with no `nonce` attribute. The policy
  must then allow it by `'unsafe-inline'` or a hash of the code.

> **Warning:** the code is written unescaped. It is a constant of the app,
> never user input, and it must not contain `</script>` or `<!--`.


`CspNonceMeta` renders `<meta property="csp-nonce" nonce>`, which UI
libraries read to give the scripts and styles they add at runtime the same
nonce.

## An entry of your own

An entry that is not React Router's default wraps `<ServerRouter>` in
`<DocumentNonce nonce={nonceOf(loadContext)}>` as shown
[above](#the-nonce-on-the-server). Without it `useNonce()` is `undefined`
on the server, and the page's inline scripts render with no nonce
([the message](../troubleshooting.md#refused-to-execute-inline-script-because-it-violates-the-following-content-security-policy-directive-script-src-self-nonce-)).
