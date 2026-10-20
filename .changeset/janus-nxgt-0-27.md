---
'@alxia/janus': patch
---

Accepts `@nxgt/janus` from 0.17.1 up to 0.27 (the peer range was `^0.17.1`, which no 0.x minor beyond it satisfies), tested against 0.27.0 and 0.17.1. `janusErrors()` answers `MAIL_THROTTLED` (429, added in `@nxgt/janus` 0.18) with `retryAfter` in the body, as it does for a throttled sign-in; the `Retry-After` header was already set.
