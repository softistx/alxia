---
'@alxia/react-router': minor
---

`createSubscriptionProxy`'s `headers` function now receives the route's loader or action arguments as a second argument, `headers(request, { request, context, params })`, so a BFF can send the trusted client address from its context (`X-Forwarded-For` from `alxiaOf(context).ip`) and the language its session chose, instead of copying a header the browser could forge. `createSubscriptionProxy<Context>`, `SubscriptionProxy<Context>` and the new `SubscriptionArgs` type carry the context's type. A `(request) => headers` function, a record and `Headers` keep working, and the context never reaches the browser or the API.
