---
"@alxia/create": minor
---

The `api` and `graphql` templates take an optional `TRUSTED_PROXIES`. In `src/env.ts` (`defineEnv`) it is comma-separated CIDR ranges or addresses, each validated, listed in `.env.example`; set, `src/context.ts`'s base is built with `proxy: trustProxy({ trusted, untrusted: 'refuse' })`, so a trusted proxy's `X-Forwarded-For` sets `ctx.ip` and a forwarding header from any other connection is refused, while a request with none, a health probe's, passes. Unset, nothing changes. Each template has a `src/proxy.spec.ts` that calls `app.fetch` with a stub peer; the READMEs, the guide and the deploying recipe say how.
