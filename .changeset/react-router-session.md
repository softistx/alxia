---
'@alxia/react-router': minor
---

Add `@alxia/react-router/session` and `/session/model`, the session of an app that is the backend of its own pages (a BFF) over a GraphQL API that signs users in with `@nxgt/janus`, in janus's words (`signedIn`, `secondFactor`, `CODE_INVALID`, `via: 'email' | 'secondFactor'`).

- `/session/model` imports nothing: `safeNext` and `signInPath` (a redirect after sign-in that stays on the site), `secondFactorPath`, `TOTP_CODE`, and the step-up's answers and state (`stepUpReducer`, `phaseOf`, `stepUpProps`).
- `/session` has `sessionCookies` (the session and the second-factor challenge, `__Host-` and `__Secure-` when `secure`) and `signInFlow`: where a sign-in's answer lands (`landing`, `landReplacing`, which revokes the session the browser held), `signInStep` (an API refusal as the form's message, an unreachable API as a 503), the second factor (`readCodeInput` reading `{ kind: 'code' | 'recovery', code }`, `codeStep`, `codeRefusal` with the tries left), `viewer` and `requireViewer`, and `signOut` (JSON and same-origin only). It imports `react-router` and `/errors`' files, nothing else, and adds no peer.
- `/errors` gains `attemptsLeftOf(error)`, the tries a refused code leaves (`extensions.attemptsLeft`, else `params.attemptsLeft`).
