---
'@alxia/core': minor
---

Let an app answer the 403 of `trustProxy({ untrusted: 'refuse' | 'refuse-all' })` itself: `trustProxy({ refusal: ({ request, url, ip, refusal }) => new Response('forbidden', { status: 403 }) })`. The default body is unchanged, and a throw or another status ends in the app's 500.
