---
'@alxia/react-router': minor
---

New subpath `@alxia/react-router/session/react`: the page's hooks around the session flows, which apps each wrote their own copy of. `useSignOut({ action?, before? })` posts the JSON sign-out and returns `{ signOut, busy }` (a failing `before` never keeps the user signed in); `useLinkParam(name, { drop? })` reads a mail link's query parameter once and can remove it from the address bar with `history.replaceState`; `useCodeField(schema, refusal)` is a one-code field (TOTP or recovery) over any synchronous Standard Schema that clears the refused code and refocuses on each new refusal, and `useOnRefusal(refusal, handler)` is the form-library-agnostic core under it, for react-hook-form and the like. Additive: `react` and `react-router` are already peers, and no form library is added.
