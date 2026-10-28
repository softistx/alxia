---
'@alxia/react-router': minor
---

`authLinks`' `codes.mailThrottled` accepts a list of codes as well as one: each listed 429 code exposes its `retryAfter` to the page, so an API that throttles per address and per e-mail gets a countdown on both. The single code keeps working.
