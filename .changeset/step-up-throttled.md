---
'@alxia/react-router': minor
---

`stepUpSteps` maps a rate limit to `error: 'throttled'`: `request` answers it for any 429 (not only the `MAIL_THROTTLED` code), and `confirm` answers it too, with `retryAfter` in seconds when the API says. `StepUpConfirmAnswer` gains an optional `retryAfter`, and `stepUpReducer` keeps the challenge, the tries and the code form on a throttled code and holds `retryAfter` (`stepUpProps` already passes it on), so `@nxgt/material`'s `VerificationCode` and `StepUpDialog` make Resend wait without locking. Additive types: nothing existing changes shape. Behaviour: a 429 that used to answer `failed` (`request`) or `invalid` / `failed` (`confirm`, even under the wrong-code code) now answers `throttled`; a consumer that branches on those for a 429 must handle `throttled`. The second-factor kind is already `'code' | 'recovery'`.
