---
'@alxia/react-router': minor
---

Add `@alxia/react-router/session` and `/session/model`: the session of an app that is the backend of its own pages (a BFF) over a GraphQL API that signs users in with `@nxgt/janus`, with the token in an HttpOnly cookie. They speak janus's words (`signedIn`, `secondFactor`, `CODE_INVALID`, `via: 'email' | 'secondFactor'`) without importing it, and add no peer. See the new session guide.

- `/session/model` imports nothing, so it is safe in a component as well as a loader: `safeNext` and `signInPath` (a redirect after sign-in that stays on the site), `secondFactorPath`, `TOTP_CODE`, and the step-up's answers and state (`stepUpReducer`, `phaseOf`, `stepUpProps`).
- `/session` imports `react-router` and `/errors`' files, nothing else:
  - `sessionCookies` names, writes, reads and removes the session and the second-factor challenge cookies (`__Host-` and `__Secure-` when `secure`), in the bytes an app that wrote its own cookies already sends, so live sessions survive adopting it; `serializeCookie`, `readCookie` and `secondsUntil` are exported for the cookies of your own.
  - `signInFlow` is where a sign-in lands (`landing`, `landReplacing`, which revokes the session the browser held), `signInStep` (an API refusal as the form's message, an unreachable API as a 503), the second factor (`readCodeInput`, `codeStep`, `codeRefusal` with the tries left), `viewer` and `requireViewer`, and `signOut` (JSON and same-origin only).
  - `stepUpSteps` is the step-up's two steps for a route action: `request` (a challenge and how it is confirmed) and `confirm` (`invalid` with `attemptsLeft`, `expired`, `failed`; with no try left a mailed code is `expired` and an app or recovery code is `locked`), plus `isStepUpRequired` and the `codes` option. The challenge stays in the fetcher's answer, never in a URL or the loader's data.
  - `authLinks` is the server side of the pages a mail's link opens (a magic link, a password reset, an invitation): `linkArgs`, `spendToken`, `answerOf`, `landByLink`, `afterReset`, `requestLink`, `statePath` and `ended`; `TOKEN_PAGE_HEADERS` (`Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`) is for the token pages.
- `/errors` gains `attemptsLeftOf(error)`, the tries a refused code leaves (`extensions.attemptsLeft`, else `params.attemptsLeft`).
