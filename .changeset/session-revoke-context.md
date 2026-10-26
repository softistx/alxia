---
'@alxia/react-router': minor
---

`signInFlow`'s `revoke` can now receive the caller's context, such as the visitor's resolved address and language, which a bare `Request` cannot carry. `revoke(token, request, context)` gets it as a third argument, and `signOut`, `revokeSession`, `landReplacing`, `signInStep` and `authLinks`' `landByLink` and `afterReset` take an optional `context` to pass along (for example `{ context: alxiaOf(context) }`). Annotate the `revoke` parameter and the type is inferred for every step. Without a context, `revoke` receives `undefined`, and a two-parameter callback keeps working.
