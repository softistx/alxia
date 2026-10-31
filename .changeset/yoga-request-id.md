---
"@alxia/graphql": patch
---

On `graphql-yoga` 6, never believe a client-sent `x-request-id`: the endpoint sets `requestId: false` (an app that turns it on keeps `trustHeader: false`), so the header is neither echoed in the response nor logged. `logging` now defaults to `'warn'`, so Yoga 6's per-request INFO "Request processed" line is off unless asked for. Yoga 5 ignores `requestId`; the `'warn'` logging default applies on both majors, so apps which never set `logging` stop seeing Yoga's info lines (pass `logging: true` or `'info'` to get them back).
