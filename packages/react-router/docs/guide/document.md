# The document

This page covers what the root route renders for the page's CSP nonce, from
`@alxia/react-router/document`: the nonce on the server and in the browser,
an inline script that carries it, the theme-boot recipe, and the page's
language and text direction.

`/document` is safe to import in the browser and imports only `react`.

| export | |
| --- | --- |
| `DocumentNonce({ nonce, children })` | provides this response's nonce to the server render |
| `useNonce()` | the page's nonce, on the server and in the browser |
| `InlineScript({ code, nonce? })` | an inline `<script>` with the nonce; refuses `</script` and `<!--` |
| `CspNonceMeta()` | `<meta property="csp-nonce" nonce>` |
| `createPageLanguage({ languages, fallback })` | `pageLanguage`, `metaLanguage`, `chooseLanguage`, `useChosenLanguage` |
| `textDirection(language)` | `'ltr'` or `'rtl'` for `<html dir>` |

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
browser `useNonce()` reads the `nonce` property of the first script or
`csp-nonce` meta in the document's `<head>` (the browser hides the
attribute, not the property), else of the first `script[nonce]` anywhere,
once, and caches it. `DocumentNonce` is not needed there. With none of them
it returns `undefined`.

"The browser" means a global `document`. A server that installs a DOM shim
on `globalThis` takes the browser path and finds no nonce, so it must not
render `useNonce()` that way (and passes `browser: () => false` to
`createPageLanguage`).

The first read is cached per module copy. A test with a DOM keeps it across
tests: reset modules between them, or render the server path with
`DocumentNonce`.

## What React Router renders

With `@alxia/react-router/entry`, the root passes nothing. `<Links>`,
`<Scripts>` and `<ScrollRestoration>` fall back to the nonce `<ServerRouter
nonce>` put in React Router's framework context, so their `nonce` props are
optional:

```tsx
// app/root.tsx
export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}
```

Keep `useNonce()` for what React Router does not render: an `InlineScript`,
a `CspNonceMeta`, and any script or style the app inserts itself.

A page that carries a nonce is made for one response. A route's `headers`
export must never make it `public`: a shared cache would hand the same nonce
to every visitor.

## The theme-boot script

A theme library stores the choice (light, dark) and applies it with a class
or an attribute on `<html>`. Applied after hydration, the page paints in the
wrong theme first. The cure is an inline, synchronous script in `<head>`,
which runs before the first paint. alxia ships the mechanism, not the
script: the code is the theme library's own boot script (for example a UI
kit's `themeBootScript()`), kept as a constant.

```tsx
// app/root.tsx
import { CspNonceMeta, InlineScript } from '@alxia/react-router/document';
import { themeBootScript } from '<your theme library>';

const THEME_BOOT = themeBootScript();

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<InlineScript code={THEME_BOOT} />
				<meta charSet="utf-8" />
				<CspNonceMeta />
				<Links />
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
> never user input. `InlineScript` throws a `TypeError` when it holds
> `</script` or `<!--`, which end or confuse the element
> ([the message](../troubleshooting.md#typeerror-inlinescript-the-code-contains-script-or----which-ends-or-confuses-the-script-element-escape-it-such-as-script-inside-a-string)):
> escape it in a string: the code must contain `<\/script`, written
> `"<\\/script"` in source.


`CspNonceMeta` renders `<meta property="csp-nonce" nonce>`, which UI
libraries read to give the scripts and styles they add at runtime the same
nonce.

## The entry

`@alxia/react-router/entry` is `entry.server.tsx` for an app on Bun. It is
server only, and it renders with the web stream renderer
(`renderToReadableStream`), so it needs neither `@react-router/node` nor
`node:stream`. It imports `react`, `react-dom/server`, `react-router` and
`isbot` only when no `isBot` option is given (it is imported on the first bot
check); `react-dom` and `isbot` are optional peers, which React Router's
templates install.

```tsx
// app/entry.server.tsx
export {
	handleRequest as default,
	streamTimeout,
} from '@alxia/react-router/entry';
```

It does what React Router's revealed entry does:

- **Streams** the shell and the rest as it resolves.
- **Waits for the whole page** for a bot (`isbot`) and in SPA mode.
- **Answers HEAD** with the status and the headers, and no body. Under
  alxia a HEAD reaches the entry as a GET (the core drops the body), so this
  is for a server that is not alxia.
- **Aborts** the render `streamTimeout + 1 000` ms in, or as soon as the
  client leaves (before the shell, or while a bot waits for the whole
  page), and clears the timer when the body ends or the client goes away.
- **Rejects when the shell fails**, so React Router logs it once and answers
  with its error boundary. Once the shell is out, an error goes to `onError`
  and the status stays as it was sent.
- Sends `Content-Type: text/html`.

And it gives the router the response's nonce: `<ServerRouter nonce>`,
React's `nonce` option, and `<DocumentNonce>` around the router, so the
root reads it with `useNonce()`.

To change something, build the entry:

```tsx
// app/entry.server.tsx
import { createEntry } from '@alxia/react-router/entry';

const entry = createEntry({
	streamTimeout: 8_000,
	// Default: nonceOf(loadContext)
	nonce: (loadContext, request) => nonceFor(request),
	// Default: isbot(userAgent)
	isBot: (userAgent) => /bot|crawl|spider/i.test(userAgent),
	// Default: console.error
	onError: (error) => logger.error(error),
});

export const streamTimeout = entry.streamTimeout;
export default entry.handleRequest;
```

`createEntry` returns an `Entry`, `{ handleRequest, streamTimeout }`.

| option | default | |
| --- | --- | --- |
| `streamTimeout` | `5_000` | ms React Router waits for a pending promise; export it as `streamTimeout` |
| `nonce` | `nonceOf(loadContext)` | this response's CSP nonce |
| `isBot` | `isbot`, imported when no `isBot` is given | whether a user agent gets the whole page |
| `onError` | `console.error` | an error after the shell is out |

An error inside a `<Suspense>` that fails during the first render pass, before the shell is out, turns the status into 500 and is not reported to `onError`, as in React Router's own entry; log it in the route's loader or `ErrorBoundary`.

The nonce is passed to `ServerRouter` only when there is one, which
satisfies `exactOptionalPropertyTypes`
([the message](../troubleshooting.md#type---nonce-string--undefined--is-not-assignable-to-type-serverrouterprops-with-exactoptionalpropertytypes-true)).
Under `react-router dev`, keep `alxia()` in `vite.config.ts`: it keeps one
copy of `react-router` for the entry and the root
([the message](../troubleshooting.md#error-you-must-render-this-element-inside-a-hydratedrouter-element)).

## An entry of your own

An entry that is not the package's wraps `<ServerRouter>` in
`<DocumentNonce nonce={nonceOf(loadContext)}>` as shown
[above](#the-nonce-on-the-server). Without it `useNonce()` is `undefined`
on the server, and the page's inline scripts render with no nonce
([the message](../troubleshooting.md#refused-to-execute-inline-script-because-it-violates-the-following-content-security-policy-directive-script-src-self-nonce-)).

## The page's language

`createPageLanguage` gives the root the page's language for `<html lang>` and
a route's `meta`, and `textDirection` the `dir` that goes with it. The server
side, negotiating the request's language from a cookie and `Accept-Language`,
is [`@alxia/language`](https://github.com/softistx/alxia/blob/develop/packages/language/README.md):

```ts
// app/server.ts
import { language } from '@alxia/language';
import { createServer } from '@alxia/react-router';

const server = createServer({
	configure: (app) =>
		app.use(language({ supported: ['en', 'fr', 'ar'], fallback: 'en', order: ['cookie', 'header'] })),
});
export default server;
declare module '@alxia/react-router' {
	interface Register { server: typeof server }
}
```

```ts
// app/language.ts: one instance, imported by the root and the routes
import { createPageLanguage } from '@alxia/react-router/document';

export const { pageLanguage, metaLanguage, chooseLanguage, useChosenLanguage } =
	createPageLanguage({ languages: ['en', 'fr', 'ar'], fallback: 'en' });
```

```tsx
// app/root.tsx
import { type AlxiaArgs, withAlxia } from '@alxia/react-router';
import { textDirection } from '@alxia/react-router/document';
import { useRouteLoaderData } from 'react-router';
import { metaLanguage, pageLanguage, useChosenLanguage } from './language';
import type { Route } from './+types/root';

const titles = { en: 'Home', fr: 'Accueil', ar: 'الرئيسية' };

// the root loader returns alxia.language, set by the middleware
export const loader = withAlxia(({ alxia }: Route.LoaderArgs & AlxiaArgs) => ({ language: alxia.language }));

export function Layout({ children }: { children: React.ReactNode }) {
	const data = useRouteLoaderData<typeof loader>('root');
	const language = pageLanguage(data?.language);
	useChosenLanguage(); // re-renders the shell when the menu picks a language
	return (
		<html lang={language} dir={textDirection(language)} suppressHydrationWarning>
			{/* … */}
		</html>
	);
}

export const meta: Route.MetaFunction = ({ matches }) => [
	{ title: titles[metaLanguage(matches)] },
];
```

- `pageLanguage(language)` is the supported language, else the fallback. In
  the browser the one picked with `chooseLanguage(language)` wins, and the
  last one seen stands in when the root's data is gone. On the server it
  remembers nothing: one module serves every request. A server that
  registers a DOM shim globally (happy-dom or jsdom) is read as a browser:
  pass `browser: false` there.
- `metaLanguage(matches)` reads `matches[0].loaderData.language`.
- `useChosenLanguage()` is the picked language, or `undefined`; it
  re-renders on a pick, and is `undefined` in the server render so
  hydration matches.
- `textDirection(tag)` is `'rtl'` for `ar`, `fa`, `he`, `ur`, `ps`, `yi`,
  `dv`, `ckb`, `sd` and `ug` (and the legacy `iw` and `ji`), else `'ltr'`, reading the base tag whatever its
  case (`ar-EG`, `AR`). A script subtag is not read: `az-Arab` is `'ltr'`.
- A fallback outside `languages` throws
  ([the message](../troubleshooting.md#typeerror-createpagelanguage-the-fallback--is-not-one-of-the-languages-got-)).
  An error page keeps the root's data, so it keeps the language, except
  for a URL that matches no route or a root loader that threw: there it
  shows the last language seen in the browser, or the fallback ([why](../troubleshooting.md#the-error-page-shows-in-the-fallback-language)).
