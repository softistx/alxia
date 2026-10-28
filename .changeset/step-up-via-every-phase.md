---
'@alxia/react-router': patch
---

`dialogPropsOf` and `useStepUpReplay`'s `dialogProps` keep `via` in every phase once a challenge was granted (`code`, `expired`, `failed`, `confirmed`), not only in `code`, so a dialog can tell a mailed code from an authenticator-app code to offer "send a new code" or "retry".
