---
'@alxia/secure-headers': minor
---

Headers for server-rendered pages, starting with the policy: `csp()` writes a
`Content-Security-Policy` from directives (`{ 'script-src': ["'self'", NONCE] }`)
instead of one long string, in the order you wrote them. `true` gives a bare
directive such as `upgrade-insecure-requests`, `false` leaves one out, and
`NONCE` passes through for `secureHeaders({ nonce: true })` to replace on each
request. A policy a browser would misread (an empty source list, a source
holding `;`, `,` or a space, a bad directive name, no directive at all) is
refused at startup with a `TypeError` that names the directive.
