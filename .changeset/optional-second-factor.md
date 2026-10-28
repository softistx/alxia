---
"@alxia/react-router": minor
---

`/session`: the second factor is optional. `sessionCookies` takes no `challenge` (and returns `SessionCookies<false>`, with no `challengeOf`, `commitChallenge` or `destroyChallenge` on the type), and `signInFlow` takes no `attemptsLeft` (and returns `SignInFlow<L, C, false>`, with no `attemptsLeft`, `codeRefusal`, `readCodeInput` or `codeStep`). Without one, a `secondFactor` answer lands nowhere (`landing` returns `null`) and no challenge cookie is set or cleared. The two go together: `signInFlow` throws when only one is given. New types: `SessionCookiesWithoutChallengeOptions`, `SignInFlowWithoutSecondFactorOptions`, `SecondFactorSteps`, `ChallengeCookies`, `SessionCookiesBase`, `SignInFlowBase`. An app with a second factor is unchanged. Additive.
