---
"@alxia/cache": minor
---

`cache()` no longer keeps the answer to a request carrying `Authorization` or `Cookie` (RFC 9111 §3.5): a bearer API's `/me` behind the cache served the first caller's body to every later one. Such a response is kept only when its `Cache-Control` says `public`, `s-maxage` or `must-revalidate`, or when the key tells senders apart: `vary` naming the header, or, for `Cookie` only, a `key` of the app's own. Not kept, it is sent with no `X-Cache`, as a `private` response is.
