---
'@alxia/create': patch
---

The `api` and `graphql` templates have a `src/env.spec.ts` that feeds `env.ts` a malformed `TRUSTED_PROXIES` and checks the error naming the entry, and the troubleshooting page has an entry for the 403 an untrusted peer gets.
