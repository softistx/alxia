---
'@alxia/secure-headers': minor
---

Headers for server-rendered pages: `csp()` writes a
`Content-Security-Policy` from directives (`{ 'script-src': ["'self'", NONCE] }`)
instead of one long string, in the order you wrote them. `true` gives a bare
directive such as `upgrade-insecure-requests`, `false` leaves one out, and
`NONCE` passes through for `secureHeaders({ nonce: true })` to replace on each
request. A policy a browser would misread (an empty source list, a source
holding `;`, `,` or a space, a bad directive name, no directive at all, or a
keyword written without its quotes, such as `self` for `'self'`) is refused at
startup with a `TypeError` that starts `csp():` and names the directive.

`cacheControl` is one more option, off by default: `cacheControl:
'private, no-store'` keeps a cache from storing a page that carries a nonce or
a viewer's data. It is set like every other header, so a route's own
`Cache-Control` wins and a 404 or a thrown error gets it too.

`clearSiteData(['cache'])` is a middleware for the sign-out path: it sends
`Clear-Site-Data` on a 2xx or 3xx answer to a `POST` (`methods` changes
that), and nothing on a GET, a refused request, or a request another site made
(`Sec-Fetch-Site` decides when present, else `Origin` against the `origin`
option; `crossSite: true` lifts that). React Router's client-side
sign-out posts `/sign-out.data`, so mount it on both paths. An empty list or
an unknown type, or an empty `methods`, is refused at startup with a `TypeError` that starts
`clearSiteData():`.

`pageHeaders({ https })` puts it together for a server-rendered page: it is
`secureHeaders` with a nonce per request, the strict `PAGE_DIRECTIVES` policy
(scripts only with the nonce and what they load, nonced `<style>` elements,
no `<base>`, forms to this site, no framing), HSTS and
`upgrade-insecure-requests` only when `https` is true,
`Referrer-Policy: strict-origin-when-cross-origin`, and
`Cache-Control: private, no-store`. `directives` merges over the policy: a
list replaces a directive's sources, `false` removes it, except `default-src`,
`base-uri` and `object-src`, which cannot be removed. Every other option
passes through and wins over the preset's, and an explicit `undefined`, in an option or in
`directives`, keeps the preset's value. A `script-src`, or a `script-src-elem` list, without
`NONCE` is refused at startup with a `TypeError` that starts `pageHeaders():`.
