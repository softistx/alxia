---
'@alxia/core': minor
---

Every route hook reads the request's cookies: `cookies` is on `BaseContext`, a `Readonly<Record<string, string>>` parsed from the `Cookie` header on first read, so a `derive`, `wrap`, `onError`, `onRefusal` or guard no longer parses the header itself. A route's `cookies` schema still gives its handler the validated values; its hooks keep reading the cookies as they arrived. `set.cookies` is now typed `ResponseCookies`, Bun's `CookieMap` whose `get` and `has` say in their JSDoc that they read the response's cookies, never the request's: the trap of `set.cookies.get()` returning `null` in a hook.

Two edges to know. A handler's context on a route whose `cookies` schema outputs anything but strings is no longer assignable to `BaseContext` (whose `cookies` are strings): pass a helper typed `(ctx: BaseContext) => …` the fields it reads, or type it `Omit<BaseContext, 'cookies'>`. And a `derive` returning `cookies` now reaches a handler with no `cookies` schema, which it used to see overwritten by the parsed header, and a `cookies` schema validates that map rather than the header.
