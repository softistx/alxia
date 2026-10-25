---
'@alxia/react-router': minor
---

Add `@alxia/react-router/document`: the page's CSP nonce and inline boot scripts, for a root route. `DocumentNonce` provides the response's nonce to the server render, and `useNonce()` reads it there and, in the browser, the one the document's scripts carry, so hydration finds the attribute the server rendered. `InlineScript({ code, nonce? })` renders an inline `<script>` with that nonce (a theme's boot script, placed first in `<head>`, runs before the first paint), and `CspNonceMeta()` renders `<meta property="csp-nonce">`. `react` is its only import, an optional peer already.
