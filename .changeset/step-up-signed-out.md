---
'@alxia/react-router': minor
---

`stepUpSteps({ onSignedOut: 'sign-in' })`: `route` now owns a signed-out user. An `UNAUTHENTICATED` answer (`codes.unauthenticated`) or a bare 401 redirects to sign-in with `next` from a same-site `Referer` (else the route's own path), while a wrong code stays a refusal and a second-factor-required answer is never a redirect.
