---
"@alxia/react-router": minor
---

`stepUpSteps` takes the sign-in shape it reads: `options.signIn` is typed `StepUpSignIn` (`errors`, `json`, `attemptsLeft`, and `signInRedirect` for `onSignedOut: 'sign-in'`) instead of a full `SignInFlow`, so an app with a hand-written sign-in needs no `as unknown as SignInFlow` cast. A `signInFlow(...)` still fits. `onSignedOut: 'sign-in'` without `signInRedirect` throws a `TypeError` when `stepUpSteps` is called. `StepUpSignIn` is exported.
